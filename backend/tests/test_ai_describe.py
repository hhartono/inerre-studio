# AI scene title+description (English): auto-describe on upload (title Title Case + description), POST /scenes/{sid}/describe {title, description} (staff only), persistence via PATCH
import io
import re
import time
from pathlib import Path

import pytest
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


class TestAiDescribe:
    state = {}

    def test_01_setup_and_upload_autodescribe(self, designer):
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
        assert s["title"] == "living room final"
        self.state["sid"] = s["id"]
        desc = None
        for _ in range(20):
            time.sleep(3)
            d = designer.get(f"/api/projects/{pid}/draft").json()
            sc = next(x for x in d["scenes"] if x["id"] == s["id"])
            if sc.get("description"):
                desc = sc
                break
        assert desc, "auto description not filled within 60s"
        words = len(desc["description"].split())
        print("AUTO:", desc["title"], "|", desc["description"], words)
        assert desc.get("description_ai") is True
        assert 5 <= words <= 60
        assert "\n\n" not in desc["description"]
        assert is_english(desc["description"]), desc["description"]
        assert desc["title"] != "living room final"
        assert is_title_case(desc["title"]), desc["title"]
        self.state["auto"] = desc["description"]

    def test_02_client_forbidden(self, client_user):
        r = client_user.post(f"/api/scenes/{self.state['sid']}/describe")
        assert r.status_code == 403

    def test_03_unauth_and_404(self, designer):
        import requests
        from conftest import BASE_URL
        assert requests.post(f"{BASE_URL}/api/scenes/{self.state['sid']}/describe").status_code == 401
        assert designer.post("/api/scenes/doesnotexist/describe").status_code == 404

    def test_04_describe_not_saved(self, designer):
        # filename-like title -> AI must suggest a real title
        assert designer.patch(f"/api/scenes/{self.state['sid']}", json={"title": "IMG 2034"}).status_code == 200
        r = designer.post(f"/api/scenes/{self.state['sid']}/describe")
        assert r.status_code == 200, r.text
        body = r.json()
        print("MANUAL:", body)
        assert set(body) == {"title", "description"}
        text = body["description"]
        assert isinstance(text, str) and 5 <= len(text.split()) <= 60
        assert is_english(text), text
        assert is_title_case(body["title"]) and "IMG" not in body["title"] and "2034" not in body["title"], body["title"]
        d = designer.get(f"/api/projects/{self.state['pid']}/draft").json()
        sc = next(x for x in d["scenes"] if x["id"] == self.state["sid"])
        assert sc["description"] == self.state["auto"]  # not persisted
        assert sc["title"] == "IMG 2034"

    def test_05_patch_description_persists(self, designer):
        r = designer.patch(f"/api/scenes/{self.state['sid']}", json={"description": "TEST_manual desc"})
        assert r.status_code == 200
        d = designer.get(f"/api/projects/{self.state['pid']}/draft").json()
        sc = next(x for x in d["scenes"] if x["id"] == self.state["sid"])
        assert sc["description"] == "TEST_manual desc"
        print("description_ai after manual edit:", sc.get("description_ai"))

    def test_99_cleanup(self, admin):
        pid = self.state.get("pid")
        if pid:
            assert admin.delete(f"/api/projects/{pid}").status_code == 200
