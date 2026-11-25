# Render Studio reference target boxes ("Tandai lokasi"): PATCH validation/clamping, persistence,
# prompt-preview roles + LOCATION GUIDE image, optional single real render (RS_REAL=1, 1 OpenAI call).
# Run: pytest -n0 test_rs_targets.py -v   (RS_KEEP=1 keeps the TEST_ project for UI testing)
import io
import os
import time

import pytest
from PIL import Image, ImageDraw

S = {}


def sketch_png(w=1536, h=1024):
    im = Image.new("RGB", (w, h), (225, 222, 215))
    d = ImageDraw.Draw(im)
    d.polygon([(0, h), (w, h), (int(w * .8), int(h * .65)), (int(w * .2), int(h * .65))], fill=(180, 170, 155))  # floor
    d.rectangle((int(w * .2), int(h * .15), int(w * .8), int(h * .65)), fill=(240, 238, 232), outline=(60, 60, 60), width=3)  # back wall
    d.rectangle((int(w * .4), int(h * .5), int(w * .6), int(h * .75)), fill=(120, 110, 100), outline=(30, 30, 30), width=3)  # sofa block
    d.line((int(w * .5), 0, int(w * .5), int(h * .25)), fill=(30, 30, 30), width=3)
    d.ellipse((int(w * .46), int(h * .25), int(w * .54), int(h * .32)), fill=(200, 200, 200), outline=(30, 30, 30), width=3)  # pendant
    b = io.BytesIO(); im.save(b, "PNG"); return b.getvalue()


def ref_png(color, pattern=False):
    im = Image.new("RGB", (600, 400), color)
    if pattern:
        d = ImageDraw.Draw(im)
        for x in range(0, 600, 40):
            d.line((x, 0, x, 400), fill=(30, 60, 40), width=6)
    b = io.BytesIO(); im.save(b, "PNG"); return b.getvalue()


def poll(c, rid, timeout=300):
    t0 = time.time()
    while time.time() - t0 < timeout:
        r = c.get(f"/api/rs/renders/{rid}").json()
        if r["status"] in ("completed", "failed"):
            return r
        time.sleep(5)
    pytest.fail("render timeout")


# ---------- setup ----------
def test_setup(designer):
    p = designer.post("/api/rs/projects", json={"name": "TEST_RS_Targets", "code": "TEST-TG"}).json()
    S["pid"] = p["id"]
    room = designer.post(f"/api/rs/projects/{p['id']}/rooms", json={"name": "TEST_Room"}).json()
    a = designer.post(f"/api/rs/rooms/{room['id']}/angles", files={"file": ("TEST_src.png", sketch_png(), "image/png")}, data={"name": "TEST_Angle"})
    assert a.status_code == 200, a.text
    S["aid"] = a.json()["id"]
    for k, png in (("f1", ref_png((90, 60, 40))), ("f2", ref_png((200, 210, 190), True))):
        u = designer.post("/api/rs/files", files={"file": (f"TEST_{k}.png", png, "image/png")}, data={"scope": p["id"]})
        assert u.status_code == 200, u.text
        S[k] = u.json()["id"]


# ---------- validation ----------
@pytest.mark.parametrize("target,msg", [
    ({"x": "abc", "y": 0.1, "w": 0.2, "h": 0.2}, "Lokasi target tidak valid"),
    ({"x": 0.1, "y": 0.1, "w": 0.2}, "Lokasi target tidak valid"),
    ({"x": 0.1, "y": 0.1, "w": None, "h": 0.2}, "Lokasi target tidak valid"),
    ({"x": 0.1, "y": 0.1, "w": 0.005, "h": 0.2}, "terlalu kecil"),
    ({"x": 0.1, "y": 0.1, "w": 0.2, "h": -0.3}, "terlalu kecil"),
])
def test_target_invalid(designer, target, msg):
    r = designer.patch(f"/api/rs/angles/{S['aid']}", json={"references": [{"file_id": S["f1"], "role": "furniture", "target": target}]})
    assert r.status_code == 400, r.text
    assert msg in r.json()["detail"]
    assert designer.get(f"/api/rs/angles/{S['aid']}").json()["references"] == []


def test_target_non_dict(designer):
    r = designer.patch(f"/api/rs/angles/{S['aid']}", json={"references": [{"file_id": S["f1"], "role": "furniture", "target": "abc"}]})
    print("non-dict target ->", r.status_code)
    assert r.status_code in (400, 422)


