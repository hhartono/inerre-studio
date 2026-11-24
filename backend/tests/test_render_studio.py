# Render Studio (/api/rs/*) end-to-end regression: auth/roles, seeds, CRUD, real OpenAI render,
# duplicate guard, grading/download, review, approved zip, ambience master, region revise, series,
# failure handling, material approve/lock flow. Run with: pytest -n0 test_render_studio.py -v
# Uses <= 5 real OpenAI image calls (draft/low).
import hashlib
import io
import os
import time
import zipfile
from pathlib import Path

import pytest
import requests
from dotenv import dotenv_values
from PIL import Image

from conftest import BASE_URL, make_jpeg

S = {}  # shared state across ordered tests
REUSED_RENDER = "e10633c0ce79420585c1c465fa589d81"  # pending render in main agent's TEST_Autumn project


def poll(c, rid, want=("completed", "failed"), timeout=240):
    t0 = time.time()
    while time.time() - t0 < timeout:
        r = c.get(f"/api/rs/renders/{rid}").json()
        if r["status"] in want:
            return r
        time.sleep(4)
    pytest.fail(f"render {rid} not finished in {timeout}s (last={r['status']})")


def img_size(b):
    return Image.open(io.BytesIO(b)).size


# ---------- auth & roles ----------
def test_no_token_401():
    r = requests.get(f"{BASE_URL}/api/rs/projects", timeout=20)
    assert r.status_code == 401


def test_client_forbidden(client_user):
    for p in ("/api/rs/projects", "/api/rs/materials", "/api/rs/settings", "/api/rs/ambiences"):
        assert client_user.get(p).status_code == 403, p


def test_designer_admin_only_endpoints(designer):
    assert designer.put("/api/rs/settings", json={"draft_quality": "low"}).status_code == 403
    assert designer.post("/api/rs/ambiences", json={"name": "TEST_x"}).status_code == 403
    assert designer.patch("/api/rs/ambiences/xyz", json={"name": "TEST_x"}).status_code == 403
    assert designer.delete("/api/rs/projects/xyz").status_code == 403
    assert designer.get("/api/rs/angles/xyz/prompt-preview").status_code == 403
    assert designer.post("/api/rs/material-versions/xyz/approve").status_code == 403
    assert designer.post("/api/rs/material-versions/xyz/lock").status_code == 403
    assert designer.post("/api/rs/materials/xyz/versions").status_code == 403
    assert designer.get("/api/rs/projects").status_code == 200


# ---------- seeds & settings ----------
def test_seeds(admin):
    mats = admin.get("/api/rs/materials").json()
    seeded = {m["code"]: m for m in mats if m["code"].startswith("MAT-")}
    assert sorted(seeded) == ["MAT-001", "MAT-002", "MAT-003", "MAT-004", "MAT-005", "MAT-006", "MAT-008", "MAT-009", "MAT-010"]
    for m in seeded.values():
        assert m["status"] == "uncalibrated"
        assert m["versions"][0] == {"version_no": 1, "status": "draft"}
    ambs = admin.get("/api/rs/ambiences").json()
    assert len([a for a in ambs if a.get("seeded")]) == 9


def test_settings_no_key(admin):
    r = admin.get("/api/rs/settings")
    assert r.status_code == 200
    j = r.json()
    assert j["key_configured"] is True
    assert "sk-" not in r.text and "api_key" not in r.text.lower()
    S["settings"] = j


