import asyncio
import logging
import secrets
import time
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional

import requests
from dotenv import load_dotenv

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import bcrypt  # noqa: E402
import jwt  # noqa: E402
from fastapi import APIRouter, Depends, FastAPI, File, Header, HTTPException, Query, Request, Response, UploadFile  # noqa: E402
from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402
from pydantic import BaseModel, Field  # noqa: E402
from pymongo import ReturnDocument  # noqa: E402
from starlette.concurrency import run_in_threadpool  # noqa: E402
from starlette.middleware.cors import CORSMiddleware  # noqa: E402

try:  # launched as `backend.server`
    from backend.clerk_auth import clerk_router, require_user
    from backend import storage
except ModuleNotFoundError:  # launched from inside backend/
    from clerk_auth import clerk_router, require_user
    import storage

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("inerre")

client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = client[os.environ["DB_NAME"]]

app = FastAPI()
api = APIRouter(prefix="/api")

# ---------- roles ----------
ROLES = ["admin", "designer", "client", "pending"]
DEFAULT_ROLE = "pending"
RETIRED_ROLES: dict = {}
RANK = {r: len(ROLES) - i for i, r in enumerate(ROLES)}
STAFF = ("admin", "designer")
ENV = "live" if os.environ.get("CLERK_PUBLISHABLE_KEY", "").startswith("pk_live_") else "preview"
IN_ENV = {"env": {"$in": [ENV, None]}}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def new_id() -> str:
    return uuid.uuid4().hex


def effective_role(role) -> str:
    role = RETIRED_ROLES.get(role, role)
    return role if role in ROLES else DEFAULT_ROLE


def _clerk_profile(user_id: str):
    r = requests.get(
        f"https://api.clerk.com/v1/users/{user_id}", timeout=10,
        headers={"Authorization": f"Bearer {os.environ['CLERK_SECRET_KEY']}", "User-Agent": "emergent-app"},
    )
    r.raise_for_status()
    j = r.json()
    emails = [e["email_address"].lower() for e in j.get("email_addresses", [])
              if (e.get("verification") or {}).get("status") == "verified"]
    name = " ".join(x for x in [j.get("first_name"), j.get("last_name")] if x)
    return emails, name


async def _initial_role(emails: List[str]) -> str:
    admins = {e.strip().lower() for e in os.environ.get("ADMIN_EMAIL", "").split(",") if e.strip()}
    if any(e in admins for e in emails):
        return "admin"
    inv = await db.invites.find_one({"email": {"$in": emails}}, {"_id": 0})
    return effective_role(inv["role"]) if inv else DEFAULT_ROLE


async def current_member(user: dict = Depends(require_user)) -> dict:
    uid = user["user_id"]
    member = await db.users.find_one({"user_id": uid}, {"_id": 0})
    if member is None or not member.get("role"):
        emails, name = await run_in_threadpool(_clerk_profile, uid)
        role = await _initial_role(emails)
        profile = {"emails": emails, "email": emails[0] if emails else "", "name": name}
        await db.users.update_one({"user_id": uid, "role": {"$in": [None, ""]}}, {"$set": {"role": role, **profile}})
        member = await db.users.find_one_and_update(
            {"user_id": uid},
            {"$setOnInsert": {"user_id": uid, "role": role, "created_at": now_iso(), **profile}},
            upsert=True, projection={"_id": 0}, return_document=ReturnDocument.AFTER,
        )
    elif effective_role(member.get("role")) == DEFAULT_ROLE and member.get("emails"):
        inv = await db.invites.find_one({"email": {"$in": member["emails"]}}, {"_id": 0})
        if inv:
            await db.users.update_one({"user_id": uid}, {"$set": {"role": inv["role"]}})
            member["role"] = inv["role"]
    if member.get("env") != ENV:
        await db.users.update_one({"user_id": uid}, {"$set": {"env": ENV}})
    return {**member, "env": ENV, "role": effective_role(member["role"])}


def require_role(*roles: str):
    async def check(member: dict = Depends(current_member)) -> dict:
        if member["role"] not in roles:
            raise HTTPException(status_code=403, detail="Not allowed")
        return member
    return check


staff_only = require_role(*STAFF)
admin_only = require_role("admin")


@app.on_event("startup")
async def startup():
    for old, new in RETIRED_ROLES.items():
        await db.users.update_many({"role": old}, {"$set": {"role": new}})
    for coll, field in (("projects", "id"), ("floors", "id"), ("rooms", "id"), ("scenes", "id"), ("files", "id")):
        await db[coll].create_index(field, unique=True)
    await db.scenes.create_index("project_id")
    await db.users.create_index("user_id", unique=True)
    try:
        await run_in_threadpool(storage.init_storage)
        logger.info("Storage initialized")
    except Exception as e:  # noqa: BLE001
        logger.error(f"Storage init failed: {e}")


# ---------- models ----------
class RoleIn(BaseModel):
    role: str


class InviteIn(BaseModel):
    email: str
    role: str


class ProjectIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    code: str = ""


class ProjectUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=120)
    code: Optional[str] = None
    client_emails: Optional[List[str]] = None


class NameIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class FloorUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=120)
    layout3d_caption: Optional[str] = None


class HotspotIn(BaseModel):
    id: str
    x: float = Field(ge=0, le=1)
    y: float = Field(ge=0, le=1)
    target_scene_id: Optional[str] = None
    label: str = ""


