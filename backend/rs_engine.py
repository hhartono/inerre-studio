import base64
import io
import json
import os

import httpx
from PIL import Image

OPENAI_URL = "https://api.openai.com/v1"
TIMEOUT = httpx.Timeout(300.0, connect=20.0)

DEFAULT_INSTRUCTION = (
    "Transform the supplied SketchUp screenshot into a highly photorealistic, premium architectural photograph. "
    "Preserve the source geometry, original camera perspective, furniture design, layout, architectural detailing, "
    "ceiling configuration, openings, and material assignments. Follow the approved material and ambience references. "
    "Do not redesign the space. Maintain realistic lighting, physically plausible reflections, natural material textures, "
    "balanced white tones, and sophisticated architectural photography. Avoid artificial CGI appearance, excessive yellow "
    "cast, oversaturation, unnecessary objects, and unrequested design changes."
)

PROTECTION = {
    "geometry": "Keep the architectural geometry exactly as in Image 1: walls, partitions, columns, beams and proportions.",
    "camera": "Keep the exact camera position, height and framing of Image 1.",
    "perspective": "Keep the same perspective, focal length and vanishing lines; no lens distortion changes.",
    "furniture_design": "Keep every furniture piece's design, shape and proportions as drawn; do not substitute furniture.",
    "furniture_placement": "Keep every furniture piece in its exact position and orientation.",
    "ceiling": "Keep the ceiling design, drops, coves and recesses exactly as drawn.",
    "openings": "Keep windows, doors and openings exactly where and how they are; never add new openings.",
    "fixtures": "Keep lighting fixtures in their exact positions; do not add or remove fixtures.",
    "materials": "Keep the material assigned to each surface; do not swap materials between surfaces.",
    "composition": "Keep the image composition and cropping; do not add or remove objects.",
}
PROTECTION_LABELS = {
    "geometry": "Kunci geometri arsitektur", "camera": "Kunci sudut kamera", "perspective": "Kunci perspektif",
    "furniture_design": "Kunci desain furnitur", "furniture_placement": "Kunci posisi furnitur", "ceiling": "Kunci desain plafon",
    "openings": "Kunci jendela & bukaan", "fixtures": "Kunci posisi lampu", "materials": "Kunci penempatan material",
    "composition": "Kunci komposisi gambar",
}

AI_CONTROLS = {
    "daylight": ("natural daylight intensity", "much less", "much more"),
    "artificial": ("artificial lighting intensity", "much dimmer", "much brighter"),
    "ambient": ("ambient fill light", "darker, moodier", "brighter, airier"),
    "shadow_softness": ("shadow softness", "crisper, harder", "softer, more diffused"),
    "reflection": ("reflection realism on glossy surfaces", "more subdued", "more pronounced and physically accurate"),
    "artificial_warmth": ("warmth of artificial lights", "cooler, closer to neutral 4000K", "warmer, closer to 2700K"),
    "photorealism": ("photographic realism", "slightly stylised", "maximum photographic realism"),
    "editorial": ("editorial photography style", "plain documentation style", "strong high-end editorial magazine style"),
    "cozy": ("cozy atmosphere", "more neutral and clinical", "warmer and cozier"),
    "cinematic": ("cinematic atmosphere", "flat, even", "more cinematic contrast and mood"),
}


class EngineError(Exception):
    pass


def _key() -> str:
    k = os.environ.get("OPENAI_API_KEY")
    if not k:
        raise EngineError("Kunci OpenAI belum diatur di server.")
    return k


def size_for(aspect: float) -> str:
    if aspect >= 1.2:
        return "1536x1024"
    if aspect <= 0.83:
        return "1024x1536"
    return "1024x1024"


def to_png(data: bytes, max_side: int = 2048) -> bytes:
    im = Image.open(io.BytesIO(data)).convert("RGB")
    im.thumbnail((max_side, max_side), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, "PNG")
    return buf.getvalue()


def finalize(out: bytes, parent: bytes = None, region: dict = None) -> bytes:
    """Flatten to RGB; for region edits keep every pixel outside the region from the parent."""
    from PIL import ImageDraw, ImageFilter
    res = Image.open(io.BytesIO(out))
    if res.mode in ("RGBA", "LA", "P"):
        res = res.convert("RGBA")
        bg = Image.new("RGB", res.size, (255, 255, 255))
        bg.paste(res, mask=res.split()[-1])
        res = bg
    res = res.convert("RGB")
    if parent and region:
        base = Image.open(io.BytesIO(parent)).convert("RGB")
        res = res.resize(base.size, Image.LANCZOS)
        w, h = base.size
        m = Image.new("L", base.size, 0)
        ImageDraw.Draw(m).rectangle((region["x"] * w, region["y"] * h, (region["x"] + region["w"]) * w, (region["y"] + region["h"]) * h), fill=255)
        m = m.filter(ImageFilter.GaussianBlur(max(2, int(min(w, h) * 0.006))))
        res = Image.composite(res, base, m)
    buf = io.BytesIO()
    res.save(buf, "PNG")
    return buf.getvalue()


