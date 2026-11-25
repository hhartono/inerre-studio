import asyncio
import io
import logging
import uuid
import zipfile
from datetime import datetime, timezone
from typing import List, Optional

import requests
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Response, UploadFile
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool

try:
    from backend.clerk_auth import require_user
    from backend import storage, rs_engine as eng
    from backend.rs_grade import grade_bytes
except ModuleNotFoundError:
    from clerk_auth import require_user
    import storage
    import rs_engine as eng
    from rs_grade import grade_bytes

logger = logging.getLogger("inerre.rs")
router = APIRouter(prefix="/api/rs")
CTX: dict = {}
ACTIVE = ("queued", "analyzing", "rendering", "processing")
_sem = asyncio.Semaphore(2)
_tasks: set = set()

CATEGORIES = ["Natural veneer", "Engineered veneer", "HPL", "Painted finishes", "Cat duco", "Stone", "Sintered stone",
              "Marble", "Travertine", "Fabric", "Leather", "Metal", "Glass", "Mirror"]
SEED_MATERIALS = [
    ("MAT-001", "Autumn Oak Veneer", "Natural veneer"), ("MAT-002", "Lamitak Bruno Caraceni", "HPL"),
    ("MAT-003", "Smoky Walnut Veneer", "Natural veneer"), ("MAT-004", "Autumn Oak CNC-Routed Veneer", "Natural veneer"),
    ("MAT-005", "Lamitak Lissoni Travertine", "HPL"), ("MAT-006", "AICA R Walnut", "HPL"),
    ("MAT-008", "Cat Duco Espresso", "Cat duco"), ("MAT-009", "Cat Duco Acid", "Cat duco"), ("MAT-010", "Dekton Kelya", "Sintered stone"),
]
SEED_AMBIENCES = [
    ("Natural Daylight", "Bright, even natural daylight through the openings; true-to-life colours.", "Neutral 5200-5600K", "Balanced, no clipped windows", "Medium, natural", "Soft and directional from windows", "Dominant, clean daylight", "Off or very subtle", "Natural material colours", "Yellow cast, orange glow, CGI glare"),
    ("Warm Cozy", "Warm layered lighting, intimate and inviting.", "Warm 3800-4200K overall, neutral ceilings", "Slightly lower", "Medium-soft", "Soft, enveloping", "Low evening daylight", "Warm 2700-3000K, glowing coves and lamps", "Warm wood, cream, taupe", "Heavy orange cast, muddy shadows"),
    ("Quiet Luxury", "Calm, refined, restrained light with gentle gradients.", "Neutral-warm 4300-4800K", "Balanced", "Low-medium, gentle", "Very soft, long gradients", "Soft diffused daylight", "Subtle warm accents", "Greige, ivory, warm taupe, charcoal", "Glossy CGI look, high contrast, saturation"),
    ("Editorial Neutral", "Magazine-grade neutral light, crisp and clean.", "Neutral 5000K, white walls stay white", "Bright, airy", "Medium", "Soft but defined", "Clean daylight", "Minimal", "Neutral whites and natural materials", "Colour casts, haze"),
    ("Soft Morning", "Low early sun, fresh and airy atmosphere.", "Cool-neutral 5500-6000K", "Bright highlights, open shadows", "Low", "Very soft", "Low-angle morning sun with gentle light beams", "Off", "Fresh whites, pale woods", "Harsh sun patches"),
    ("Balanced Afternoon", "Even afternoon light, balanced interior and exterior exposure.", "Neutral 5000-5300K", "Balanced", "Medium", "Medium-soft", "Afternoon daylight", "Subtle fill", "Natural palette", "Blown windows, flat look"),
    ("Moody Evening", "Dusk mood, artificial light leads, deep but readable shadows.", "Warm interior 3000K vs blue exterior", "Lower, rich", "Medium-high", "Soft pools of light", "Blue hour dusk outside", "Warm cove and lamp light, visible fixture glow", "Deep woods, charcoal, warm highlights", "Crushed blacks, orange cast"),
    ("Luxury Hospitality", "Five-star hotel ambience, layered and glamorous yet natural.", "Warm-neutral 3500-4000K", "Balanced", "Medium-high", "Soft", "Subtle", "Layered warm accent lighting", "Rich woods, stone, brass", "Over-glossy reflections, clutter"),
    ("Architectural Photography", "Professional architectural photo: straight verticals, true colours, crisp detail.", "Neutral 5000-5500K", "Balanced HDR without halos", "Medium", "Natural", "Daylight", "As designed", "True material colours", "Lens distortion, HDR halos, CGI look"),
]
AMB_FIELDS = ("description", "lighting", "white_balance", "exposure", "contrast", "shadows", "natural_light", "artificial_light", "palette", "avoid")
MATV_FIELDS = ("base_color", "grain_direction", "texture_scale", "roughness", "reflection", "finish", "instructions", "negative")
DEFAULT_SETTINGS = {
    "id": "settings", "draft_model": "gpt-image-2.6-flare", "final_model": "gpt-image-2.6-sunburst", "custom_model": "",
    "vision_model": "gpt-5.5", "draft_quality": "medium", "final_quality": "high",
    "price_in_per_m": 0.0, "price_out_per_m": 0.0, "monthly_budget_usd": 0.0, "base_instruction": eng.DEFAULT_INSTRUCTION,
}


def db():
    return CTX["db"]


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def new_id() -> str:
    return uuid.uuid4().hex


# ---------- auth ----------
async def staff(user: dict = Depends(require_user)) -> dict:
    m = await CTX["current_member"](user)
    if m["role"] not in ("admin", "designer"):
        raise HTTPException(403, "Hanya admin dan desainer")
    return m


async def admin(m: dict = Depends(staff)) -> dict:
    if m["role"] != "admin":
        raise HTTPException(403, "Hanya admin / creative director")
    return m


# ---------- helpers ----------
async def one(coll: str, doc_id: str) -> dict:
    d = await db()[coll].find_one({"id": doc_id}, {"_id": 0})
    if not d:
        raise HTTPException(404, "Data tidak ditemukan")
    return d


def urls(fid):
    return {"url": storage.signed_url(fid), "thumb": storage.signed_url(fid, "thumb")} if fid else {"url": None, "thumb": None}


async def store_bytes(data: bytes, scope: str, kind: str, mime: str = "image/png", name: str = "") -> dict:
    try:
        proc = await run_in_threadpool(storage.process_image, data)
    except Exception:  # noqa: BLE001
        raise HTTPException(400, "Gambar tidak bisa dibaca")
    fid = new_id()
    ext = {"image/png": "png", "image/jpeg": "jpg", "image/webp": "webp"}.get(mime, "bin")
    base = f"{storage.APP_NAME}/rs/{scope}/{fid}"
    paths = {}
    try:
        for variant, payload, mt in (("original", data, mime), ("web", proc["web"], "image/webp"), ("thumb", proc["thumb"], "image/webp")):
            res = await run_in_threadpool(storage.put_object, f"{base}/{variant}.{ext if variant == 'original' else 'webp'}", payload, mt)
            paths[variant] = res["path"]
    except requests.RequestException as e:
        logger.error(f"Storage upload failed: {e}")
        raise HTTPException(502, "Penyimpanan gambar sedang bermasalah. Coba lagi.")
    doc = {"id": fid, "project_id": f"rs:{scope}", "kind": kind, "original_filename": name, "content_type": mime, "paths": paths,
           "width": proc["width"], "height": proc["height"], "aspect": proc["aspect"], "is_deleted": False, "created_at": now_iso()}
    await db().files.insert_one({**doc})
    return doc