class CameraIn(BaseModel):
    x: float = Field(ge=0, le=1)
    y: float = Field(ge=0, le=1)
    angle: float = Field(0, ge=-360, le=360)
    fov: float = Field(60, ge=10, le=170)


class SceneUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    area: Optional[str] = None
    room_id: Optional[str] = None
    hotspots: Optional[List[HotspotIn]] = None
    camera: Optional[CameraIn] = None
    clear_camera: bool = False


class MusicChoiceIn(BaseModel):
    source: str
    track: Optional[str] = None


class TourIn(BaseModel):
    order: List[str]


class BacklinkIn(BaseModel):
    hotspot_id: str


# ---------- helpers ----------
async def get_project(pid: str, member: dict, staff: bool = False) -> dict:
    p = await db.projects.find_one({"id": pid}, {"_id": 0, "share": 0})
    if not p:
        raise HTTPException(404, "Proyek tidak ditemukan")
    if member["role"] in STAFF:
        return p
    shared = set(p.get("client_emails", [])) & set(member.get("emails", []))
    if staff or member["role"] != "client" or not shared or not p.get("published_revision"):
        raise HTTPException(404, "Proyek tidak ditemukan")
    return p


async def get_doc(coll: str, doc_id: str) -> dict:
    d = await db[coll].find_one({"id": doc_id}, {"_id": 0, "share": 0} if coll == "projects" else {"_id": 0})
    if not d:
        raise HTTPException(404, "Tidak ditemukan")
    return d


async def load_structure(pid: str):
    floors = await db.floors.find({"project_id": pid}, {"_id": 0}).sort("order", 1).to_list(200)
    rooms = await db.rooms.find({"project_id": pid}, {"_id": 0}).sort("order", 1).to_list(1000)
    scenes = await db.scenes.find({"project_id": pid}, {"_id": 0}).sort("order", 1).to_list(5000)
    return floors, rooms, scenes


def effective_tour(tour_order, floors, rooms, scenes) -> List[str]:
    ids = {s["id"] for s in scenes}
    order = [sid for sid in (tour_order or []) if sid in ids]
    floor_rank = {f["id"]: i for i, f in enumerate(floors)}
    room_rank = {r["id"]: i for i, r in enumerate(rooms)}
    rest = sorted((s for s in scenes if s["id"] not in order),
                  key=lambda s: (floor_rank.get(s["floor_id"], 999), room_rank.get(s["room_id"], 999), s.get("order", 0)))
    return order + [s["id"] for s in rest]


def with_urls(floors, scenes):
    fl = [{**f, "plan_url": storage.signed_url(f.get("plan_file_id")),
           "layout3d_url": storage.signed_url(f.get("layout3d_file_id"))} for f in floors]
    sc = [{**s, "image_url": storage.signed_url(s.get("image_file_id")),
           "thumb_url": storage.signed_url(s.get("image_file_id"), "thumb")} for s in scenes]
    return fl, sc


def validate_structure(floors, rooms, scenes) -> dict:
    errors, warnings = [], []
    ids = {s["id"]: s for s in scenes}
    if not scenes:
        errors.append({"code": "no_scenes", "message": "Belum ada scene di proyek ini."})
    for s in scenes:
        name = s.get("title") or "Tanpa judul"
        for h in s.get("hotspots", []):
            if not h.get("target_scene_id"):
                errors.append({"code": "no_target", "scene_id": s["id"],
                               "message": f"Hotspot \"{h.get('label') or '—'}\" di scene \"{name}\" belum punya scene tujuan."})
            elif h["target_scene_id"] not in ids:
                errors.append({"code": "broken_link", "scene_id": s["id"],
                               "message": f"Hotspot \"{h.get('label') or '—'}\" di scene \"{name}\" mengarah ke scene yang sudah dihapus."})
        if s.get("hotspots_need_check"):
            errors.append({"code": "needs_check", "scene_id": s["id"],
                           "message": f"Render scene \"{name}\" berganti rasio. Hotspot perlu dicek dan dikonfirmasi."})
        if not s.get("title"):
            warnings.append({"code": "no_title", "scene_id": s["id"], "message": "Ada scene tanpa judul."})
        if not s.get("camera"):
            warnings.append({"code": "no_camera", "scene_id": s["id"], "message": f"Scene \"{name}\" belum punya pin kamera di denah."})
    for f in floors:
        if not f.get("plan_file_id"):
            warnings.append({"code": "no_plan", "floor_id": f["id"], "message": f"Lantai \"{f['name']}\" belum punya denah."})
    return {"ok": not errors, "errors": errors, "warnings": warnings}


async def save_upload(file: UploadFile, project_id: str, kind: str) -> dict:
    data = await file.read()
    if not data:
        raise HTTPException(400, "File kosong")
    if len(data) > 80 * 1024 * 1024:
        raise HTTPException(413, "File terlalu besar (maks 80 MB)")
    ct = file.content_type or ""
    if not ct.startswith("image/"):
        raise HTTPException(400, "File harus berupa gambar")
    try:
        proc = await run_in_threadpool(storage.process_image, data)
    except Exception:  # noqa: BLE001
        raise HTTPException(400, "Gambar tidak bisa dibaca")
    fid = new_id()
    ext = (file.filename or "img").rsplit(".", 1)[-1].lower()[:5] or "bin"
    base = f"{storage.APP_NAME}/projects/{project_id}/{fid}"
    paths = {}
    try:
        for variant, payload, mime in (("original", data, ct), ("web", proc["web"], "image/webp"), ("thumb", proc["thumb"], "image/webp")):
            res = await run_in_threadpool(storage.put_object, f"{base}/{variant}.{ext if variant == 'original' else 'webp'}", payload, mime)
            paths[variant] = res["path"]
    except requests.RequestException as e:
        logger.error(f"Storage upload failed: {e}")
        raise HTTPException(502, "Penyimpanan gambar sedang bermasalah. Coba unggah lagi.")
    doc = {"id": fid, "project_id": project_id, "kind": kind, "original_filename": file.filename, "content_type": ct,
           "paths": paths, "width": proc["width"], "height": proc["height"], "aspect": proc["aspect"],
           "is_deleted": False, "created_at": now_iso()}
    await db.files.insert_one({**doc})
    return doc


