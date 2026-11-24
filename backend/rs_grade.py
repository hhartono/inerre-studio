import io

import numpy as np
from PIL import Image, ImageFilter

KEYS = ("temperature", "tint", "yellow", "exposure", "contrast", "highlights", "shadows",
        "whites", "blacks", "saturation", "vibrance", "sharpness")


def _smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def _lum(c):
    return 0.2126 * c[..., 0] + 0.7152 * c[..., 1] + 0.0722 * c[..., 2]


def apply_grade(c: np.ndarray, a: dict) -> np.ndarray:
    """Same math as frontend/src/lib/grade.ts. c: float32 HxWx3 in 0..1."""
    v = {k: float(a.get(k, 0) or 0) / 100.0 for k in KEYS}
    c = c * (2.0 ** (v["exposure"] * 2))
    c[..., 0] += v["temperature"] * 0.1
    c[..., 2] -= v["temperature"] * 0.1
    c[..., 1] -= v["tint"] * 0.08
    c[..., 0] += v["yellow"] * 0.05
    c[..., 1] += v["yellow"] * 0.05
    c[..., 2] -= v["yellow"] * 0.1
    L = _lum(c)
    d = (v["highlights"] * 0.25 * _smooth(0.5, 1.0, L) + v["shadows"] * 0.25 * (1 - _smooth(0.0, 0.5, L))
         + v["whites"] * 0.15 * _smooth(0.75, 1.0, L) + v["blacks"] * 0.15 * (1 - _smooth(0.0, 0.25, L)))
    c = c + d[..., None]
    c = (c - 0.5) * (1 + v["contrast"]) + 0.5
    L = _lum(c)[..., None]
    c = L + (c - L) * (1 + v["saturation"])
    m = (c.max(axis=2) - c.min(axis=2))[..., None]
    c = L + (c - L) * (1 + v["vibrance"] * (1 - np.clip(m, 0, 1)))
    return np.clip(c, 0, 1)


def grade_bytes(data: bytes, adjust: dict, fmt: str = "PNG") -> bytes:
    img = Image.open(io.BytesIO(data)).convert("RGB")
    sharp = float(adjust.get("sharpness", 0) or 0) / 100.0
    arr = np.asarray(img, dtype=np.float32) / 255.0
    out = apply_grade(arr, adjust)
    if sharp:
        blur = np.asarray(Image.fromarray((out * 255).astype(np.uint8)).filter(ImageFilter.BoxBlur(1)), dtype=np.float32) / 255.0
        out = np.clip(out + sharp * (out - blur), 0, 1)
    res = Image.fromarray((out * 255 + 0.5).astype(np.uint8))
    buf = io.BytesIO()
    res.save(buf, fmt, **({"quality": 95} if fmt == "JPEG" else {}))
    return buf.getvalue()