# ---------- project CRUD ----------
def test_project_crud(admin, designer):
    p = designer.post("/api/rs/projects", json={"name": "TEST_RS_Project", "code": "TEST-RS"}).json()
    S["pid"] = p["id"]
    assert designer.post("/api/rs/projects", json={"name": "  "}).status_code == 400
    room = designer.post(f"/api/rs/projects/{p['id']}/rooms", json={"name": "TEST_Living"}).json()
    S["room"] = room["id"]
    ids = []
    for i, col in enumerate([(150, 130, 110), (90, 110, 130)]):
        r = designer.post(f"/api/rs/rooms/{room['id']}/angles", files={"file": (f"TEST_a{i}.jpg", make_jpeg(1600, 1000, col), "image/jpeg")},
                          data={"name": f"TEST_Angle{i}"})
        assert r.status_code == 200, r.text
        a = r.json()
        assert a["source"]["url"] and a["name"] == f"TEST_Angle{i}"
        ids.append(a["id"])
    S["A"], S["B"] = ids
    # non-image upload rejected
    r = designer.post(f"/api/rs/rooms/{room['id']}/angles", files={"file": ("x.txt", b"hello", "text/plain")})
    assert r.status_code == 400
    # angle patch validation
    up = designer.post("/api/rs/files", files={"file": ("TEST_ref.jpg", make_jpeg(400, 300), "image/jpeg")}, data={"scope": "refs"}).json()
    assert designer.patch(f"/api/rs/angles/{S['A']}", json={"references": [{"file_id": up["id"], "role": "bogus"}]}).status_code == 400
    mats = designer.get("/api/rs/materials").json()
    m1 = next(m for m in mats if m["code"] == "MAT-001")
    assert designer.patch(f"/api/rs/angles/{S['A']}", json={"materials": [{"material_id": m1["id"], "version_no": 99}]}).status_code == 400
    r = designer.patch(f"/api/rs/angles/{S['A']}", json={"instructions": "TEST keep simple",
                                                         "materials": [{"material_id": m1["id"], "version_no": 1, "surface": "wall"}]})
    assert r.status_code == 200, r.text
    assert r.json()["materials"][0]["version_no"] == 1
    got = designer.get(f"/api/rs/projects/{p['id']}").json()
    assert len(got["angles"]) == 2 and got["rooms"][0]["name"] == "TEST_Living"
    S["mat_snapshot"] = admin.get(f"/api/rs/materials/{m1['id']}").json()["versions"]
    S["m1"] = m1["id"]


# ---------- TEST1 real render + duplicate guard ----------
def test_render_and_duplicate(designer):
    r = designer.post(f"/api/rs/angles/{S['A']}/render", json={"mode": "draft", "quality": "low"})
    assert r.status_code == 200, r.text
    job = r.json()
    assert job["status"] == "queued" and job["version_no"] == 1 and job["kind"] == "render"
    d = designer.post(f"/api/rs/angles/{S['A']}/render", json={"mode": "draft", "quality": "low"})
    assert d.status_code == 409
    t0 = time.time()
    done = poll(designer, job["id"])
    print(f"render took {time.time() - t0:.0f}s status={done['status']} err={done.get('error')}")
    assert done["status"] == "completed", done.get("error")
    assert done["raw"]["url"]
    assert "MAT-001" in "\n".join(done["image_roles"]) or done["materials"][0]["code"] == "MAT-001"
    S["rA1"] = done["id"]


# ---------- TEST7 review never touches materials ----------
def test_review_feedback(designer, admin):
    r = designer.patch(f"/api/rs/renders/{S['rA1']}/review", json={"feedback": "TEST terlalu kuning"})
    assert r.status_code == 200, r.text
    assert r.json()["feedback"][-1]["text"] == "TEST terlalu kuning"
    assert designer.patch(f"/api/rs/renders/{S['rA1']}/review", json={"approval": "bogus"}).status_code == 400
    after = admin.get(f"/api/rs/materials/{S['m1']}").json()["versions"]
    assert after == S["mat_snapshot"]


# ---------- TEST2/3 grading & download ----------
def test_grade_and_download(designer):
    rid = S["rA1"]
    raw1 = designer.get(f"/api/rs/renders/{rid}/download?variant=raw&fmt=png")
    assert raw1.status_code == 200 and raw1.headers["content-type"] == "image/png"
    raw_id = designer.get(f"/api/rs/renders/{rid}").json()["raw_file_id"]
    g = designer.post(f"/api/rs/renders/{rid}/grade", json={"adjust": {"yellow": -60, "exposure": 20}})
    assert g.status_code == 200, g.text
    gj = g.json()
    assert gj["graded_file_id"] and gj["raw_file_id"] == raw_id and gj["adjust"] == {"yellow": -60, "exposure": 20}
    gp = designer.get(f"/api/rs/renders/{rid}/download?variant=graded&fmt=png")
    gjpg = designer.get(f"/api/rs/renders/{rid}/download?variant=graded&fmt=jpeg")
    raw2 = designer.get(f"/api/rs/renders/{rid}/download?variant=raw&fmt=png")
    assert gjpg.headers["content-type"] == "image/jpeg" and gjpg.content[:2] == b"\xff\xd8"
    assert hashlib.md5(gp.content).digest() != hashlib.md5(raw1.content).digest()
    assert raw1.content == raw2.content
    assert img_size(gp.content) == img_size(raw1.content) == img_size(gjpg.content)
    src = designer.get(f"/api/rs/renders/{rid}/download?variant=source&fmt=png")
    assert src.status_code == 200