async def touch(pid: str):
    await db.projects.update_one({"id": pid}, {"$set": {"updated_at": now_iso()}})


# ---------- me / users ----------
@api.get("/me")
async def me(member: dict = Depends(current_member)):
    return {k: member.get(k) for k in ("user_id", "email", "emails", "name", "role")}


@api.get("/users")
async def list_users(admin: dict = Depends(admin_only)):
    people = await db.users.find(IN_ENV, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return {"roles": [r for r in ROLES if RANK[r] <= RANK[admin["role"]]],
            "users": [{**p, "role": effective_role(p.get("role"))} for p in people]}


@api.patch("/users/{user_id}/role")
async def set_role(user_id: str, body: RoleIn, admin: dict = Depends(admin_only)):
    if body.role not in ROLES or RANK[body.role] > RANK[admin["role"]]:
        raise HTTPException(403, "Not allowed")
    target = await db.users.find_one({"user_id": user_id, **IN_ENV}, {"_id": 0})
    if target is None:
        raise HTTPException(404, "Not found")
    if (effective_role(target.get("role")) == "admin" and body.role != "admin"
            and await db.users.count_documents({"role": "admin", **IN_ENV}) <= 1):
        raise HTTPException(409, "Minimal harus ada satu admin")
    await db.users.update_one({"user_id": user_id}, {"$set": {"role": body.role}})
    return {"user_id": user_id, "role": body.role}


@api.get("/invites")
async def list_invites(_: dict = Depends(admin_only)):
    return await db.invites.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)


@api.post("/invites")
async def create_invite(body: InviteIn, admin: dict = Depends(admin_only)):
    email = body.email.strip().lower()
    if "@" not in email or body.role not in ROLES or body.role == DEFAULT_ROLE or RANK[body.role] > RANK[admin["role"]]:
        raise HTTPException(400, "Email atau peran tidak valid")
    doc = {"email": email, "role": body.role, "created_at": now_iso()}
    await db.invites.update_one({"email": email}, {"$set": doc}, upsert=True)
    await db.users.update_many({"emails": email, "role": DEFAULT_ROLE, **IN_ENV}, {"$set": {"role": body.role}})
    return doc


@api.delete("/invites/{email}")
async def delete_invite(email: str, _: dict = Depends(admin_only)):
    await db.invites.delete_one({"email": email.lower()})
    return {"ok": True}


# ---------- projects ----------
async def project_summary(p: dict) -> dict:
    count = await db.scenes.count_documents({"project_id": p["id"]})
    first = await db.scenes.find_one({"project_id": p["id"]}, {"_id": 0, "image_file_id": 1}, sort=[("created_at", 1)])
    cover = p.get("cover_file_id") or (first or {}).get("image_file_id")
    return {**p, "scene_count": count, "cover_url": storage.signed_url(cover, "thumb")}


@api.get("/projects")
async def list_projects(member: dict = Depends(current_member)):
    if member["role"] in STAFF:
        q = {}
    elif member["role"] == "client":
        q = {"client_emails": {"$in": member.get("emails", [])}, "published_revision": {"$gt": 0}}
    else:
        return []
    items = await db.projects.find(q, {"_id": 0, "share": 0}).sort("updated_at", -1).to_list(500)
    if member["role"] == "client":
        for p in items:
            rev = await db.revisions.find_one({"project_id": p["id"], "number": p["published_revision"]}, {"_id": 0, "snapshot.scenes": 1})
            scenes = ((rev or {}).get("snapshot") or {}).get("scenes") or []
            p["cover_file_id"] = scenes[0]["image_file_id"] if scenes else None
    return [await project_summary(p) for p in items]


@api.post("/projects")
async def create_project(body: ProjectIn, member: dict = Depends(staff_only)):
    doc = {"id": new_id(), "name": body.name.strip(), "code": body.code.strip(), "client_emails": [], "tour_order": [],
           "published_revision": 0, "created_by": member["user_id"], "created_at": now_iso(), "updated_at": now_iso()}
    await db.projects.insert_one({**doc})
    return doc


@api.patch("/projects/{pid}")
async def update_project(pid: str, body: ProjectUpdate, member: dict = Depends(staff_only)):
    await get_project(pid, member)
    data = body.model_dump(exclude_unset=True)
    if "client_emails" in data:
        if member["role"] != "admin":
            raise HTTPException(403, "Hanya admin yang bisa mengatur klien")
        data["client_emails"] = sorted({e.strip().lower() for e in data["client_emails"] if "@" in e})
    data["updated_at"] = now_iso()
    await db.projects.update_one({"id": pid}, {"$set": data})
    return await get_doc("projects", pid)


