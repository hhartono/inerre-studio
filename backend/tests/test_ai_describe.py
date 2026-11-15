# AI scene descriptions: auto-describe on upload (background), POST /scenes/{sid}/describe (staff only), persistence via PATCH
import io
import time
from pathlib import Path

import pytest
from PIL import Image

HERO = Path("/app/frontend/public/hero-interior.jpg")


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
        r = designer.post(f"/api/rooms/{rid}/scenes", files={"file": ("TEST_living-room.jpg", real_jpeg(), "image/jpeg")})
        assert r.status_code == 200, r.text
        s = r.json()
        assert s["description"] == ""
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
        print("AUTO:", desc["description"], words)
        assert desc.get("description_ai") is True
        assert 5 <= words <= 60
        assert "\n\n" not in desc["description"]
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
        r = designer.post(f"/api/scenes/{self.state['sid']}/describe")
        assert r.status_code == 200, r.text
        text = r.json()["description"]
        print("MANUAL:", text)
        assert isinstance(text, str) and len(text.split()) >= 5
        d = designer.get(f"/api/projects/{self.state['pid']}/draft").json()
        sc = next(x for x in d["scenes"] if x["id"] == self.state["sid"])
        assert sc["description"] == self.state["auto"]  # not persisted

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