# ---------- approved zip / master ----------
def test_zip_and_master(designer):
    assert designer.get(f"/api/rs/projects/{S['pid']}/approved.zip").status_code == 404
    assert designer.post(f"/api/rs/renders/{REUSED_RENDER}/master", json={"scope": "project"}).status_code == 400
    assert designer.post(f"/api/rs/renders/{S['rA1']}/master", json={"scope": "project"}).status_code == 400
    r = designer.patch(f"/api/rs/renders/{S['rA1']}/review", json={"approval": "approved"})
    assert r.json()["approval"] == "approved"
    z = designer.get(f"/api/rs/projects/{S['pid']}/approved.zip")
    assert z.status_code == 200 and z.headers["content-type"] == "application/zip"
    names = zipfile.ZipFile(io.BytesIO(z.content)).namelist()
    assert names == ["TEST_Living/TEST_Angle0-v01.png"], names
    assert designer.post(f"/api/rs/renders/{S['rA1']}/master", json={"scope": "project"}).json()["ok"]
    assert designer.get(f"/api/rs/projects/{S['pid']}").json()["master_render_id"] == S["rA1"]


def test_prompt_preview_master(admin):
    pv = admin.get(f"/api/rs/angles/{S['B']}/prompt-preview").json()
    assert any("PROJECT AMBIENCE MASTER" in x for x in pv["image_roles"]), pv["image_roles"]
    pa = admin.get(f"/api/rs/angles/{S['A']}/prompt-preview").json()
    assert not any("PROJECT AMBIENCE MASTER" in x for x in pa["image_roles"])


# ---------- TEST8 region revise + series ----------
def test_revise_and_series(designer):
    assert designer.post(f"/api/rs/renders/{S['rA1']}/revise", json={"instruction": " "}).status_code == 400
    assert designer.post(f"/api/rs/renders/{S['rA1']}/revise", json={"instruction": "x", "region": {"x": 0.1, "y": 0.1, "w": 0.01, "h": 0.5}}).status_code == 400
    rv = designer.post(f"/api/rs/renders/{S['rA1']}/revise",
                       json={"instruction": "Make the selected wall area slightly lighter beige", "region": {"x": 0.1, "y": 0.2, "w": 0.3, "h": 0.3}, "mode": "draft"})
    assert rv.status_code == 200, rv.text
    rvj = rv.json()
    assert rvj["version_no"] == 2 and rvj["kind"] == "local" and rvj["parent_id"] == S["rA1"]
    se = designer.post(f"/api/rs/projects/{S['pid']}/series", json={"angle_ids": [S["A"], S["B"]], "mode": "draft", "quality": "low"})
    assert se.status_code == 200, se.text
    sj = se.json()
    assert sj["skipped"] == [S["A"]] and len(sj["jobs"]) == 1 and sj["jobs"][0]["angle_id"] == S["B"]
    assert any("PROJECT AMBIENCE MASTER" in x for x in sj["jobs"][0]["image_roles"])
    se2 = designer.post(f"/api/rs/projects/{S['pid']}/series", json={"angle_ids": [S["B"]], "mode": "draft"}).json()
    assert se2["skipped"] == [S["B"]] and se2["jobs"] == []
    v2 = poll(designer, rvj["id"])
    b1 = poll(designer, sj["jobs"][0]["id"])
    print("revise:", v2["status"], v2.get("error"), "| series B:", b1["status"], b1.get("error"))
    assert v2["status"] == "completed", v2.get("error")
    assert b1["status"] == "completed", b1.get("error")
    v1 = designer.get(f"/api/rs/renders/{S['rA1']}").json()
    assert v1["status"] == "completed" and v1["approval"] == "approved" and v1["raw_file_id"]
    rows = designer.get(f"/api/rs/angles/{S['A']}/renders").json()
    assert [r["version_no"] for r in rows] == [2, 1]
    S["rB1"] = b1["id"]


# ---------- TEST11 failure ----------
def test_custom_model_failure(admin, designer):
    assert admin.put("/api/rs/settings", json={"draft_quality": "ultra"}).status_code == 400
    try:
        admin.put("/api/rs/settings", json={"custom_model": "TEST-invalid-model-xyz"}).raise_for_status()
        r = designer.post(f"/api/rs/angles/{S['B']}/render", json={"mode": "custom", "quality": "low"})
        assert r.status_code == 200, r.text
        f = poll(designer, r.json()["id"], timeout=120)
        print("custom failure error:", f.get("error"))
        assert f["status"] == "failed" and len(f["error"]) > 10
        S["fail_angle"] = S["B"]
    finally:
        admin.put("/api/rs/settings", json={"custom_model": ""})
    assert admin.get("/api/rs/settings").json()["custom_model"] == ""
    assert designer.post(f"/api/rs/angles/{S['B']}/render", json={"mode": "custom"}).status_code == 400
    assert designer.get(f"/api/rs/angles/{S['B']}").json()["source"]["url"]