@api.delete("/projects/{pid}")
async def delete_project(pid: str, _: dict = Depends(admin_only)):
    for coll in ("floors", "rooms", "scenes", "revisions"):
        await db[coll].delete_many({"project_id": pid})
    await db.files.update_many({"project_id": pid}, {"$set": {"is_deleted": True}})
    await db.projects.delete_one({"id": pid})
    return {"ok": True}


TRACKS = [
    {"id": "backbay-lounge", "title": "Backbay Lounge", "artist": "Kevin MacLeod", "genre": "Lounge", "license": "CC BY 3.0"},
    {"id": "airport-lounge", "title": "Airport Lounge", "artist": "Kevin MacLeod", "genre": "Lounge", "license": "CC BY 3.0"},
    {"id": "casa-bossa-nova", "title": "Casa Bossa Nova", "artist": "Kevin MacLeod", "genre": "Lounge", "license": "CC BY 3.0"},
    {"id": "zazie", "title": "Zazie", "artist": "Kevin MacLeod", "genre": "Lounge", "license": "CC BY 3.0"},
    {"id": "kool-kats", "title": "Kool Kats", "artist": "Kevin MacLeod", "genre": "Lounge", "license": "CC BY 3.0"},
    {"id": "gymnopedie-1", "title": "Gymnopédie No. 1", "artist": "Erik Satie", "genre": "Klasik", "license": "CC0"},
    {"id": "clair-de-lune", "title": "Clair de Lune", "artist": "Claude Debussy", "genre": "Klasik", "license": "Public domain"},
    {"id": "nocturne-op9-2", "title": "Nocturne Op. 9 No. 2", "artist": "Frédéric Chopin", "genre": "Klasik", "license": "Public domain"},
    {"id": "gnossienne-1", "title": "Gnossienne No. 1", "artist": "Erik Satie", "genre": "Klasik", "license": "Public domain"},
    {"id": "air-bach", "title": "Air on the G String", "artist": "J. S. Bach", "genre": "Klasik", "license": "Public domain"},
]
TRACK_IDS = {t["id"]: t for t in TRACKS}
DEFAULT_TRACK = "backbay-lounge"


def project_music(p: dict) -> dict:
    source = p.get("music_source") or ("upload" if p.get("music_file_id") else "system")
    return {"source": source, "track": p.get("music_track") or DEFAULT_TRACK, "file_id": p.get("music_file_id")}


def media_urls(music: Optional[dict], pdf) -> dict:
    pages = (pdf or {}).get("pages") or []
    music = music or {"source": "none"}
    url, title = None, None
    if music["source"] == "upload" and music.get("file_id"):
        url, title = storage.signed_url(music["file_id"], "audio"), "Musik unggahan"
    elif music["source"] == "system":
        t = TRACK_IDS.get(music.get("track")) or TRACK_IDS[DEFAULT_TRACK]
        url = f"/music/{t['id']}.mp3"
        title = f"{t['title']} · {t['artist']}" + (f" ({t['license']})" if t["license"].startswith("CC BY") else "")
    return {"music_url": url, "music_title": title,
            "pdf_pages": [{"url": storage.signed_url(pg["file_id"]), "aspect": pg["aspect"]} for pg in pages]}


def snapshot_music(snap: dict) -> dict:
    if "music" in snap:
        return snap["music"]
    return {"source": "upload", "file_id": snap["music_file_id"]} if snap.get("music_file_id") else {"source": "none"}


@api.get("/music/tracks")
async def music_tracks(_: dict = Depends(current_member)):
    return {"default": DEFAULT_TRACK, "tracks": [{**t, "url": f"/music/{t['id']}.mp3"} for t in TRACKS]}


@api.put("/projects/{pid}/music-choice")
async def set_music_choice(pid: str, body: MusicChoiceIn, member: dict = Depends(staff_only)):
    p = await get_project(pid, member)
    if body.source not in ("system", "upload", "none") or (body.source == "system" and body.track not in TRACK_IDS):
        raise HTTPException(400, "Pilihan musik tidak valid")
    if body.source == "upload" and not p.get("music_file_id"):
        raise HTTPException(400, "Belum ada musik yang diunggah")
    data = {"music_source": body.source, "updated_at": now_iso()}
    if body.source == "system":
        data["music_track"] = body.track
    await db.projects.update_one({"id": pid}, {"$set": data})
    return await get_doc("projects", pid)


@api.get("/projects/{pid}/draft")
async def get_draft(pid: str, member: dict = Depends(staff_only)):
    p = await get_project(pid, member)
    floors, rooms, scenes = await load_structure(pid)
    fl, sc = with_urls(floors, scenes)
    revisions = await db.revisions.find({"project_id": pid}, {"_id": 0, "snapshot": 0}).sort("number", -1).to_list(500)
    return {"project": p, "floors": fl, "rooms": rooms, "scenes": sc, **media_urls(project_music(p), p.get("pdf")),
            "tour_order": effective_tour(p.get("tour_order"), floors, rooms, scenes), "revisions": revisions}


@api.get("/projects/{pid}/view")
async def view_project(pid: str, mode: str = "published", member: dict = Depends(current_member)):
    p = await get_project(pid, member)
    if mode == "draft":
        if member["role"] not in STAFF:
            raise HTTPException(404, "Proyek tidak ditemukan")
        floors, rooms, scenes = await load_structure(pid)
        tour, revision = p.get("tour_order"), None
        media = media_urls(project_music(p), p.get("pdf"))
    else:
        return await published_view(p)
    fl, sc = with_urls(floors, scenes)
    return {"project": {"id": p["id"], "name": p["name"], "code": p.get("code", "")}, "mode": mode, "revision": revision, **media,
            "floors": fl, "rooms": rooms, "scenes": sc, "tour_order": effective_tour(tour, floors, rooms, scenes)}