def location_guide(source_png: bytes, targets: list) -> bytes:
    from PIL import ImageDraw, ImageFont
    im = Image.open(io.BytesIO(source_png)).convert("RGB")
    w, h = im.size
    d = ImageDraw.Draw(im)
    lw = max(3, w // 300)
    try:
        font = ImageFont.truetype("DejaVuSans-Bold.ttf", max(18, w // 40))
    except OSError:
        font = ImageFont.load_default()
    for t in targets:
        x0, y0, x1, y1 = t["x"] * w, t["y"] * h, (t["x"] + t["w"]) * w, (t["y"] + t["h"]) * h
        d.rectangle((x0, y0, x1, y1), outline=(255, 0, 140), width=lw)
        tb = d.textbbox((x0 + lw, y0 + lw), t["label"], font=font)
        d.rectangle((tb[0] - 4, tb[1] - 4, tb[2] + 4, tb[3] + 4), fill=(255, 0, 140))
        d.text((x0 + lw, y0 + lw), t["label"], fill=(255, 255, 255), font=font)
    buf = io.BytesIO()
    im.save(buf, "PNG")
    return buf.getvalue()


def rect_mask(source_png: bytes, region: dict) -> bytes:
    """Transparent pixels = area the model may edit (OpenAI convention)."""
    im = Image.open(io.BytesIO(source_png))
    w, h = im.size
    mask = Image.new("RGBA", (w, h), (0, 0, 0, 255))
    x0, y0 = int(region["x"] * w), int(region["y"] * h)
    x1, y1 = int((region["x"] + region["w"]) * w), int((region["y"] + region["h"]) * h)
    mask.paste((0, 0, 0, 0), (max(0, x0), max(0, y0), min(w, x1), min(h, y1)))
    buf = io.BytesIO()
    mask.save(buf, "PNG")
    return buf.getvalue()


def _explain(r: httpx.Response) -> str:
    try:
        msg = r.json().get("error", {}).get("message", "")
    except Exception:  # noqa: BLE001
        msg = r.text[:300]
    hint = {401: "Kunci OpenAI ditolak.", 429: "Batas pemakaian / saldo OpenAI tercapai.", 400: "Permintaan ditolak OpenAI."}.get(r.status_code, f"OpenAI error {r.status_code}.")
    return f"{hint} {msg}".strip()


async def image_edit(images: list, prompt: str, model: str, quality: str, size: str, mask: bytes = None):
    files = [("image[]", (f"ref{i}.png", b, "image/png")) for i, b in enumerate(images)]
    if mask:
        files.append(("mask", ("mask.png", mask, "image/png")))
    data = {"model": model, "prompt": prompt[:32000], "quality": quality, "size": size, "output_format": "png", "n": "1"}
    async with httpx.AsyncClient(timeout=TIMEOUT) as c:
        try:
            r = await c.post(f"{OPENAI_URL}/images/edits", headers={"Authorization": f"Bearer {_key()}"}, data=data, files=files)
        except httpx.TimeoutException:
            raise EngineError("OpenAI tidak merespons dalam 5 menit (timeout).")
        except httpx.HTTPError as e:
            raise EngineError(f"Koneksi ke OpenAI gagal: {type(e).__name__}")
    if r.status_code != 200:
        raise EngineError(_explain(r))
    j = r.json()
    if not j.get("data"):
        raise EngineError("OpenAI tidak mengembalikan gambar.")
    return base64.b64decode(j["data"][0]["b64_json"]), j.get("usage") or {}


async def vision_json(model: str, system: str, text: str, images: list = ()):
    content = [{"type": "text", "text": text}]
    for b in images:
        content.append({"type": "image_url", "image_url": {"url": "data:image/png;base64," + base64.b64encode(b).decode()}})
    body = {"model": model, "messages": [{"role": "system", "content": system}, {"role": "user", "content": content}],
            "response_format": {"type": "json_object"}}
    async with httpx.AsyncClient(timeout=TIMEOUT) as c:
        try:
            r = await c.post(f"{OPENAI_URL}/chat/completions", headers={"Authorization": f"Bearer {_key()}"}, json=body)
        except httpx.HTTPError as e:
            raise EngineError(f"Koneksi ke OpenAI gagal: {type(e).__name__}")
    if r.status_code != 200:
        raise EngineError(_explain(r))
    j = r.json()
    try:
        return json.loads(j["choices"][0]["message"]["content"]), j.get("usage") or {}
    except (KeyError, ValueError):
        raise EngineError("Jawaban analisis AI tidak bisa dibaca.")


def _ai_controls(ctrl: dict) -> list:
    out = []
    for k, (label, lo, hi) in AI_CONTROLS.items():
        v = int(ctrl.get(k, 0) or 0)
        if abs(v) >= 10:
            strength = "slightly" if abs(v) < 40 else "clearly" if abs(v) < 75 else "strongly"
            out.append(f"- {label}: {strength} {hi if v > 0 else lo}.")
    if ctrl.get("light_direction"):
        out.append(f"- Main natural light should come from the {ctrl['light_direction']}.")
    return out


def compile_prompt(ctx: dict) -> str:
    """ctx: protection, project, room, angle, ambience, materials, refs, controls, extra, revision, region."""
    p = [ctx.get("base_instruction") or DEFAULT_INSTRUCTION, "", "IMAGE ROLES:"]
    for i, role in enumerate(ctx["image_roles"], start=1):
        p.append(f"- Image {i}: {role}")
    p.append("Never copy architectural elements, furniture or layout from any reference image into the design. "
             "Image 1 is the only source of geometry, camera, composition and furniture placement.")
    locks = [PROTECTION[k] for k, on in (ctx.get("protection") or {}).items() if on and k in PROTECTION]
    if locks:
        p += ["", "DESIGN PROTECTION (mandatory, fidelity to the original design over decorative creativity):"] + [f"- {x}" for x in locks]
        if ctx.get("has_targets"):
            p.append("- Exception: objects inside a numbered location-guide box take their design and finish from their assigned reference image, "
                     "while keeping the size, position and orientation from Image 1. Wallpaper references keep their pattern and pattern scale.")
    amb = ctx.get("ambience")
    if amb:
        p += ["", f"AMBIENCE — {amb['name']} (v{amb['version_no']}):"]
        for key, label in (("lighting", "Lighting"), ("white_balance", "White balance"), ("exposure", "Exposure"), ("contrast", "Contrast"),
                           ("shadows", "Shadows"), ("natural_light", "Natural light"), ("artificial_light", "Artificial light"),
                           ("palette", "Colour palette"), ("avoid", "Avoid")):
            if amb.get(key):
                p.append(f"- {label}: {amb[key]}")
    if ctx.get("master_note"):
        p.append(f"- {ctx['master_note']}")
    mats = ctx.get("materials") or []
    if mats:
        p += ["", "MATERIALS (locked specifications, follow exactly):"]
        for m in mats:
            spec = "; ".join(x for x in [
                f"surface: {m['surface']}" if m.get("surface") else "", m.get("finish") and f"finish: {m['finish']}",
                m.get("base_color") and f"colour: {m['base_color']}", m.get("grain_direction") and f"grain: {m['grain_direction']}",
                m.get("texture_scale") and f"texture scale: {m['texture_scale']}", m.get("roughness") and f"surface: {m['roughness']}",
                m.get("reflection") and f"reflection: {m['reflection']}", m.get("instructions"),
                m.get("negative") and f"never: {m['negative']}"] if x)
            p.append(f"- {m['code']} {m['name']} ({m['category']}, v{m['version_no']}): {spec}")
    for label, key in (("PROJECT", "project_instructions"), ("ROOM", "room_instructions"), ("SCENE", "angle_instructions")):
        if ctx.get(key):
            p += ["", f"{label} INSTRUCTIONS:", ctx[key]]
    ctrl = _ai_controls(ctx.get("controls") or {})
    if ctrl:
        p += ["", "LIGHTING & VISUAL DIRECTION:"] + ctrl
    if ctx.get("revision"):
        p += ["", "REVISION REQUEST (apply only this change, keep everything else identical to the previous render):", ctx["revision"]]
    if ctx.get("region"):
        p.append("Edit only inside the transparent masked area; every pixel outside it must remain unchanged.")
    if ctx.get("extra"):
        p += ["", "ADDITIONAL INSTRUCTIONS:", ctx["extra"]]
    return "\n".join(x for x in p if x is not None)