# ---------- TEST4 materials approve/lock ----------
def test_material_flow(admin, designer):
    assert designer.post("/api/rs/materials", json={"code": "TEST-MAT-1", "name": "TEST Mat", "category": "Bogus"}).status_code == 400
    m = designer.post("/api/rs/materials", json={"code": "TEST-MAT-1", "name": "TEST Mat", "category": "HPL"})
    assert m.status_code == 200, m.text
    mid = m.json()["id"]
    S["tmat"] = mid
    assert designer.post("/api/rs/materials", json={"code": "TEST-MAT-1", "name": "dup", "category": "HPL"}).status_code == 409
    vid = admin.get(f"/api/rs/materials/{mid}").json()["versions"][0]["id"]
    assert admin.post(f"/api/rs/material-versions/{vid}/approve").status_code == 400  # no photo yet
    up = designer.post(f"/api/rs/material-versions/{vid}/images/photo", files={"file": ("TEST_p.jpg", make_jpeg(800, 800, (160, 120, 90)), "image/jpeg")})
    assert up.status_code == 200 and up.json()["photo_img"]["url"]
    assert designer.patch(f"/api/rs/material-versions/{vid}", json={"finish": "matte", "base_color": "warm oak"}).json()["finish"] == "matte"
    assert designer.post(f"/api/rs/material-versions/{vid}/corrections", json={"text": "TEST less red"}).status_code == 200
    assert designer.post(f"/api/rs/material-versions/{vid}/approve").status_code == 403
    ap = admin.post(f"/api/rs/material-versions/{vid}/approve")
    assert ap.status_code == 200 and ap.json()["status"] == "approved"
    assert designer.post(f"/api/rs/material-versions/{vid}/lock").status_code == 403
    assert designer.patch(f"/api/rs/materials/{mid}", json={"name": "TEST hack"}).status_code == 403
    lk = admin.post(f"/api/rs/material-versions/{vid}/lock")
    assert lk.status_code == 200 and lk.json()["status"] == "locked"
    assert designer.patch(f"/api/rs/material-versions/{vid}", json={"finish": "gloss"}).status_code == 423
    assert admin.patch(f"/api/rs/material-versions/{vid}", json={"finish": "gloss"}).status_code == 423
    assert designer.post(f"/api/rs/material-versions/{vid}/images/photo", files={"file": ("p.jpg", make_jpeg(100, 100), "image/jpeg")}).status_code == 423
    assert designer.post(f"/api/rs/material-versions/{vid}/corrections", json={"text": "x"}).status_code == 423
    assert designer.post(f"/api/rs/materials/{mid}/versions").status_code == 403
    nv = admin.post(f"/api/rs/materials/{mid}/versions")
    assert nv.status_code == 200 and nv.json()["version_no"] == 2 and nv.json()["status"] == "draft" and nv.json()["finish"] == "matte"
    assert admin.post(f"/api/rs/materials/{mid}/versions").status_code == 400
    got = admin.get(f"/api/rs/materials/{mid}").json()
    assert got["status"] == "locked" and [v["status"] for v in got["versions"]] == ["locked", "draft"]
    assert got["versions"][0]["finish"] == "matte" and got["versions"][0]["corrections"][0]["text"] == "TEST less red"


# ---------- cleanup ----------
def test_zz_cleanup(admin, designer):
    from pymongo import MongoClient
    if S.get("tmat"):
        env = dotenv_values(Path(__file__).resolve().parents[1] / ".env")
        d = MongoClient(env["MONGO_URL"])[env["DB_NAME"]]
        d.rs_material_versions.delete_many({"material_id": S["tmat"]})
        d.rs_materials.delete_one({"id": S["tmat"], "code": "TEST-MAT-1"})
    if os.environ.get("RS_KEEP"):
        print("keeping project", S.get("pid"), S.get("A"), S.get("B"))
        return
    if S.get("pid"):
        assert designer.delete(f"/api/rs/projects/{S['pid']}").status_code == 403
        assert admin.delete(f"/api/rs/projects/{S['pid']}").status_code == 200
        assert admin.get(f"/api/rs/projects/{S['pid']}").status_code == 404