async def published_view(p: dict) -> dict:
    rev = await db.revisions.find_one({"project_id": p["id"], "number": p.get("published_revision", 0)}, {"_id": 0})
    if not rev:
        raise HTTPException(404, "Proyek belum dipublikasikan")
    snap = rev["snapshot"]
    floors, rooms, scenes, tour = snap["floors"], snap["rooms"], snap["scenes"], snap["tour_order"]
    fl, sc = with_urls(floors, scenes)
    return {"project": {"id": p["id"], "name": p["name"], "code": p.get("code", "")}, "mode": "published",
            "revision": {"number": rev["number"], "published_at": rev["published_at"]},
            **media_urls(snapshot_music(snap), snap.get("pdf")),
            "floors": fl, "rooms": rooms, "scenes": sc, "tour_order": effective_tour(tour, floors, rooms, scenes)}


# ---------- share links (guest access: secret link + password) ----------
SHARE_TTL = 12 * 3600
_share_attempts: dict = {}


class ShareIn(BaseModel):
    enabled: bool = True
    password: Optional[str] = Field(None, min_length=4, max_length=64)


class UnlockIn(BaseModel):
    password: str = Field(min_length=1, max_length=64)


def share_info(p: dict) -> dict:
    s = p.get("share") or {}
    return {"enabled": bool(s.get("enabled")), "token": s.get("token"), "has_password": bool(s.get("password_hash")),
            "updated_at": s.get("updated_at")}