async def read_upload(file: UploadFile) -> bytes:
    data = await file.read()
    if not data:
        raise HTTPException(400, "File kosong")
    if len(data) > 50 * 1024 * 1024:
        raise HTTPException(413, "File terlalu besar (maks 50 MB)")
    if not (file.content_type or "").startswith("image/"):
        raise HTTPException(400, "File harus berupa gambar")
    return data


async def file_bytes(fid: str) -> bytes:
    rec = await db().files.find_one({"id": fid, "is_deleted": False}, {"_id": 0, "paths": 1})
    if not rec:
        raise eng.EngineError("File referensi tidak ditemukan.")
    return await run_in_threadpool(storage.get_object, rec["paths"]["original"])


async def get_settings() -> dict:
    s = await db().rs_settings.find_one({"id": "settings"}, {"_id": 0})
    return {**DEFAULT_SETTINGS, **(s or {})}


def month_key() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m")


async def month_spend(extra: dict = None) -> float:
    q = {"month": month_key(), **(extra or {})}
    agg = await db().rs_usage.aggregate([{"$match": q}, {"$group": {"_id": None, "c": {"$sum": "$cost_est"}}}]).to_list(1)
    return float(agg[0]["c"]) if agg else 0.0


async def check_budget(project: Optional[dict]):
    s = await get_settings()
    if s["monthly_budget_usd"] and await month_spend() >= s["monthly_budget_usd"]:
        raise HTTPException(402, "Anggaran AI bulan ini sudah habis. Admin bisa menaikkannya di Pengaturan.")
    if project and project.get("budget_usd") and await month_spend({"project_id": project["id"]}) >= project["budget_usd"]:
        raise HTTPException(402, "Anggaran AI proyek ini bulan ini sudah habis.")


async def log_usage(kind: str, model: str, usage: dict, member_id: str, project_id: str = None, render_id: str = None, ok: bool = True, error: str = ""):
    s = await get_settings()
    tin, tout = int(usage.get("input_tokens") or usage.get("prompt_tokens") or 0), int(usage.get("output_tokens") or usage.get("completion_tokens") or 0)
    cost = (tin * s["price_in_per_m"] + tout * s["price_out_per_m"]) / 1_000_000
    await db().rs_usage.insert_one({"id": new_id(), "kind": kind, "model": model, "input_tokens": tin, "output_tokens": tout,
                                    "cost_est": round(cost, 5), "priced": bool(s["price_in_per_m"] or s["price_out_per_m"]),
                                    "user_id": member_id, "project_id": project_id, "render_id": render_id, "ok": ok,
                                    "error": error[:300], "month": month_key(), "created_at": now_iso()})
    return round(cost, 5)


def render_out(r: dict) -> dict:
    return {**r, "raw": urls(r.get("raw_file_id")), "graded": urls(r.get("graded_file_id"))}


# ---------- startup ----------
async def startup():
    for c in ("rs_projects", "rs_rooms", "rs_angles", "rs_renders", "rs_materials", "rs_material_versions", "rs_ambiences"):
        await db()[c].create_index("id", unique=True)
    await db().rs_renders.create_index([("angle_id", 1), ("created_at", -1)])
    await db().rs_renders.update_many({"status": {"$in": list(ACTIVE)}},
                                      {"$set": {"status": "failed", "error": "Server dimulai ulang saat render berjalan. Gambar sumber aman — silakan render ulang."}})
    for code, name, cat in SEED_MATERIALS:
        if not await db().rs_materials.find_one({"code": code}):
            mid = new_id()
            await db().rs_materials.insert_one({"id": mid, "code": code, "name": name, "brand": "", "manufacturer_code": "", "category": cat,
                                                "status": "uncalibrated", "seeded": True, "created_at": now_iso()})
            await db().rs_material_versions.insert_one(new_version_doc(mid, 1))
    for row in SEED_AMBIENCES:
        if not await db().rs_ambiences.find_one({"name": row[0]}):
            fields = dict(zip(AMB_FIELDS, row[1:]))
            await db().rs_ambiences.insert_one({"id": new_id(), "name": row[0], "current": 1, "seeded": True, "created_at": now_iso(),
                                                "versions": [{"version_no": 1, **fields, "reference_file_ids": [], "created_at": now_iso(), "created_by": "system"}]})


def new_version_doc(mid: str, no: int, base: dict = None) -> dict:
    base = base or {}
    return {"id": new_id(), "material_id": mid, "version_no": no, "status": "draft", "corrections": [],
            **{k: base.get(k, "") for k in MATV_FIELDS},
            **{k: base.get(k) for k in ("sketchup_file_id", "photo_file_id", "approved_file_id")},
            "extra_file_ids": list(base.get("extra_file_ids", [])), "created_at": now_iso()}


# ---------- meta & settings ----------
@router.get("/meta")
async def meta(_: dict = Depends(staff)):
    return {"protection": eng.PROTECTION_LABELS, "ai_controls": {k: v[0] for k, v in eng.AI_CONTROLS.items()}, "categories": CATEGORIES}


class SettingsIn(BaseModel):
    draft_model: Optional[str] = None
    final_model: Optional[str] = None
    custom_model: Optional[str] = None
    vision_model: Optional[str] = None
    draft_quality: Optional[str] = None
    final_quality: Optional[str] = None
    price_in_per_m: Optional[float] = None
    price_out_per_m: Optional[float] = None
    monthly_budget_usd: Optional[float] = None
    base_instruction: Optional[str] = None


@router.get("/settings")
async def read_settings(_: dict = Depends(staff)):
    return {**(await get_settings()), "key_configured": bool(__import__("os").environ.get("OPENAI_API_KEY"))}


@router.put("/settings")
async def write_settings(body: SettingsIn, _: dict = Depends(admin)):
    upd = {k: (v.strip() if isinstance(v, str) else v) for k, v in body.model_dump().items() if v is not None}
    for q in ("draft_quality", "final_quality"):
        if q in upd and upd[q] not in ("low", "medium", "high", "auto"):
            raise HTTPException(400, "Kualitas harus low/medium/high/auto")
    await db().rs_settings.update_one({"id": "settings"}, {"$set": upd}, upsert=True)
    return await get_settings()


@router.get("/usage")
async def usage(m: dict = Depends(staff)):
    q = {} if m["role"] == "admin" else {"user_id": m["user_id"]}
    rows = await db().rs_usage.find({**q, "month": month_key()}, {"_id": 0}).sort("created_at", -1).to_list(2000)
    by = lambda key: [{"key": k, "count": sum(1 for r in rows if r.get(key) == k), "cost": round(sum(r["cost_est"] for r in rows if r.get(key) == k), 4),
                       "tokens": sum(r["input_tokens"] + r["output_tokens"] for r in rows if r.get(key) == k)} for k in sorted({r.get(key) for r in rows}, key=str)]
    names = {p["id"]: p["name"] for p in await db().rs_projects.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(1000)}
    users = {u["user_id"]: u.get("name") or u.get("email") for u in await db().users.find({}, {"_id": 0, "user_id": 1, "name": 1, "email": 1}).to_list(1000)}
    s = await get_settings()
    return {"month": month_key(), "total_cost": round(sum(r["cost_est"] for r in rows), 4), "priced": bool(s["price_in_per_m"] or s["price_out_per_m"]),
            "budget": s["monthly_budget_usd"], "requests": len(rows), "failed": sum(1 for r in rows if not r["ok"]),
            "by_kind": by("kind"), "by_project": [{**x, "name": names.get(x["key"], "—")} for x in by("project_id")],
            "by_user": [{**x, "name": users.get(x["key"], x["key"])} for x in by("user_id")], "recent": rows[:40]}


