import hashlib
import hmac
import io
import os
import time
from collections import OrderedDict

import requests
from PIL import Image, ImageOps

Image.MAX_IMAGE_PIXELS = 200_000_000
APP_NAME = "inerre"
URL_TTL = 6 * 3600
_storage_key = None
_cache: "OrderedDict[str, bytes]" = OrderedDict()
_CACHE_MAX = 200


def _storage_url() -> str:
    base = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
    return base.rstrip("/") + "/objstore/api/v1/storage"


def init_storage(force: bool = False) -> str:
    global _storage_key
    if _storage_key and not force:
        return _storage_key
    resp = requests.post(f"{_storage_url()}/init", json={"emergent_key": os.environ.get("EMERGENT_LLM_KEY")}, timeout=30)
    resp.raise_for_status()
    _storage_key = resp.json()["storage_key"]
    return _storage_key


def _request(method: str, path: str, **kw) -> requests.Response:
    for attempt in range(2):
        key = init_storage(force=attempt > 0)
        headers = {"X-Storage-Key": key, **kw.pop("headers", {})}
        resp = requests.request(method, f"{_storage_url()}/objects/{path}", headers=headers, timeout=120, **kw)
        if resp.status_code != 404 or attempt == 1:
            resp.raise_for_status()
            return resp
    raise RuntimeError("unreachable")


def put_object(path: str, data: bytes, content_type: str) -> dict:
    return _request("PUT", path, headers={"Content-Type": content_type}, data=data).json()


def get_object(path: str) -> bytes:
    if path in _cache:
        _cache.move_to_end(path)
        return _cache[path]
    data = _request("GET", path).content
    _cache[path] = data
    if len(_cache) > _CACHE_MAX:
        _cache.popitem(last=False)
    return data


def process_image(data: bytes) -> dict:
    img = Image.open(io.BytesIO(data))
    img = ImageOps.exif_transpose(img)
    img = img.convert("RGBA" if img.mode in ("RGBA", "LA", "P") else "RGB")
    width, height = img.size
    out = {"width": width, "height": height, "aspect": round(width / height, 5)}
    for name, size, quality in (("web", 2500, 82), ("thumb", 480, 70)):
        copy = img.copy()
        copy.thumbnail((size, size), Image.LANCZOS)
        buf = io.BytesIO()
        copy.save(buf, "WEBP", quality=quality, method=4)
        out[name] = buf.getvalue()
    return out


def _sig(file_id: str, variant: str, exp: int) -> str:
    secret = os.environ["IMG_SIGNING_SECRET"].encode()
    return hmac.new(secret, f"{file_id}:{variant}:{exp}".encode(), hashlib.sha256).hexdigest()[:40]


def signed_url(file_id, variant: str = "web"):
    if not file_id:
        return None
    # Bucketed expiry keeps URLs stable for an hour so the browser cache stays warm.
    exp = (int(time.time()) // 3600 + 1) * 3600 + URL_TTL
    return f"/api/img/{file_id}/{variant}?e={exp}&s={_sig(file_id, variant, exp)}"


def verify(file_id: str, variant: str, exp: int, sig: str) -> bool:
    return exp > time.time() and hmac.compare_digest(_sig(file_id, variant, exp), sig)
