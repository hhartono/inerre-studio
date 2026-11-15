# PATCH /scenes/{sid} after auto-describe removal: title-only patch keeps description, edited description sets description_ai False
from test_ai_describe import real_jpeg


class TestAiPatch:
    state = {}

    def test_01_upload_and_patch_title(self, designer):
        pid = designer.post("/api/projects", json={"name": "TEST_AI Patch", "code": "TAP"}).json()["id"]
        self.state["pid"] = pid
        fid = designer.post(f"/api/projects/{pid}/floors", json={"name": "Lantai 1"}).json()["id"]
        rid = designer.post(f"/api/floors/{fid}/rooms", json={"name": "Ruang Tamu"}).json()["id"]
        r = designer.post(f"/api/rooms/{rid}/scenes", files={"file": ("TEST_lr.jpg", real_jpeg(), "image/jpeg")})
        assert r.status_code == 200, r.text
        assert r.json()["title"] == "Test Lr"
        sid = r.json()["id"]
        self.state["sid"] = sid
        r = designer.patch(f"/api/scenes/{sid}", json={"title": "TEST_Judul"})
        assert r.status_code == 200 and r.json()["title"] == "TEST_Judul" and r.json()["description"] == ""

    def test_02_patch_description_and_area(self, designer):
        r = designer.patch(f"/api/scenes/{self.state['sid']}", json={"description": "TEST_ditulis desainer", "area": "TEST 20 m2"})
        assert r.status_code == 200
        assert r.json()["description_ai"] is False
        assert r.json()["area"] == "TEST 20 m2"
        sc = next(x for x in designer.get(f"/api/projects/{self.state['pid']}/draft").json()["scenes"] if x["id"] == self.state["sid"])
        assert sc["description"] == "TEST_ditulis desainer"

    def test_03_title_patch_keeps_description(self, designer):
        r = designer.patch(f"/api/scenes/{self.state['sid']}", json={"title": "TEST_Judul2"})
        assert r.status_code == 200
        assert r.json()["description"] == "TEST_ditulis desainer"

    def test_99_cleanup(self, admin):
        if self.state.get("pid"):
            assert admin.delete(f"/api/projects/{self.state['pid']}").status_code == 200