# ---------- generic upload ----------
@router.post("/files")
async def upload_file(file: UploadFile = File(...), scope: str = Form("refs"), _: dict = Depends(staff)):
    data = await read_upload(file)
    doc = await store_bytes(data, scope[:40], "rs_ref", file.content_type or "image/png", file.filename or "")
    return {"id": doc["id"], "width": doc["width"], "height": doc["height"], "aspect": doc["aspect"], **urls(doc["id"])}


# ---------- projects ----------
class ProjectIn(BaseModel):
    name: str
    code: str = ""
    client: str = ""
    designer: str = ""


class ProjectPatch(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None
    client: Optional[str] = None
    designer: Optional[str] = None
    description: Optional[str] = None
    concept: Optional[str] = None
    palette: Optional[str] = None
    instructions: Optional[str] = None
    ambience_id: Optional[str] = None
    budget_usd: Optional[float] = None


@router.get("/projects")
async def list_projects(_: dict = Depends(staff)):
    ps = await db().rs_projects.find({}, {"_id": 0}).sort("updated_at", -1).to_list(500)
    out = []
    for p in ps:
        last = await db().rs_renders.find_one({"project_id": p["id"], "status": "completed", "kind": {"$ne": "calibration"}}, {"_id": 0, "raw_file_id": 1, "graded_file_id": 1}, sort=[("created_at", -1)])
        out.append({**p, "angles": await db().rs_angles.count_documents({"project_id": p["id"]}),
                    "renders": await db().rs_renders.count_documents({"project_id": p["id"], "status": "completed"}),
                    "cover": urls(last and (last.get("graded_file_id") or last["raw_file_id"]))})
    return out


@router.post("/projects")
async def create_project(body: ProjectIn, m: dict = Depends(staff)):
    if not body.name.strip():
        raise HTTPException(400, "Nama proyek wajib diisi")
    doc = {"id": new_id(), "name": body.name.strip(), "code": body.code.strip(), "client": body.client.strip(), "designer": body.designer.strip(),
           "description": "", "concept": "", "palette": "", "instructions": "", "ambience_id": None, "master_render_id": None,
           "budget_usd": 0.0, "created_by": m["user_id"], "created_at": now_iso(), "updated_at": now_iso()}
    await db().rs_projects.insert_one({**doc})
    return doc


@router.get("/projects/{pid}")
async def get_project(pid: str, _: dict = Depends(staff)):
    p = await one("rs_projects", pid)
    rooms = await db().rs_rooms.find({"project_id": pid}, {"_id": 0}).sort("order", 1).to_list(500)
    angles = await db().rs_angles.find({"project_id": pid}, {"_id": 0}).sort("order", 1).to_list(2000)
    for a in angles:
        a["source"] = urls(a.get("source_file_id"))
        last = await db().rs_renders.find_one({"angle_id": a["id"]}, {"_id": 0}, sort=[("created_at", -1)])
        a["latest"] = render_out(last) if last else None
    master = await db().rs_renders.find_one({"id": p.get("master_render_id")}, {"_id": 0}) if p.get("master_render_id") else None
    return {**p, "rooms": rooms, "angles": angles, "master": render_out(master) if master else None}


@router.patch("/projects/{pid}")
async def patch_project(pid: str, body: ProjectPatch, _: dict = Depends(staff)):
    await one("rs_projects", pid)
    upd = {k: v for k, v in body.model_dump().items() if v is not None}
    if upd.get("ambience_id") == "":
        upd["ambience_id"] = None
    await db().rs_projects.update_one({"id": pid}, {"$set": {**upd, "updated_at": now_iso()}})
    return await one("rs_projects", pid)


@router.delete("/projects/{pid}")
async def delete_project(pid: str, _: dict = Depends(admin)):
    await one("rs_projects", pid)
    for c in ("rs_rooms", "rs_angles", "rs_renders"):
        await db()[c].delete_many({"project_id": pid})
    await db().rs_projects.delete_one({"id": pid})
    return {"ok": True}


# ---------- rooms & angles ----------
class RoomIn(BaseModel):
    name: str


class RoomPatch(BaseModel):
    name: Optional[str] = None
    instructions: Optional[str] = None
    ambience_id: Optional[str] = None
    clear_master: Optional[bool] = None


@router.post("/projects/{pid}/rooms")
async def create_room(pid: str, body: RoomIn, _: dict = Depends(staff)):
    await one("rs_projects", pid)
    doc = {"id": new_id(), "project_id": pid, "name": body.name.strip()[:80], "instructions": "", "ambience_id": None, "master_render_id": None,
           "order": await db().rs_rooms.count_documents({"project_id": pid}), "created_at": now_iso()}
    await db().rs_rooms.insert_one({**doc})
    return doc


@router.patch("/rooms/{rid}")
async def patch_room(rid: str, body: RoomPatch, _: dict = Depends(staff)):
    await one("rs_rooms", rid)
    upd = {k: v for k, v in body.model_dump(exclude={"clear_master"}).items() if v is not None}
    if upd.get("ambience_id") == "":
        upd["ambience_id"] = None
    if body.clear_master:
        upd["master_render_id"] = None
    await db().rs_rooms.update_one({"id": rid}, {"$set": upd})
    return await one("rs_rooms", rid)


@router.delete("/rooms/{rid}")
async def delete_room(rid: str, _: dict = Depends(staff)):
    await one("rs_rooms", rid)
    await db().rs_renders.delete_many({"room_id": rid})
    await db().rs_angles.delete_many({"room_id": rid})
    await db().rs_rooms.delete_one({"id": rid})
    return {"ok": True}


@router.post("/rooms/{rid}/angles")
async def create_angle(rid: str, file: UploadFile = File(...), name: str = Form(""), _: dict = Depends(staff)):
    room = await one("rs_rooms", rid)
    data = await read_upload(file)
    f = await store_bytes(data, room["project_id"], "rs_source", file.content_type or "image/png", file.filename or "")
    n = await db().rs_angles.count_documents({"room_id": rid})
    doc = {"id": new_id(), "project_id": room["project_id"], "room_id": rid, "name": name.strip() or f"Angle {n + 1:02d}",
           "source_file_id": f["id"], "aspect": f["aspect"], "instructions": "", "materials": [], "references": [],
           "protection": {k: True for k in eng.PROTECTION}, "controls": {}, "order": n, "created_at": now_iso()}
    await db().rs_angles.insert_one({**doc})
    return {**doc, "source": urls(f["id"]), "latest": None}


class MaterialRef(BaseModel):
    material_id: str
    version_no: int
    surface: str = ""


class RefIn(BaseModel):
    file_id: str
    role: str
    note: str = ""


class AnglePatch(BaseModel):
    name: Optional[str] = None
    instructions: Optional[str] = None
    materials: Optional[List[MaterialRef]] = None
    references: Optional[List[RefIn]] = None
    protection: Optional[dict] = None
    controls: Optional[dict] = None


REF_ROLES = {"ambience": "target lighting and ambience only", "approved_angle": "approved render of another angle — match its ambience, lighting and material appearance only",
             "material": "material appearance reference", "furniture": "loose furniture appearance reference — match look, keep shape and position from Image 1",
             "other": "supporting reference"}


@router.patch("/angles/{aid}")
async def patch_angle(aid: str, body: AnglePatch, _: dict = Depends(staff)):
    await one("rs_angles", aid)
    upd = {k: v for k, v in body.model_dump().items() if v is not None}
    for r in upd.get("references", []):
        if r["role"] not in REF_ROLES:
            raise HTTPException(400, "Setiap referensi wajib punya peran yang valid")
        if not await db().files.find_one({"id": r["file_id"], "is_deleted": False}, {"_id": 0, "id": 1}):
            raise HTTPException(400, "File referensi tidak ditemukan")
    for mref in upd.get("materials", []):
        if not await db().rs_material_versions.find_one({"material_id": mref["material_id"], "version_no": mref["version_no"]}):
            raise HTTPException(400, "Versi material tidak ditemukan")
    await db().rs_angles.update_one({"id": aid}, {"$set": upd})
    return await angle_out(await one("rs_angles", aid))


async def angle_out(a: dict) -> dict:
    p = await db().rs_projects.find_one({"id": a["project_id"]}, {"_id": 0, "id": 1, "name": 1, "master_render_id": 1, "ambience_id": 1})
    room = await db().rs_rooms.find_one({"id": a["room_id"]}, {"_id": 0})
    return {**a, "source": urls(a["source_file_id"]), "references": [{**r, **urls(r["file_id"])} for r in a.get("references", [])],
            "project": p, "room": room}


@router.get("/angles/{aid}")
async def get_angle(aid: str, _: dict = Depends(staff)):
    return await angle_out(await one("rs_angles", aid))


@router.post("/angles/{aid}/source")
async def replace_source(aid: str, file: UploadFile = File(...), _: dict = Depends(staff)):
    a = await one("rs_angles", aid)
    data = await read_upload(file)
    f = await store_bytes(data, a["project_id"], "rs_source", file.content_type or "image/png", file.filename or "")
    await db().rs_angles.update_one({"id": aid}, {"$set": {"source_file_id": f["id"], "aspect": f["aspect"]}})
    return {"ok": True, "source": urls(f["id"])}


@router.delete("/angles/{aid}")
async def delete_angle(aid: str, _: dict = Depends(staff)):
    await one("rs_angles", aid)
    await db().rs_renders.delete_many({"angle_id": aid})
    await db().rs_angles.delete_one({"id": aid})
    return {"ok": True}


# ---------- render context ----------
async def ambience_for(project: dict, room: dict) -> Optional[dict]:
    amb_id = room.get("ambience_id") or project.get("ambience_id")
    if not amb_id:
        return None
    a = await db().rs_ambiences.find_one({"id": amb_id}, {"_id": 0})
    if not a:
        return None
    v = next((x for x in a["versions"] if x["version_no"] == a["current"]), a["versions"][-1])
    return {"id": a["id"], "name": a["name"], **v}


async def build_job(angle: dict, opts: dict, parent: Optional[dict] = None, revision: str = "", region: dict = None) -> dict:
    project = await one("rs_projects", angle["project_id"])
    room = await one("rs_rooms", angle["room_id"])
    s = await get_settings()
    images, roles = [], []
    if region and parent:
        images.append(parent["raw_file_id"]); roles.append("the previous render to edit — change only the transparent masked area")
        images.append(angle["source_file_id"]); roles.append("original SketchUp design (geometry reference only)")
    else:
        images.append(angle["source_file_id"]); roles.append("source geometry, camera, composition and furniture placement (primary, authoritative)")
        if parent:
            images.append(parent["raw_file_id"]); roles.append("previous render version — keep it identical except for the requested revision")
    master_id = room.get("master_render_id") or project.get("master_render_id")
    master_note = ""
    if master_id and (not parent or parent["id"] != master_id):
        mr = await db().rs_renders.find_one({"id": master_id}, {"_id": 0})
        if mr and mr.get("raw_file_id") and mr["angle_id"] != angle["id"]:
            images.append(mr.get("graded_file_id") or mr["raw_file_id"]); roles.append("PROJECT AMBIENCE MASTER — target lighting, white balance and atmosphere only")
            master_note = "Match the lighting, white balance, exposure and atmosphere of the project ambience master image exactly."
    amb = await ambience_for(project, room)
    if amb and not master_note:
        for fid in amb.get("reference_file_ids", [])[:2]:
            images.append(fid); roles.append(f"ambience preset reference ({amb['name']}) — target lighting and ambience only")
    mats, mat_snap = [], []
    for mref in angle.get("materials", []):
        mat = await db().rs_materials.find_one({"id": mref["material_id"]}, {"_id": 0})
        ver = await db().rs_material_versions.find_one({"material_id": mref["material_id"], "version_no": mref["version_no"]}, {"_id": 0})
        if not mat or not ver:
            continue
        mats.append({**mat, **{k: ver.get(k) for k in MATV_FIELDS}, "version_no": ver["version_no"], "surface": mref.get("surface", "")})
        mat_snap.append({"material_id": mat["id"], "code": mat["code"], "name": mat["name"], "version_no": ver["version_no"], "status": ver["status"], "surface": mref.get("surface", "")})
        ref = ver.get("approved_file_id") or ver.get("photo_file_id")
        if ref and len(images) < 15:
            images.append(ref); roles.append(f"material reference for {mat['code']} {mat['name']}{' on ' + mref['surface'] if mref.get('surface') else ''} — appearance only")
    for r in angle.get("references", []):
        if len(images) >= 16:
            break
        images.append(r["file_id"]); roles.append(REF_ROLES[r["role"]] + (f" ({r['note']})" if r.get("note") else ""))
    mode = opts.get("mode") or "draft"
    model = {"draft": s["draft_model"], "final": s["final_model"], "custom": s["custom_model"]}.get(mode) or s["draft_model"]
    if mode == "custom" and not s["custom_model"]:
        raise HTTPException(400, "Model custom belum diatur admin.")
    quality = opts.get("quality") or (s["final_quality"] if mode == "final" else s["draft_quality"])
    protection = opts.get("protection") or angle.get("protection") or {}
    controls = opts.get("controls") if opts.get("controls") is not None else angle.get("controls") or {}
    prompt = eng.compile_prompt({
        "base_instruction": s["base_instruction"], "image_roles": roles, "protection": protection, "ambience": amb, "master_note": master_note,
        "materials": mats, "project_instructions": "\n".join(x for x in [project.get("concept") and f"Design concept: {project['concept']}",
                                                                          project.get("palette") and f"Material palette: {project['palette']}", project.get("instructions")] if x),
        "room_instructions": room.get("instructions"), "angle_instructions": angle.get("instructions"),
        "controls": controls, "extra": opts.get("extra", ""), "revision": revision, "region": region})
    return {"id": new_id(), "project_id": project["id"], "room_id": room["id"], "angle_id": angle["id"], "parent_id": parent["id"] if parent else None,
            "kind": "local" if region else "revision" if parent else "render", "status": "queued", "error": "", "mode": mode, "model": model,
            "quality": quality, "size": eng.size_for(angle.get("aspect") or 1.5), "prompt": prompt, "image_ids": images, "image_roles": roles,
            "materials": mat_snap, "ambience": {"id": amb["id"], "name": amb["name"], "version_no": amb["version_no"]} if amb else None,
            "master_render_id": master_id if master_note else None, "protection": protection, "controls": controls, "extra": opts.get("extra", ""),
            "revision": revision, "region": region, "approval": "pending", "feedback": [], "adjust": {}, "raw_file_id": None, "graded_file_id": None,
            "usage": {}, "cost_est": 0.0}


async def run_job(job_id: str):
    async with _sem:
        job = await db().rs_renders.find_one({"id": job_id}, {"_id": 0})
        set_ = lambda **kw: db().rs_renders.update_one({"id": job_id}, {"$set": kw})
        try:
            await set_(status="analyzing", started_at=now_iso())
            imgs = [await run_in_threadpool(eng.to_png, await file_bytes(fid)) for fid in job["image_ids"]]
            mask = await run_in_threadpool(eng.rect_mask, imgs[0], job["region"]) if job.get("region") else None
            await set_(status="rendering")
            out, usage = await eng.image_edit(imgs, job["prompt"], job["model"], job["quality"], job["size"], mask)
            await set_(status="processing")
            parent_bytes = await file_bytes(job["image_ids"][0]) if job.get("region") else None
            out = await run_in_threadpool(eng.finalize, out, parent_bytes, job.get("region"))
            f = await store_bytes(out, job["project_id"] or "calibration", "rs_render", "image/png", f"{job_id}.png")
            cost = await log_usage(job["kind"], job["model"], usage, job["created_by"], job["project_id"], job_id)
            await set_(status="completed", raw_file_id=f["id"], width=f["width"], height=f["height"], usage=usage, cost_est=cost, completed_at=now_iso())
        except eng.EngineError as e:
            await log_usage(job["kind"], job["model"], {}, job["created_by"], job["project_id"], job_id, ok=False, error=str(e))
            await set_(status="failed", error=str(e))
        except Exception as e:  # noqa: BLE001
            logger.exception("render job failed")
            await set_(status="failed", error=f"Kesalahan sistem: {type(e).__name__}. Gambar sumber tetap aman.")


async def enqueue(job: dict, member: dict) -> dict:
    job.update({"created_by": member["user_id"], "created_by_name": member.get("name") or member.get("email", ""), "created_at": now_iso()})
    q = {"angle_id": job["angle_id"]} if job.get("angle_id") else {"material_version_id": job["material_version_id"]}
    prev = await db().rs_renders.find(q, {"_id": 0, "version_no": 1}).sort("version_no", -1).limit(1).to_list(1)
    job["version_no"] = (prev[0]["version_no"] + 1) if prev else 1
    await db().rs_renders.insert_one({**job})
    t = asyncio.create_task(run_job(job["id"]))
    _tasks.add(t)
    t.add_done_callback(_tasks.discard)
    return render_out(job)


async def guard_active(q: dict):
    if await db().rs_renders.find_one({**q, "status": {"$in": list(ACTIVE)}}, {"_id": 0, "id": 1}):
        raise HTTPException(409, "Masih ada render yang berjalan untuk item ini. Tunggu sampai selesai.")


class RenderIn(BaseModel):
    mode: str = "draft"
    quality: Optional[str] = None
    extra: str = ""
    protection: Optional[dict] = None
    controls: Optional[dict] = None


@router.post("/angles/{aid}/render")
async def render_angle(aid: str, body: RenderIn, m: dict = Depends(staff)):
    angle = await one("rs_angles", aid)
    await guard_active({"angle_id": aid})
    await check_budget(await one("rs_projects", angle["project_id"]))
    return await enqueue(await build_job(angle, body.model_dump()), m)


@router.get("/angles/{aid}/prompt-preview")
async def prompt_preview(aid: str, _: dict = Depends(admin)):
    job = await build_job(await one("rs_angles", aid), {})
    return {"prompt": job["prompt"], "image_roles": job["image_roles"], "model": job["model"], "size": job["size"], "materials": job["materials"]}


class SeriesIn(RenderIn):
    angle_ids: List[str]


@router.post("/projects/{pid}/series")
async def render_series(pid: str, body: SeriesIn, m: dict = Depends(staff)):
    project = await one("rs_projects", pid)
    await check_budget(project)
    out, skipped = [], []
    for aid in body.angle_ids[:30]:
        angle = await db().rs_angles.find_one({"id": aid, "project_id": pid}, {"_id": 0})
        if not angle or await db().rs_renders.find_one({"angle_id": aid, "status": {"$in": list(ACTIVE)}}):
            skipped.append(aid)
            continue
        out.append(await enqueue(await build_job(angle, body.model_dump(exclude={"angle_ids"})), m))
    return {"jobs": out, "skipped": skipped}


class ReviseIn(BaseModel):
    instruction: str
    region: Optional[dict] = None
    mode: str = "draft"
    quality: Optional[str] = None


@router.post("/renders/{rid}/revise")
async def revise(rid: str, body: ReviseIn, m: dict = Depends(staff)):
    parent = await one("rs_renders", rid)
    if parent["status"] != "completed" or not parent.get("raw_file_id"):
        raise HTTPException(400, "Render ini belum selesai")
    if not body.instruction.strip():
        raise HTTPException(400, "Tulis instruksi revisi")
    reg = body.region
    if reg is not None:
        try:
            reg = {k: max(0.0, min(1.0, float(reg[k]))) for k in ("x", "y", "w", "h")}
        except (KeyError, TypeError, ValueError):
            raise HTTPException(400, "Area pilihan tidak valid")
        if reg["w"] < 0.02 or reg["h"] < 0.02:
            raise HTTPException(400, "Area pilihan terlalu kecil")
    angle = await one("rs_angles", parent["angle_id"])
    await guard_active({"angle_id": angle["id"]})
    await check_budget(await one("rs_projects", angle["project_id"]))
    job = await build_job(angle, {"mode": body.mode, "quality": body.quality or parent.get("quality"), "protection": parent.get("protection"), "controls": parent.get("controls"), "extra": parent.get("extra", "")},
                          parent=parent, revision=body.instruction.strip(), region=reg)
    return await enqueue(job, m)


@router.get("/angles/{aid}/renders")
async def angle_renders(aid: str, _: dict = Depends(staff)):
    rows = await db().rs_renders.find({"angle_id": aid}, {"_id": 0}).sort("version_no", -1).to_list(500)
    return [render_out(r) for r in rows]


@router.get("/renders/{rid}")
async def get_render(rid: str, _: dict = Depends(staff)):
    return render_out(await one("rs_renders", rid))


@router.get("/history")
async def history(project_id: str = "", approval: str = "", _: dict = Depends(staff)):
    q = {"kind": {"$ne": "calibration"}}
    if project_id:
        q["project_id"] = project_id
    if approval:
        q["approval"] = approval
    rows = await db().rs_renders.find(q, {"_id": 0, "prompt": 0}).sort("created_at", -1).to_list(300)
    names = {p["id"]: p["name"] for p in await db().rs_projects.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(1000)}
    angles = {a["id"]: a["name"] for a in await db().rs_angles.find({"id": {"$in": list({r["angle_id"] for r in rows})}}, {"_id": 0, "id": 1, "name": 1}).to_list(5000)}
    rooms = {a["id"]: a["name"] for a in await db().rs_rooms.find({"id": {"$in": list({r["room_id"] for r in rows})}}, {"_id": 0, "id": 1, "name": 1}).to_list(5000)}
    return [{**render_out(r), "project_name": names.get(r["project_id"], "—"), "angle_name": angles.get(r["angle_id"], "—"), "room_name": rooms.get(r["room_id"], "—")} for r in rows]


class ReviewIn(BaseModel):
    approval: Optional[str] = None
    feedback: str = ""


@router.patch("/renders/{rid}/review")
async def review(rid: str, body: ReviewIn, m: dict = Depends(staff)):
    r = await one("rs_renders", rid)
    upd: dict = {}
    if body.approval:
        if body.approval not in ("pending", "approved", "rejected"):
            raise HTTPException(400, "Status tidak valid")
        if r["status"] != "completed":
            raise HTTPException(400, "Render belum selesai")
        upd = {"approval": body.approval, "reviewed_by": m.get("name") or m.get("email"), "reviewed_at": now_iso()}
    push = {"feedback": {"text": body.feedback.strip(), "by": m.get("name") or m.get("email"), "approval": body.approval, "at": now_iso()}} if body.feedback.strip() else None
    await db().rs_renders.update_one({"id": rid}, {"$set": upd, **({"$push": push} if push else {})})
    return render_out(await one("rs_renders", rid))


class GradeIn(BaseModel):
    adjust: dict


@router.post("/renders/{rid}/grade")
async def grade(rid: str, body: GradeIn, _: dict = Depends(staff)):
    r = await one("rs_renders", rid)
    if not r.get("raw_file_id"):
        raise HTTPException(400, "Render belum selesai")
    adjust = {k: max(-100, min(100, int(v))) for k, v in body.adjust.items() if isinstance(v, (int, float))}
    if not any(adjust.values()):
        await db().rs_renders.update_one({"id": rid}, {"$set": {"adjust": {}, "graded_file_id": None}})
        return render_out(await one("rs_renders", rid))
    out = await run_in_threadpool(grade_bytes, await file_bytes(r["raw_file_id"]), adjust, "PNG")
    f = await store_bytes(out, r["project_id"] or "calibration", "rs_graded", "image/png", f"{rid}-graded.png")
    await db().rs_renders.update_one({"id": rid}, {"$set": {"adjust": adjust, "graded_file_id": f["id"]}})
    return render_out(await one("rs_renders", rid))


@router.get("/renders/{rid}/download")
async def download(rid: str, variant: str = Query("graded"), fmt: str = Query("png"), _: dict = Depends(staff)):
    r = await one("rs_renders", rid)
    fid = r.get("graded_file_id") if variant == "graded" and r.get("graded_file_id") else r.get("raw_file_id")
    if variant == "source":
        a = await one("rs_angles", r["angle_id"])
        fid = a["source_file_id"]
    if not fid:
        raise HTTPException(404, "Gambar belum ada")
    data = await file_bytes(fid)
    if fmt == "jpeg":
        data = await run_in_threadpool(_to_jpeg, data)
    name = f"INERRE-{r.get('version_no', 1):02d}-{variant}.{'jpg' if fmt == 'jpeg' else 'png'}"
    return Response(content=data, media_type="image/jpeg" if fmt == "jpeg" else "image/png",
                    headers={"Content-Disposition": f'attachment; filename="{name}"'})


def _to_jpeg(data: bytes) -> bytes:
    from PIL import Image
    buf = io.BytesIO()
    Image.open(io.BytesIO(data)).convert("RGB").save(buf, "JPEG", quality=95)
    return buf.getvalue()


@router.get("/projects/{pid}/approved.zip")
async def approved_zip(pid: str, _: dict = Depends(staff)):
    p = await one("rs_projects", pid)
    rows = await db().rs_renders.find({"project_id": pid, "approval": "approved", "status": "completed"}, {"_id": 0}).to_list(500)
    if not rows:
        raise HTTPException(404, "Belum ada render yang disetujui")
    angles = {a["id"]: a for a in await db().rs_angles.find({"project_id": pid}, {"_id": 0}).to_list(5000)}
    rooms = {a["id"]: a["name"] for a in await db().rs_rooms.find({"project_id": pid}, {"_id": 0}).to_list(500)}
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for r in rows:
            data = await file_bytes(r.get("graded_file_id") or r["raw_file_id"])
            an = angles.get(r["angle_id"], {}).get("name", "angle")
            z.writestr(f"{rooms.get(r['room_id'], 'room')}/{an}-v{r['version_no']:02d}.png", data)
    return Response(content=buf.getvalue(), media_type="application/zip",
                    headers={"Content-Disposition": f'attachment; filename="{(p.get("code") or p["name"]).replace(" ", "_")}-approved.zip"'})


class MasterIn(BaseModel):
    scope: str = "project"
    room_ids: List[str] = []


@router.post("/renders/{rid}/master")
async def set_master(rid: str, body: MasterIn, _: dict = Depends(staff)):
    r = await one("rs_renders", rid)
    if r.get("approval") != "approved":
        raise HTTPException(400, "Hanya render yang sudah disetujui yang bisa jadi Ambience Master")
    if body.scope == "project":
        await db().rs_projects.update_one({"id": r["project_id"]}, {"$set": {"master_render_id": rid, "updated_at": now_iso()}})
    else:
        await db().rs_rooms.update_many({"id": {"$in": body.room_ids}, "project_id": r["project_id"]}, {"$set": {"master_render_id": rid}})
    return {"ok": True}


# ---------- materials ----------
def mv_out(v: dict) -> dict:
    return {**v, **{f"{slot}_img": urls(v.get(f"{slot}_file_id")) for slot in ("sketchup", "photo", "approved")},
            "extra_imgs": [{"id": fid, **urls(fid)} for fid in v.get("extra_file_ids", [])]}


@router.get("/materials")
async def list_materials(_: dict = Depends(staff)):
    mats = await db().rs_materials.find({}, {"_id": 0}).sort("code", 1).to_list(1000)
    out = []
    for mat in mats:
        vs = await db().rs_material_versions.find({"material_id": mat["id"]}, {"_id": 0}).sort("version_no", 1).to_list(100)
        latest = vs[-1] if vs else None
        out.append({**mat, "versions": [{"version_no": v["version_no"], "status": v["status"]} for v in vs],
                    "preview": urls(latest and (latest.get("approved_file_id") or latest.get("photo_file_id") or latest.get("sketchup_file_id")))})
    return out


class MaterialIn(BaseModel):
    code: str
    name: str
    category: str
    brand: str = ""
    manufacturer_code: str = ""


@router.post("/materials")
async def create_material(body: MaterialIn, _: dict = Depends(staff)):
    if body.category not in CATEGORIES:
        raise HTTPException(400, "Kategori tidak valid")
    if await db().rs_materials.find_one({"code": body.code.strip()}):
        raise HTTPException(409, "Kode material sudah dipakai")
    mid = new_id()
    doc = {"id": mid, **{k: v.strip() for k, v in body.model_dump().items()}, "status": "uncalibrated", "created_at": now_iso()}
    await db().rs_materials.insert_one({**doc})
    await db().rs_material_versions.insert_one(new_version_doc(mid, 1))
    return doc


@router.get("/materials/{mid}")
async def get_material(mid: str, _: dict = Depends(staff)):
    mat = await one("rs_materials", mid)
    vs = await db().rs_material_versions.find({"material_id": mid}, {"_id": 0}).sort("version_no", 1).to_list(100)
    tests = await db().rs_renders.find({"material_id": mid}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return {**mat, "versions": [mv_out(v) for v in vs], "tests": [render_out(t) for t in tests]}


class MaterialPatch(BaseModel):
    name: Optional[str] = None
    brand: Optional[str] = None
    manufacturer_code: Optional[str] = None
    category: Optional[str] = None


@router.patch("/materials/{mid}")
async def patch_material(mid: str, body: MaterialPatch, m: dict = Depends(staff)):
    await one("rs_materials", mid)
    if m["role"] != "admin" and await db().rs_material_versions.find_one({"material_id": mid, "status": {"$in": ["approved", "locked"]}}):
        raise HTTPException(403, "Material ini sudah punya versi disetujui. Hanya admin yang bisa mengubah datanya.")
    upd = {k: v.strip() for k, v in body.model_dump().items() if v is not None}
    if "category" in upd and upd["category"] not in CATEGORIES:
        raise HTTPException(400, "Kategori tidak valid")
    await db().rs_materials.update_one({"id": mid}, {"$set": upd})
    return await one("rs_materials", mid)


async def editable_version(vid: str) -> dict:
    v = await one("rs_material_versions", vid)
    if v["status"] != "draft":
        raise HTTPException(423, "Versi ini sudah disetujui/terkunci dan tidak bisa diubah. Buat versi baru (admin).")
    return v


class VersionPatch(BaseModel):
    base_color: Optional[str] = None
    grain_direction: Optional[str] = None
    texture_scale: Optional[str] = None
    roughness: Optional[str] = None
    reflection: Optional[str] = None
    finish: Optional[str] = None
    instructions: Optional[str] = None
    negative: Optional[str] = None


@router.patch("/material-versions/{vid}")
async def patch_version(vid: str, body: VersionPatch, _: dict = Depends(staff)):
    await editable_version(vid)
    await db().rs_material_versions.update_one({"id": vid}, {"$set": {k: v for k, v in body.model_dump().items() if v is not None}})
    return mv_out(await one("rs_material_versions", vid))


@router.post("/material-versions/{vid}/images/{slot}")
async def version_image(vid: str, slot: str, file: UploadFile = File(...), _: dict = Depends(staff)):
    v = await editable_version(vid)
    if slot not in ("sketchup", "photo", "approved", "extra"):
        raise HTTPException(404, "Slot tidak dikenal")
    f = await store_bytes(await read_upload(file), f"materials/{v['material_id']}", f"rs_mat_{slot}", file.content_type or "image/png", file.filename or "")
    upd = {"$push": {"extra_file_ids": f["id"]}} if slot == "extra" else {"$set": {f"{slot}_file_id": f["id"]}}
    await db().rs_material_versions.update_one({"id": vid}, upd)
    return mv_out(await one("rs_material_versions", vid))


class CorrectionIn(BaseModel):
    text: str
    test_id: Optional[str] = None


@router.post("/material-versions/{vid}/corrections")
async def add_correction(vid: str, body: CorrectionIn, m: dict = Depends(staff)):
    await editable_version(vid)
    if not body.text.strip():
        raise HTTPException(400, "Tulis koreksi")
    c = {"id": new_id(), "text": body.text.strip(), "test_id": body.test_id, "by": m.get("name") or m.get("email"), "at": now_iso()}
    await db().rs_material_versions.update_one({"id": vid}, {"$push": {"corrections": c}})
    if body.test_id:
        await db().rs_renders.update_one({"id": body.test_id}, {"$set": {"approval": "rejected"}})
    return mv_out(await one("rs_material_versions", vid))


@router.delete("/material-versions/{vid}/corrections/{cid}")
async def del_correction(vid: str, cid: str, _: dict = Depends(staff)):
    await editable_version(vid)
    await db().rs_material_versions.update_one({"id": vid}, {"$pull": {"corrections": {"id": cid}}})
    return mv_out(await one("rs_material_versions", vid))


@router.post("/material-versions/{vid}/test")
async def calibration_test(vid: str, m: dict = Depends(staff)):
    v = await editable_version(vid)
    mat = await one("rs_materials", v["material_id"])
    if not v.get("sketchup_file_id") and not v.get("photo_file_id"):
        raise HTTPException(400, "Unggah tekstur SketchUp atau foto material asli dulu")
    await guard_active({"material_version_id": vid})
    await check_budget(None)
    s = await get_settings()
    images, roles = [], []
    for slot, role in (("sketchup", "original SketchUp texture (pattern layout reference)"), ("photo", "actual physical material photograph — the colour, grain and finish to reproduce"),
                       ("approved", "approved rendered appearance")):
        if v.get(f"{slot}_file_id"):
            images.append(v[f"{slot}_file_id"]); roles.append(role)
    for fid in v.get("extra_file_ids", [])[:4]:
        images.append(fid); roles.append("additional material reference photo")
    spec = "\n".join(f"- {k.replace('_', ' ')}: {v[k]}" for k in MATV_FIELDS if v.get(k))
    corr = "\n".join(f"- {c['text']}" for c in v.get("corrections", []))
    prompt = (f"Material calibration test for {mat['code']} {mat['name']} ({mat['category']}{', ' + mat['brand'] if mat.get('brand') else ''}).\n"
              "Render a photorealistic architectural close-up: a flat vertical wall panel and a cabinet front finished in this exact material, "
              "under neutral 5000K soft daylight, straight-on camera, no props. Reproduce colour, grain direction, texture scale, sheen and reflection faithfully.\n"
              + "IMAGE ROLES:\n" + "\n".join(f"- Image {i}: {r}" for i, r in enumerate(roles, 1))
              + (f"\nSPECIFICATION:\n{spec}" if spec else "") + (f"\nCORRECTIONS FROM PREVIOUS TESTS (must be fixed):\n{corr}" if corr else ""))
    job = {"id": new_id(), "project_id": None, "room_id": None, "angle_id": None, "material_id": mat["id"], "material_version_id": vid,
           "kind": "calibration", "status": "queued", "error": "", "mode": "draft", "model": s["draft_model"], "quality": s["draft_quality"],
           "size": "1024x1024", "prompt": prompt, "image_ids": images, "image_roles": roles, "materials": [], "ambience": None, "region": None,
           "approval": "pending", "feedback": [], "adjust": {}, "raw_file_id": None, "graded_file_id": None, "usage": {}, "cost_est": 0.0}
    await db().rs_materials.update_one({"id": mat["id"], "status": "uncalibrated"}, {"$set": {"status": "testing"}})
    return await enqueue(job, m)


class UseTestIn(BaseModel):
    test_id: str


@router.post("/material-versions/{vid}/use-test")
async def use_test(vid: str, body: UseTestIn, _: dict = Depends(staff)):
    await editable_version(vid)
    t = await one("rs_renders", body.test_id)
    if t.get("material_version_id") != vid or not t.get("raw_file_id"):
        raise HTTPException(400, "Tes ini bukan milik versi material ini")
    await db().rs_material_versions.update_one({"id": vid}, {"$set": {"approved_file_id": t.get("graded_file_id") or t["raw_file_id"]}})
    await db().rs_renders.update_one({"id": t["id"]}, {"$set": {"approval": "approved"}})
    return mv_out(await one("rs_material_versions", vid))


@router.post("/material-versions/{vid}/approve")
async def approve_version(vid: str, m: dict = Depends(admin)):
    v = await editable_version(vid)
    if not (v.get("photo_file_id") or v.get("approved_file_id")):
        raise HTTPException(400, "Butuh foto material asli atau tampilan render yang disetujui sebelum approve")
    if not (v.get("instructions") or v.get("finish") or v.get("base_color")):
        raise HTTPException(400, "Isi minimal salah satu kolom: Jenis finishing, Karakter warna dasar, atau Instruksi render, sebelum menyetujui")
    await db().rs_material_versions.update_one({"id": vid}, {"$set": {"status": "approved", "approved_by": m.get("name") or m.get("email"), "approved_at": now_iso()}})
    await db().rs_materials.update_one({"id": v["material_id"]}, {"$set": {"status": "approved"}})
    return mv_out(await one("rs_material_versions", vid))


@router.post("/material-versions/{vid}/lock")
async def lock_version(vid: str, m: dict = Depends(admin)):
    v = await one("rs_material_versions", vid)
    if v["status"] != "approved":
        raise HTTPException(400, "Hanya versi yang sudah disetujui yang bisa dikunci")
    await db().rs_material_versions.update_one({"id": vid}, {"$set": {"status": "locked", "locked_by": m.get("name") or m.get("email"), "locked_at": now_iso()}})
    await db().rs_materials.update_one({"id": v["material_id"]}, {"$set": {"status": "locked"}})
    return mv_out(await one("rs_material_versions", vid))


@router.post("/materials/{mid}/versions")
async def new_version(mid: str, _: dict = Depends(admin)):
    await one("rs_materials", mid)
    vs = await db().rs_material_versions.find({"material_id": mid}, {"_id": 0}).sort("version_no", -1).to_list(1)
    if vs and vs[0]["status"] == "draft":
        raise HTTPException(400, "Versi terbaru masih draft — selesaikan dulu")
    doc = new_version_doc(mid, (vs[0]["version_no"] + 1) if vs else 1, vs[0] if vs else None)
    await db().rs_material_versions.insert_one({**doc})
    return mv_out(doc)


class ImportItem(BaseModel):
    code: str
    name: str
    category: str
    brand: str = ""
    manufacturer_code: str = ""
    base_color: str = ""
    grain_direction: str = ""
    texture_scale: str = ""
    roughness: str = ""
    reflection: str = ""
    finish: str = ""
    instructions: str = ""
    negative: str = ""


@router.post("/materials/import")
async def import_materials(items: List[ImportItem], _: dict = Depends(admin)):
    created, updated, skipped = 0, 0, []
    for it in items:
        if it.category not in CATEGORIES:
            skipped.append(f"{it.code}: kategori tidak valid")
            continue
        mat = await db().rs_materials.find_one({"code": it.code}, {"_id": 0})
        fields = {k: getattr(it, k) for k in MATV_FIELDS}
        if not mat:
            mid = new_id()
            await db().rs_materials.insert_one({"id": mid, "code": it.code, "name": it.name, "category": it.category, "brand": it.brand,
                                                "manufacturer_code": it.manufacturer_code, "status": "uncalibrated", "created_at": now_iso()})
            await db().rs_material_versions.insert_one(new_version_doc(mid, 1, fields))
            created += 1
            continue
        draft = await db().rs_material_versions.find_one({"material_id": mat["id"], "status": "draft"}, {"_id": 0}, sort=[("version_no", -1)])
        if not draft:
            skipped.append(f"{it.code}: versi terkunci/disetujui — buat versi baru dulu")
            continue
        await db().rs_material_versions.update_one({"id": draft["id"]}, {"$set": {k: v for k, v in fields.items() if v}})
        updated += 1
    return {"created": created, "updated": updated, "skipped": skipped}


# ---------- ambiences ----------
def amb_out(a: dict) -> dict:
    return {**a, "versions": [{**v, "refs": [{"id": f, **urls(f)} for f in v.get("reference_file_ids", [])]} for v in a["versions"]]}


@router.get("/ambiences")
async def list_ambiences(_: dict = Depends(staff)):
    return [amb_out(a) for a in await db().rs_ambiences.find({}, {"_id": 0}).sort("created_at", 1).to_list(200)]


class AmbIn(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    lighting: Optional[str] = None
    white_balance: Optional[str] = None
    exposure: Optional[str] = None
    contrast: Optional[str] = None
    shadows: Optional[str] = None
    natural_light: Optional[str] = None
    artificial_light: Optional[str] = None
    palette: Optional[str] = None
    avoid: Optional[str] = None
    reference_file_ids: Optional[List[str]] = None
    from_render_id: Optional[str] = None


@router.post("/ambiences")
async def create_ambience(body: AmbIn, m: dict = Depends(admin)):
    if not (body.name or "").strip():
        raise HTTPException(400, "Nama preset wajib diisi")
    refs = list(body.reference_file_ids or [])
    if body.from_render_id:
        r = await one("rs_renders", body.from_render_id)
        if r.get("approval") != "approved":
            raise HTTPException(400, "Preset hanya bisa dibuat dari render yang disetujui")
        refs.insert(0, r.get("graded_file_id") or r["raw_file_id"])
    v = {"version_no": 1, **{k: getattr(body, k) or "" for k in AMB_FIELDS}, "reference_file_ids": refs, "created_at": now_iso(), "created_by": m.get("name") or m.get("email")}
    doc = {"id": new_id(), "name": body.name.strip(), "current": 1, "created_at": now_iso(), "versions": [v]}
    await db().rs_ambiences.insert_one({**doc})
    return amb_out(doc)


@router.patch("/ambiences/{amb_id}")
async def update_ambience(amb_id: str, body: AmbIn, m: dict = Depends(admin)):
    a = await one("rs_ambiences", amb_id)
    cur = next(v for v in a["versions"] if v["version_no"] == a["current"])
    nv = {**cur, **{k: getattr(body, k) for k in AMB_FIELDS if getattr(body, k) is not None},
          "version_no": max(v["version_no"] for v in a["versions"]) + 1, "created_at": now_iso(), "created_by": m.get("name") or m.get("email")}
    if body.reference_file_ids is not None:
        nv["reference_file_ids"] = body.reference_file_ids
    await db().rs_ambiences.update_one({"id": amb_id}, {"$push": {"versions": nv}, "$set": {"current": nv["version_no"], **({"name": body.name.strip()} if body.name else {})}})
    return amb_out(await one("rs_ambiences", amb_id))


class RollbackIn(BaseModel):
    version_no: int


@router.post("/ambiences/{amb_id}/current")
async def set_ambience_version(amb_id: str, body: RollbackIn, _: dict = Depends(admin)):
    a = await one("rs_ambiences", amb_id)
    if not any(v["version_no"] == body.version_no for v in a["versions"]):
        raise HTTPException(404, "Versi tidak ditemukan")
    await db().rs_ambiences.update_one({"id": amb_id}, {"$set": {"current": body.version_no}})
    return amb_out(await one("rs_ambiences", amb_id))


# ---------- grade presets ----------
class GradePresetIn(BaseModel):
    name: str
    values: dict


@router.get("/grade-presets")
async def grade_presets(_: dict = Depends(staff)):
    return await db().rs_grade_presets.find({}, {"_id": 0}).sort("created_at", 1).to_list(200)


@router.post("/grade-presets")
async def add_grade_preset(body: GradePresetIn, m: dict = Depends(staff)):
    doc = {"id": new_id(), "name": body.name.strip()[:40] or "Preset", "values": {k: int(v) for k, v in body.values.items() if isinstance(v, (int, float))},
           "by": m.get("name") or m.get("email"), "created_at": now_iso()}
    await db().rs_grade_presets.insert_one({**doc})
    return doc


# ---------- future integrations (n8n-ready, authenticated) ----------
@router.get("/jobs/{rid}/status")
async def job_status(rid: str, _: dict = Depends(staff)):
    r = await one("rs_renders", rid)
    return {"id": r["id"], "status": r["status"], "error": r.get("error"), "raw": urls(r.get("raw_file_id")), "graded": urls(r.get("graded_file_id"))}