@api.get("/projects/{pid}/share")
async def get_share(pid: str, member: dict = Depends(staff_only)):
    p = await db.projects.find_one({"id": pid}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Proyek tidak ditemukan")
    return share_info(p)


@api.put("/projects/{pid}/share")
async def set_share(pid: str, body: ShareIn, member: dict = Depends(staff_only)):
    p = await db.projects.find_one({"id": pid}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Proyek tidak ditemukan")
    s = dict(p.get("share") or {})
    if body.password:
        s["password_hash"] = bcrypt.hashpw(body.password.encode(), bcrypt.gensalt()).decode()
        s["version"] = int(s.get("version") or 0) + 1
    if body.enabled and not s.get("password_hash"):
        raise HTTPException(400, "Buat password dulu sebelum mengaktifkan link")
    s["token"] = s.get("token") or secrets.token_urlsafe(18)
    if s.get("enabled") and not body.enabled:
        s["version"] = int(s.get("version") or 0) + 1
    s["enabled"] = body.enabled
    s["updated_at"] = now_iso()
    await db.projects.update_one({"id": pid}, {"$set": {"share": s}})
    return share_info({"share": s})


@api.post("/projects/{pid}/share/regenerate")
async def regenerate_share(pid: str, member: dict = Depends(staff_only)):
    p = await db.projects.find_one({"id": pid}, {"_id": 0})
    if not p or not p.get("share"):
        raise HTTPException(404, "Link belum dibuat")
    s = {**p["share"], "token": secrets.token_urlsafe(18), "version": int(p["share"].get("version") or 0) + 1, "updated_at": now_iso()}
    await db.projects.update_one({"id": pid}, {"$set": {"share": s}})
    return share_info({"share": s})


async def _shared_project(token: str) -> dict:
    p = await db.projects.find_one({"share.token": token, "share.enabled": True}, {"_id": 0})
    if not p or not p.get("published_revision"):
        raise HTTPException(404, "Link tidak ditemukan atau sudah tidak aktif")
    return p


@api.get("/share/{token}")
async def share_meta(token: str):
    p = await _shared_project(token)
    return {"project_name": p["name"], "code": p.get("code", "")}


@api.post("/share/{token}/unlock")
async def share_unlock(token: str, body: UnlockIn, request: Request):
    p = await _shared_project(token)
    xff = [x.strip() for x in (request.headers.get("x-forwarded-for") or "").split(",") if x.strip()]
    ip = xff[-1] if xff else (request.client.host if request.client else "")
    key, now = f"{token}:{ip}", time.time()
    if len(_share_attempts) > 5000:
        for k in [k for k, v in _share_attempts.items() if not v or now - v[-1] > 900]:
            _share_attempts.pop(k, None)
    recent = [t for t in _share_attempts.get(key, []) if now - t < 900]
    token_recent = [t for t in _share_attempts.get(token, []) if now - t < 900]
    if len(recent) >= 5 or len(token_recent) >= 20:
        raise HTTPException(429, "Terlalu banyak percobaan. Coba lagi dalam 15 menit.")
    s = p["share"]
    if not bcrypt.checkpw(body.password.encode(), s["password_hash"].encode()):
        _share_attempts[key] = recent + [now]
        _share_attempts[token] = token_recent + [now]
        raise HTTPException(401, "Password salah")
    _share_attempts.pop(key, None)
    claims = {"typ": "share", "tok": token, "pid": p["id"], "v": s.get("version", 0), "exp": int(now) + SHARE_TTL}
    return {"access": jwt.encode(claims, os.environ["SHARE_TOKEN_SECRET"], algorithm="HS256"), "expires_in": SHARE_TTL}


@api.get("/share/{token}/view")
async def share_view(token: str, x_share_access: str = Header("")):
    p = await _shared_project(token)
    try:
        claims = jwt.decode(x_share_access, os.environ["SHARE_TOKEN_SECRET"], algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(401, "Masukkan password untuk membuka presentasi")
    if claims.get("typ") != "share" or claims.get("tok") != token or claims.get("v") != p["share"].get("version", 0):
        raise HTTPException(401, "Masukkan password untuk membuka presentasi")
    return await published_view(p)


@api.put("/projects/{pid}/tour")
async def set_tour(pid: str, body: TourIn, member: dict = Depends(staff_only)):
    await get_project(pid, member)
    await db.projects.update_one({"id": pid}, {"$set": {"tour_order": body.order, "updated_at": now_iso()}})
    return {"ok": True}


@api.get("/projects/{pid}/validate")
async def validate_project(pid: str, member: dict = Depends(staff_only)):
    await get_project(pid, member)
    return validate_structure(*(await load_structure(pid)))


@api.post("/projects/{pid}/publish")
async def publish_project(pid: str, member: dict = Depends(staff_only)):
    p = await get_project(pid, member)
    floors, rooms, scenes = await load_structure(pid)
    result = validate_structure(floors, rooms, scenes)
    if not result["ok"]:
        raise HTTPException(400, {"message": "Publikasi diblokir", **result})
    number = (p.get("published_revision") or 0) + 1
    rev = {"id": new_id(), "project_id": pid, "number": number, "published_at": now_iso(),
           "published_by": member.get("email") or member["user_id"], "scene_count": len(scenes),
           "snapshot": {"floors": floors, "rooms": rooms, "scenes": scenes,
                        "music": project_music(p), "pdf": p.get("pdf"),
                        "tour_order": effective_tour(p.get("tour_order"), floors, rooms, scenes)}}
    await db.revisions.insert_one({**rev})
    await db.projects.update_one({"id": pid}, {"$set": {"published_revision": number, "published_at": rev["published_at"]}})
    return {"number": number, "published_at": rev["published_at"]}


async def _put_file(project_id: str, kind: str, path: str, data: bytes, mime: str, variant: str, **extra) -> dict:
    try:
        res = await run_in_threadpool(storage.put_object, path, data, mime)
    except requests.RequestException as e:
        logger.error(f"Storage upload failed: {e}")
        raise HTTPException(502, "Penyimpanan file sedang bermasalah. Coba unggah lagi.")
    doc = {"id": extra.pop("file_id", None) or new_id(), "project_id": project_id,
           "kind": kind, "content_type": mime, "paths": {variant: res["path"]}, "is_deleted": False, "created_at": now_iso(), **extra}
    await db.files.insert_one({**doc})
    return doc


@api.post("/projects/{pid}/music")
async def upload_music(pid: str, file: UploadFile = File(...), member: dict = Depends(staff_only)):
    await get_project(pid, member)
    ct = file.content_type or ""
    data = await file.read()
    if not ct.startswith("audio/"):
        raise HTTPException(400, "File harus berupa audio (mp3, m4a, wav)")
    if not data:
        raise HTTPException(400, "File kosong")
    if len(data) > 30 * 1024 * 1024:
        raise HTTPException(413, "File audio maksimal 30 MB")
    fid = new_id()
    ext = (file.filename or "a.mp3").rsplit(".", 1)[-1].lower()[:5]
    doc = await _put_file(pid, "music", f"{storage.APP_NAME}/projects/{pid}/{fid}/audio.{ext}", data, ct, "audio",
                          file_id=fid, original_filename=file.filename)
    await db.projects.update_one({"id": pid}, {"$set": {"music_file_id": doc["id"], "music_name": file.filename, "music_source": "upload", "updated_at": now_iso()}})
    return await get_doc("projects", pid)


@api.delete("/projects/{pid}/music")
async def delete_music(pid: str, member: dict = Depends(staff_only)):
    await get_project(pid, member)
    await db.projects.update_one({"id": pid}, {"$set": {"music_file_id": None, "music_name": None, "music_source": "system", "updated_at": now_iso()}})
    return await get_doc("projects", pid)


@api.post("/projects/{pid}/pdf")
async def upload_pdf(pid: str, file: UploadFile = File(...), member: dict = Depends(staff_only)):
    await get_project(pid, member)
    data = await file.read()
    if not data.startswith(b"%PDF"):
        raise HTTPException(400, "File harus berupa PDF")
    if len(data) > 80 * 1024 * 1024:
        raise HTTPException(413, "PDF maksimal 80 MB")
    try:
        rendered = await run_in_threadpool(storage.render_pdf, data)
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception:  # noqa: BLE001
        raise HTTPException(400, "PDF tidak bisa dibaca")
    base = f"{storage.APP_NAME}/projects/{pid}/{new_id()}"
    await _put_file(pid, "pdf", f"{base}/original.pdf", data, "application/pdf", "original", original_filename=file.filename)
    sem = asyncio.Semaphore(6)

    async def put_page(i: int, pg: dict) -> dict:
        async with sem:
            doc = await _put_file(pid, "pdf_page", f"{base}/page-{i + 1:03d}.webp", pg["data"], "image/webp", "web", aspect=pg["aspect"])
        return {"file_id": doc["id"], "aspect": pg["aspect"]}

    pages = await asyncio.gather(*(put_page(i, pg) for i, pg in enumerate(rendered)))
    pdf = {"name": file.filename, "pages": list(pages), "uploaded_at": now_iso()}
    await db.projects.update_one({"id": pid}, {"$set": {"pdf": pdf, "updated_at": now_iso()}})
    return await get_doc("projects", pid)


@api.delete("/projects/{pid}/pdf")
async def delete_pdf(pid: str, member: dict = Depends(staff_only)):
    await get_project(pid, member)
    await db.projects.update_one({"id": pid}, {"$set": {"pdf": None, "updated_at": now_iso()}})
    return await get_doc("projects", pid)


# ---------- floors ----------
@api.post("/projects/{pid}/floors")
async def create_floor(pid: str, body: NameIn, member: dict = Depends(staff_only)):
    await get_project(pid, member)
    order = await db.floors.count_documents({"project_id": pid})
    doc = {"id": new_id(), "project_id": pid, "name": body.name.strip(), "order": order, "plan_file_id": None,
           "plan_aspect": None, "layout3d_file_id": None, "layout3d_caption": "", "created_at": now_iso()}
    await db.floors.insert_one({**doc})
    await touch(pid)
    return doc


@api.patch("/floors/{fid}")
async def update_floor(fid: str, body: FloorUpdate, member: dict = Depends(staff_only)):
    f = await get_doc("floors", fid)
    await get_project(f["project_id"], member)
    await db.floors.update_one({"id": fid}, {"$set": body.model_dump(exclude_unset=True)})
    await touch(f["project_id"])
    return await get_doc("floors", fid)


@api.delete("/floors/{fid}")
async def delete_floor(fid: str, member: dict = Depends(staff_only)):
    f = await get_doc("floors", fid)
    await get_project(f["project_id"], member)
    sids = [s["id"] for s in await db.scenes.find({"floor_id": fid}, {"id": 1}).to_list(5000)]
    await db.scenes.delete_many({"floor_id": fid})
    await db.rooms.delete_many({"floor_id": fid})
    await db.floors.delete_one({"id": fid})
    await db.projects.update_one({"id": f["project_id"]}, {"$pull": {"tour_order": {"$in": sids}}, "$set": {"updated_at": now_iso()}})
    return {"ok": True}


@api.post("/floors/{fid}/image/{kind}")
async def upload_floor_image(fid: str, kind: str, file: UploadFile = File(...), member: dict = Depends(staff_only)):
    if kind not in ("plan", "layout3d"):
        raise HTTPException(404, "Not found")
    f = await get_doc("floors", fid)
    await get_project(f["project_id"], member)
    doc = await save_upload(file, f["project_id"], kind)
    update = {f"{kind}_file_id": doc["id"]}
    if kind == "plan":
        update["plan_aspect"] = doc["aspect"]
    await db.floors.update_one({"id": fid}, {"$set": update})
    await touch(f["project_id"])
    return await get_doc("floors", fid)


# ---------- rooms ----------
@api.post("/floors/{fid}/rooms")
async def create_room(fid: str, body: NameIn, member: dict = Depends(staff_only)):
    f = await get_doc("floors", fid)
    await get_project(f["project_id"], member)
    order = await db.rooms.count_documents({"project_id": f["project_id"]})
    doc = {"id": new_id(), "project_id": f["project_id"], "floor_id": fid, "name": body.name.strip(), "order": order, "created_at": now_iso()}
    await db.rooms.insert_one({**doc})
    await touch(f["project_id"])
    return doc


@api.patch("/rooms/{rid}")
async def update_room(rid: str, body: NameIn, member: dict = Depends(staff_only)):
    r = await get_doc("rooms", rid)
    await get_project(r["project_id"], member)
    await db.rooms.update_one({"id": rid}, {"$set": {"name": body.name.strip()}})
    return await get_doc("rooms", rid)


@api.delete("/rooms/{rid}")
async def delete_room(rid: str, member: dict = Depends(staff_only)):
    r = await get_doc("rooms", rid)
    await get_project(r["project_id"], member)
    sids = [s["id"] for s in await db.scenes.find({"room_id": rid}, {"id": 1}).to_list(5000)]
    await db.scenes.delete_many({"room_id": rid})
    await db.rooms.delete_one({"id": rid})
    await db.projects.update_one({"id": r["project_id"]}, {"$pull": {"tour_order": {"$in": sids}}, "$set": {"updated_at": now_iso()}})
    return {"ok": True}


# ---------- scenes ----------
@api.post("/rooms/{rid}/scenes")
async def create_scene(rid: str, file: UploadFile = File(...), member: dict = Depends(staff_only)):
    r = await get_doc("rooms", rid)
    await get_project(r["project_id"], member)
    up = await save_upload(file, r["project_id"], "render")
    order = await db.scenes.count_documents({"room_id": rid})
    title = Path(file.filename or "").stem.replace("_", " ").replace("-", " ").strip()[:80]
    doc = {"id": new_id(), "project_id": r["project_id"], "floor_id": r["floor_id"], "room_id": rid, "title": title,
           "description": "", "area": "", "image_file_id": up["id"], "aspect": up["aspect"], "order": order,
           "hotspots": [], "camera": None, "hotspots_need_check": False, "created_at": now_iso()}
    await db.scenes.insert_one({**doc})
    await db.projects.update_one({"id": r["project_id"]}, {"$push": {"tour_order": doc["id"]}, "$set": {"updated_at": now_iso()}})
    return with_urls([], [doc])[1][0]


@api.patch("/scenes/{sid}")
async def update_scene(sid: str, body: SceneUpdate, member: dict = Depends(staff_only)):
    s = await get_doc("scenes", sid)
    await get_project(s["project_id"], member)
    data = body.model_dump(exclude_unset=True, exclude={"clear_camera"})
    if body.clear_camera:
        data["camera"] = None
    if "room_id" in data:
        room = await get_doc("rooms", data["room_id"])
        if room["project_id"] != s["project_id"]:
            raise HTTPException(400, "Ruangan tidak valid")
        data["floor_id"] = room["floor_id"]
    await db.scenes.update_one({"id": sid}, {"$set": data})
    await touch(s["project_id"])
    return with_urls([], [await get_doc("scenes", sid)])[1][0]


@api.post("/scenes/{sid}/image")
async def replace_scene_image(sid: str, file: UploadFile = File(...), member: dict = Depends(staff_only)):
    s = await get_doc("scenes", sid)
    await get_project(s["project_id"], member)
    up = await save_upload(file, s["project_id"], "render")
    changed = abs(up["aspect"] - (s.get("aspect") or up["aspect"])) / (s.get("aspect") or 1) > 0.01
    data = {"image_file_id": up["id"], "aspect": up["aspect"]}
    if changed and s.get("hotspots"):
        data["hotspots_need_check"] = True
    await db.scenes.update_one({"id": sid}, {"$set": data})
    await touch(s["project_id"])
    return with_urls([], [await get_doc("scenes", sid)])[1][0]


@api.post("/scenes/{sid}/confirm-hotspots")
async def confirm_hotspots(sid: str, member: dict = Depends(staff_only)):
    s = await get_doc("scenes", sid)
    await get_project(s["project_id"], member)
    await db.scenes.update_one({"id": sid}, {"$set": {"hotspots_need_check": False}})
    return with_urls([], [await get_doc("scenes", sid)])[1][0]


@api.post("/scenes/{sid}/backlink")
async def create_backlink(sid: str, body: BacklinkIn, member: dict = Depends(staff_only)):
    s = await get_doc("scenes", sid)
    await get_project(s["project_id"], member)
    hs = next((h for h in s.get("hotspots", []) if h["id"] == body.hotspot_id), None)
    if not hs or not hs.get("target_scene_id"):
        raise HTTPException(400, "Hotspot belum punya tujuan")
    target = await db.scenes.find_one({"id": hs["target_scene_id"], "project_id": s["project_id"]}, {"_id": 0})
    if not target:
        raise HTTPException(400, "Scene tujuan tidak ada")
    if any(h.get("target_scene_id") == sid for h in target.get("hotspots", [])):
        return {"created": False, "target_scene_id": target["id"]}
    room = await db.rooms.find_one({"id": s["room_id"]}, {"_id": 0, "name": 1})
    label = s.get("title") or (room or {}).get("name") or "Kembali"
    back = {"id": new_id(), "x": round(1 - hs["x"], 4), "y": hs["y"], "target_scene_id": sid, "label": label}
    await db.scenes.update_one({"id": target["id"]}, {"$push": {"hotspots": back}})
    return {"created": True, "target_scene_id": target["id"], "hotspot": back}


@api.delete("/scenes/{sid}")
async def delete_scene(sid: str, member: dict = Depends(staff_only)):
    s = await get_doc("scenes", sid)
    await get_project(s["project_id"], member)
    await db.scenes.delete_one({"id": sid})
    await db.projects.update_one({"id": s["project_id"]}, {"$pull": {"tour_order": sid}, "$set": {"updated_at": now_iso()}})
    return {"ok": True}


# ---------- images (signed) ----------
@api.get("/img/{fid}/{variant}")
async def serve_image(fid: str, variant: str, request: Request, e: int = Query(...), s: str = Query(...)):
    if variant not in ("web", "thumb", "audio") or not storage.verify(fid, variant, e, s):
        raise HTTPException(403, "Link tidak valid atau kedaluwarsa")
    rec = await db.files.find_one({"id": fid, "is_deleted": False}, {"_id": 0, "paths": 1, "content_type": 1})
    if not rec or variant not in rec["paths"]:
        raise HTTPException(404, "File tidak ditemukan")
    data = await run_in_threadpool(storage.get_object, rec["paths"][variant])
    headers = {"Cache-Control": "private, max-age=3600", "Accept-Ranges": "bytes"}
    if variant != "audio":
        return Response(content=data, media_type="image/webp", headers=headers)
    mime = rec.get("content_type") or "audio/mpeg"
    rng = request.headers.get("range", "")
    if rng.startswith("bytes="):
        size = len(data)
        try:
            start_s, _, end_s = rng[6:].split(",")[0].strip().partition("-")
            if start_s:
                start = int(start_s)
                end = min(int(end_s), size - 1) if end_s else size - 1
            else:
                start, end = max(0, size - int(end_s)), size - 1
        except ValueError:
            start, end = size, -1
        if start >= size or start > end:
            return Response(status_code=416, headers={"Content-Range": f"bytes */{size}"})
        headers["Content-Range"] = f"bytes {start}-{end}/{size}"
        return Response(content=data[start:end + 1], status_code=206, media_type=mime, headers=headers)
    return Response(content=data, media_type=mime, headers=headers)


@api.get("/")
async def root():
    return {"status": "ok"}


app.include_router(api)
app.include_router(clerk_router)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