def test_target_clamped(designer):
    r = designer.patch(f"/api/rs/angles/{S['aid']}", json={"references": [{"file_id": S["f1"], "role": "furniture", "target": {"x": -0.2, "y": 0.3, "w": 1.5, "h": "0.4"}}]})
    assert r.status_code == 200, r.text
    assert r.json()["references"][0]["target"] == {"x": 0.0, "y": 0.3, "w": 1.0, "h": 0.4}


def test_target_save_and_persist(designer):
    refs = [{"file_id": S["f1"], "role": "furniture", "note": "", "target": {"x": 0.38, "y": 0.48, "w": 0.24, "h": 0.3}},
            {"file_id": S["f2"], "role": "material", "note": "", "target": None}]
    r = designer.patch(f"/api/rs/angles/{S['aid']}", json={"references": refs})
    assert r.status_code == 200, r.text
    g = designer.get(f"/api/rs/angles/{S['aid']}").json()["references"]
    assert g[0]["target"] == {"x": 0.38, "y": 0.48, "w": 0.24, "h": 0.3} and g[0]["role"] == "furniture"
    assert g[1].get("target") is None and g[1]["role"] == "material"
    assert g[0]["url"] and g[0]["thumb"]


# ---------- prompt preview ----------
def test_prompt_preview_targets(admin):
    pv = admin.get(f"/api/rs/angles/{S['aid']}/prompt-preview")
    assert pv.status_code == 200, pv.text
    pv = pv.json()
    roles = pv["image_roles"]
    print("\n".join(roles))
    fur = [x for x in roles if x.startswith("loose furniture")]
    mat = [x for x in roles if x.startswith("material / wallpaper")]
    assert len(fur) == 1 and "applies ONLY to the object inside box R1" in fur[0]
    assert "keep the size, position and orientation" in fur[0]
    assert "left 38%, top 48%, width 24%, height 30%" in fur[0]
    assert len(mat) == 1 and "pattern and pattern scale" in mat[0] and "box" not in mat[0]
    assert roles[-1].startswith("LOCATION GUIDE ONLY")
    assert sum(x.startswith("LOCATION GUIDE") for x in roles) == 1
    assert "numbered location-guide box" in pv["prompt"] and "Exception:" in pv["prompt"]
    assert f"Image {len(roles)}: LOCATION GUIDE ONLY" in pv["prompt"]


def test_prompt_preview_no_targets(admin, designer):
    refs = [{"file_id": S["f1"], "role": "furniture", "note": "", "target": None}]
    assert designer.patch(f"/api/rs/angles/{S['aid']}", json={"references": refs}).status_code == 200
    pv = admin.get(f"/api/rs/angles/{S['aid']}/prompt-preview").json()
    assert not any("LOCATION GUIDE" in x for x in pv["image_roles"])
    assert "numbered location-guide box" not in pv["prompt"]
    # restore single targeted furniture ref for real render / UI
    refs[0]["target"] = {"x": 0.38, "y": 0.48, "w": 0.24, "h": 0.3}
    assert designer.patch(f"/api/rs/angles/{S['aid']}", json={"references": refs}).status_code == 200


# ---------- optional real render ----------
@pytest.mark.skipif(not os.environ.get("RS_REAL"), reason="set RS_REAL=1 for 1 real OpenAI call")
def test_real_render_with_guide(designer):
    r = designer.post(f"/api/rs/angles/{S['aid']}/render", json={"mode": "draft", "quality": "low"})
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["image_roles"][-1].startswith("LOCATION GUIDE ONLY") and len(j["image_ids"]) == len(j["image_roles"])
    t0 = time.time()
    done = poll(designer, j["id"])
    print(f"render {done['status']} in {time.time() - t0:.0f}s err={done.get('error')} usage={done.get('usage')}")
    assert done["status"] == "completed", done.get("error")
    assert done["raw"]["url"]
    S["rid"] = done["id"]


# ---------- cleanup ----------
def test_zz_cleanup(admin):
    if os.environ.get("RS_KEEP"):
        print("KEEP pid", S.get("pid"), "aid", S.get("aid"))
        return
    if S.get("pid"):
        assert admin.delete(f"/api/rs/projects/{S['pid']}").status_code == 200
        assert admin.get(f"/api/rs/projects/{S['pid']}").status_code == 404
