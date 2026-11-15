# AI scene title+description (English, manual only): upload no longer auto-describes (filename Title Case title, empty description),
# POST /scenes/{sid}/describe with optional {title} body returns {title, description}, saves nothing (staff only)
import io
import re
import time
from pathlib import Path

import pytest
import requests
from PIL import Image

HERO = Path("/app/frontend/public/hero-interior.jpg")


ID_WORDS = {"dan", "yang", "dengan", "ruang", "untuk", "ini", "pada", "dari", "kayu", "lampu"}
EN_WORDS = {"the", "and", "with", "of", "a", "in", "warm", "soft", "light"}


def is_english(text):
    w = set(re.findall(r"[a-z]+", text.lower()))
    return not (w & ID_WORDS) and len(w & EN_WORDS) >= 2


def is_title_case(t):
    words = t.split()
    small = {"and", "of", "with", "the", "a", "an", "in", "on", "for", "to", "by", "&"}
    return 2 <= len(words) <= 5 and all(x[0].isupper() or x.lower() in small for x in words)


def real_jpeg():
    im = Image.open(HERO).convert("RGB")
    im.thumbnail((1600, 1600))
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=82)
    return buf.getvalue()


def get_scene(c, pid, sid):
    return next(x for x in c.get(f"/api/projects/{pid}/draft").json()["scenes"] if x["id"] == sid)


class TestAiDescribe:
    state = {}

    def test_01_upload_no_autodescribe(self, designer):
        r = designer.post("/api/projects", json={"name": "TEST_AI Describe", "code": "TAI"})
        assert r.status_code == 200, r.text
        pid = r.json()["id"]
        self.state["pid"] = pid
        fid = designer.post(f"/api/projects/{pid}/floors", json={"name": "Lantai 1"}).json()["id"]
        rid = designer.post(f"/api/floors/{fid}/rooms", json={"name": "Ruang Tamu"}).json()["id"]
        r = designer.post(f"/api/rooms/{rid}/scenes", files={"file": ("living_room-final.jpg", real_jpeg(), "image/jpeg")})
        assert r.status_code == 200, r.text
        s = r.json()
        assert s["description"] == ""
        assert s["title"] == "Living Room Final"
        assert not s.get("description_ai")
        self.state["sid"] = s["id"]
        time.sleep(30)
        sc = get_scene(designer, pid, s["id"])
        assert sc["description"] == "", sc["description"]
        assert sc["title"] == "Living Room Final"
        assert "description_ai" not in sc or not sc["description_ai"]

    def test_02_client_forbidden(self, client_user):
        assert client_user.post(f"/api/scenes/{self.state['sid']}/describe").status_code == 403
        assert client_user.post(f"/api/scenes/{self.state['sid']}/describe", json={"title": "X"}).status_code == 403

    def test_03_unauth_and_404(self, designer):
        from conftest import BASE_URL
        assert requests.post(f"{BASE_URL}/api/scenes/{self.state['sid']}/describe").status_code == 401
        assert requests.post(f"{BASE_URL}/api/scenes/{self.state['sid']}/describe", json={"title": "X"}).status_code == 401
        assert designer.post("/api/scenes/doesnotexist/describe").status_code == 404

    def test_04_describe_empty_body_uses_saved_title(self, designer):
        assert designer.patch(f"/api/scenes/{self.state['sid']}", json={"title": "IMG 2034"}).status_code == 200
        r = designer.post(f"/api/scenes/{self.state['sid']}/describe")
        assert r.status_code == 200, r.text
        body = r.json()
        print("EMPTY BODY:", body)
        assert set(body) == {"title", "description"}
        assert 5 <= len(body["description"].split()) <= 60
        assert is_english(body["description"]), body["description"]
        assert is_title_case(body["title"]) and "IMG" not in body["title"] and "2034" not in body["title"], body["title"]
        sc = get_scene(designer, self.state["pid"], self.state["sid"])
        assert sc["description"] == "" and sc["title"] == "IMG 2034"

    def test_05_describe_with_unsaved_title(self, designer):
        r = designer.post(f"/api/scenes/{self.state['sid']}/describe", json={"title": "master_bedroom v2"})
        assert r.status_code == 200, r.text
        body = r.json()
        print("WITH TITLE:", body)
        assert set(body) == {"title", "description"}
        assert is_title_case(body["title"]), body["title"]
        assert "bedroom" in body["title"].lower(), body["title"]
        assert "v2" not in body["title"].lower()
        assert is_english(body["description"]), body["description"]
        sc = get_scene(designer, self.state["pid"], self.state["sid"])
        assert sc["description"] == "" and sc["title"] == "IMG 2034"  # nothing saved

    def test_06_patch_description_persists(self, designer):
        r = designer.patch(f"/api/scenes/{self.state['sid']}", json={"description": "TEST_manual desc", "title": "TEST_Judul"})
        assert r.status_code == 200
        sc = get_scene(designer, self.state["pid"], self.state["sid"])
        assert sc["description"] == "TEST_manual desc" and sc["title"] == "TEST_Judul"

    def test_99_cleanup(self, admin):
        pid = self.state.get("pid")
        if pid:
            assert admin.delete(f"/api/projects/{pid}").status_code == 200
