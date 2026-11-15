# PATCH /scenes/{sid} vs AI default description: title-only patch keeps AI text, same text keeps flag, edited text clears description_ai
import time

from test_ai_describe import real_jpeg


class TestAiPatch:
    state = {}

    def test_01_upload_patch_title_while_pending(self, designer):
        pid = designer.post("/api/projects", json={"name": "TEST_AI Patch", "code": "TAP"}).json()["id"]
        self.state["pid"] = pid
        fid = designer.post(f"/api/projects/{pid}/floors", json={"name": "Lantai 1"}).json()["id"]
        rid = designer.post(f"/api/floors/{fid}/rooms", json={"name": "Ruang Tamu"}).json()["id"]
        r = designer.post(f"/api/rooms/{rid}/scenes", files={"file": ("TEST_lr.jpg", real_jpeg(), "image/jpeg")})
        assert r.status_code == 200, r.text
        sid = r.json()["id"]
        self.state["sid"] = sid
        # title-only patch while AI pending (what new ScenePanel sends)
        r = designer.patch(f"/api/scenes/{sid}", json={"title": "TEST_Judul"})
        assert r.status_code == 200
        assert r.json()["title"] == "TEST_Judul"
        sc = None
        for _ in range(20):
            time.sleep(3)
            sc = next(x for x in designer.get(f"/api/projects/{pid}/draft").json()["scenes"] if x["id"] == sid)
            if sc.get("description"):
                break
        assert sc["description"], "AI description not filled"
        assert sc["description_ai"] is True
        assert sc["title"] == "TEST_Judul"
        self.state["auto"] = sc["description"]

    def test_02_patch_same_description_keeps_flag(self, designer):
        r = designer.patch(f"/api/scenes/{self.state['sid']}", json={"description": self.state["auto"], "area": "TEST 20 m2"})
        assert r.status_code == 200
        assert r.json()["description_ai"] is True
        assert r.json()["area"] == "TEST 20 m2"

    def test_03_patch_edited_description_clears_flag(self, designer):
        r = designer.patch(f"/api/scenes/{self.state['sid']}", json={"description": "TEST_ditulis desainer"})
        assert r.status_code == 200
        assert r.json()["description_ai"] is False
        sc = next(x for x in designer.get(f"/api/projects/{self.state['pid']}/draft").json()["scenes"] if x["id"] == self.state["sid"])
        assert sc["description"] == "TEST_ditulis desainer"
        assert sc["description_ai"] is False

    def test_04_title_patch_does_not_reset_flag(self, designer):
        r = designer.patch(f"/api/scenes/{self.state['sid']}", json={"title": "TEST_Judul2"})
        assert r.status_code == 200
        assert r.json()["description_ai"] is False
        assert r.json()["description"] == "TEST_ditulis desainer"

    def test_99_cleanup(self, admin):
        if self.state.get("pid"):
            assert admin.delete(f"/api/projects/{self.state['pid']}").status_code == 200
