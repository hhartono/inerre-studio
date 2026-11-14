# INERRE Presentation System backend regression: auth, roles, CRUD, images, validation, publish
import time

import pytest
import requests

from conftest import BASE_URL, SAMPLE_PID, USERS, upload


# ---- Auth ----
class TestAuth:
    @pytest.mark.parametrize("path", ["/api/me", "/api/projects", "/api/users", "/api/invites",
                                      f"/api/projects/{SAMPLE_PID}/draft", f"/api/projects/{SAMPLE_PID}/view"])
    def test_401_without_token(self, path):
        assert requests.get(f"{BASE_URL}{path}", timeout=30).status_code == 401

    def test_invalid_token_401(self):
        r = requests.get(f"{BASE_URL}/api/me", headers={"Authorization": "Bearer abc.def.ghi"}, timeout=30)
        assert r.status_code == 401

    def test_me_roles(self, admin, designer, client_user):
        for c, role in ((admin, "admin"), (designer, "designer"), (client_user, "client")):
            r = c.get("/api/me")
            assert r.status_code == 200, r.text
            d = r.json()
            assert d["role"] == role
            assert d["email"] == USERS[role][1]


# ---- Role isolation ----
class TestRoleIsolation:
    def test_client_projects_only_assigned_published(self, client_user):
        r = client_user.get("/api/projects")
        assert r.status_code == 200
        items = r.json()
        assert any(p["id"] == SAMPLE_PID for p in items)
        for p in items:
            assert USERS["client"][1] in p["client_emails"]
            assert p["published_revision"] > 0

    def test_client_blocked(self, client_user):
        assert client_user.get(f"/api/projects/{SAMPLE_PID}/draft").status_code in (403, 404)
        assert client_user.get(f"/api/projects/{SAMPLE_PID}/view?mode=draft").status_code == 404
        assert client_user.get(f"/api/projects/{SAMPLE_PID}/validate").status_code in (403, 404)
        assert client_user.post("/api/projects", json={"name": "TEST_x"}).status_code == 403
        assert client_user.get("/api/users").status_code == 403
        assert client_user.post(f"/api/projects/{SAMPLE_PID}/publish").status_code in (403, 404)

    def test_client_view_published(self, client_user):
        r = client_user.get(f"/api/projects/{SAMPLE_PID}/view")
        assert r.status_code == 200
        d = r.json()
        assert d["mode"] == "published" and d["revision"]["number"] >= 1
        assert len(d["scenes"]) == 6
        assert len(d["tour_order"]) == 6
        assert d["floors"][0]["plan_url"] and d["floors"][0]["layout3d_url"]

    def test_designer_blocked(self, designer):
        assert designer.get("/api/users").status_code == 403
        assert designer.get("/api/invites").status_code == 403
        assert designer.post("/api/invites", json={"email": "TEST_x@example.com", "role": "client"}).status_code == 403
        assert designer.delete("/api/projects/nonexistent_TEST").status_code == 403
        assert designer.patch(f"/api/projects/{SAMPLE_PID}", json={"client_emails": []}).status_code == 403
        # sample must remain assigned
        assert designer.get(f"/api/projects/{SAMPLE_PID}/draft").json()["project"]["client_emails"]


# ---- Admin ----
class TestAdmin:
    def test_users_list(self, admin):
        r = admin.get("/api/users")
        assert r.status_code == 200
        d = r.json()
        assert "admin" in d["roles"]
        emails = {u.get("email") for u in d["users"]}
        for _, e in USERS.values():
            assert e in emails

    def test_role_bad_value_and_unknown_user(self, admin):
        assert admin.patch(f"/api/users/{USERS['designer'][0]}/role", json={"role": "superuser"}).status_code == 403
        assert admin.patch("/api/users/user_TEST_nope/role", json={"role": "client"}).status_code == 404

    def test_last_admin_demotion(self, admin):
        users = admin.get("/api/users").json()["users"]
        admins = [u for u in users if u["role"] == "admin"]
        if len(admins) > 1:
            pytest.skip(f"{len(admins)} admins exist; cannot safely test last-admin guard")
        r = admin.patch(f"/api/users/{USERS['admin'][0]}/role", json={"role": "designer"})
        assert r.status_code == 409
        assert admin.get("/api/me").json()["role"] == "admin"

    def test_role_noop_same_role(self, admin):
        r = admin.patch(f"/api/users/{USERS['designer'][0]}/role", json={"role": "designer"})
        assert r.status_code == 200 and r.json()["role"] == "designer"

    def test_invites_crud(self, admin):
        email = "TEST_invite_t1@example.com"
        r = admin.post("/api/invites", json={"email": email, "role": "client"})
        assert r.status_code == 200 and r.json()["email"] == email.lower()
        lst = admin.get("/api/invites").json()
        assert any(i["email"] == email.lower() and i["role"] == "client" for i in lst)
        assert admin.post("/api/invites", json={"email": "bad", "role": "client"}).status_code == 400
        assert admin.post("/api/invites", json={"email": "a@b.co", "role": "pending"}).status_code == 400
        assert admin.delete(f"/api/invites/{email}").status_code == 200
        assert not any(i["email"] == email.lower() for i in admin.get("/api/invites").json())


# ---- Full staff flow on TEST_ project ----
class TestStaffFlow:
    state = {}

    def test_01_create_structure(self, designer):
        r = designer.post("/api/projects", json={"name": "TEST_T1 Project", "code": "T1"})
        assert r.status_code == 200
        pid = r.json()["id"]
        self.state["pid"] = pid
        assert r.json()["published_revision"] == 0
        f = designer.post(f"/api/projects/{pid}/floors", json={"name": "Lantai 1"})
        assert f.status_code == 200
        fid = f.json()["id"]
        self.state["fid"] = fid
        rm = designer.post(f"/api/floors/{fid}/rooms", json={"name": "Ruang Tamu"})
        assert rm.status_code == 200
        self.state["rid"] = rm.json()["id"]
        assert designer.post(f"/api/projects/{pid}/floors", json={"name": ""}).status_code == 422

    def test_02_scenes_upload(self, designer):
        rid = self.state["rid"]
        ids = []
        for i in range(3):
            r = upload(designer, f"/api/rooms/{rid}/scenes", name=f"TEST_scene_{i}.jpg")
            assert r.status_code == 200, r.text
            s = r.json()
            assert s["image_url"].startswith(f"/api/img/{s['image_file_id']}/web?e=")
            assert "/thumb?e=" in s["thumb_url"]
            assert s["title"] == f"TEST scene {i}"
            assert s["area"] == "Ruang Tamu"
            ids.append(s["id"])
        self.state["sids"] = ids
        bad = designer.post(f"/api/rooms/{rid}/scenes", files={"file": ("x.txt", b"hello", "text/plain")})
        assert bad.status_code == 400

    def test_03_floor_images(self, designer):
        fid = self.state["fid"]
        r = upload(designer, f"/api/floors/{fid}/image/plan", 1200, 800, "TEST_plan.jpg")
        assert r.status_code == 200 and r.json()["plan_file_id"] and abs(r.json()["plan_aspect"] - 1.5) < 0.01
        r = upload(designer, f"/api/floors/{fid}/image/layout3d", 1200, 800, "TEST_l3d.jpg")
        assert r.status_code == 200 and r.json()["layout3d_file_id"]
        assert upload(designer, f"/api/floors/{fid}/image/bogus").status_code == 404
        r = designer.patch(f"/api/floors/{fid}", json={"layout3d_caption": "TEST caption"})
        assert r.json()["layout3d_caption"] == "TEST caption"

    def test_04_signed_images(self, designer):
        pid = self.state["pid"]
        s = designer.get(f"/api/projects/{pid}/draft").json()["scenes"][0]
        r = requests.get(BASE_URL + s["image_url"], timeout=60)
        assert r.status_code == 200 and r.headers["content-type"] == "image/webp"
        assert requests.get(BASE_URL + s["thumb_url"], timeout=60).status_code == 200
        tampered = s["image_url"][:-3] + ("000" if not s["image_url"].endswith("000") else "111")
        assert requests.get(BASE_URL + tampered, timeout=30).status_code == 403
        orig = s["image_url"].replace("/web?", "/original?")
        assert requests.get(BASE_URL + orig, timeout=30).status_code == 403
        # signature for web reused on thumb must fail
        assert requests.get(BASE_URL + s["image_url"].replace("/web?", "/thumb?"), timeout=30).status_code == 403

    def test_05_patch_scene(self, designer):
        a, b, c = self.state["sids"]
        body = {"title": "TEST Living", "description": "desc", "area": "Living",
                "camera": {"x": 0.3, "y": 0.4, "angle": 90, "fov": 70},
                "hotspots": [{"id": "h1", "x": 0.8, "y": 0.5, "target_scene_id": b, "label": "To B"}]}
        r = designer.patch(f"/api/scenes/{a}", json=body)
        assert r.status_code == 200
        d = r.json()
        assert d["title"] == "TEST Living" and d["camera"]["fov"] == 70 and d["hotspots"][0]["target_scene_id"] == b
        bad = designer.patch(f"/api/scenes/{a}", json={"hotspots": [{"id": "h", "x": 1.5, "y": 0.5}]})
        assert bad.status_code == 422
        bad = designer.patch(f"/api/scenes/{a}", json={"camera": {"x": -0.1, "y": 0.5}})
        assert bad.status_code == 422
        # persisted
        sc = {s["id"]: s for s in designer.get(f"/api/projects/{self.state['pid']}/draft").json()["scenes"]}
        assert sc[a]["description"] == "desc"

    def test_06_backlink(self, designer):
        a, b, _ = self.state["sids"]
        r = designer.post(f"/api/scenes/{a}/backlink", json={"hotspot_id": "h1"})
        assert r.status_code == 200 and r.json()["created"] is True
        hb = r.json()["hotspot"]
        assert hb["target_scene_id"] == a and abs(hb["x"] - 0.2) < 1e-6
        r2 = designer.post(f"/api/scenes/{a}/backlink", json={"hotspot_id": "h1"})
        assert r2.status_code == 200 and r2.json()["created"] is False
        sc = {s["id"]: s for s in designer.get(f"/api/projects/{self.state['pid']}/draft").json()["scenes"]}
        assert len([h for h in sc[b]["hotspots"] if h["target_scene_id"] == a]) == 1
        assert designer.post(f"/api/scenes/{a}/backlink", json={"hotspot_id": "nope"}).status_code == 400

    def test_07_tour_order(self, designer):
        pid = self.state["pid"]
        rev = list(reversed(self.state["sids"]))
        assert designer.put(f"/api/projects/{pid}/tour", json={"order": rev}).status_code == 200
        assert designer.get(f"/api/projects/{pid}/draft").json()["tour_order"] == rev
        assert designer.get(f"/api/projects/{pid}/view?mode=draft").json()["tour_order"] == rev

    def test_08_aspect_change_blocks_publish(self, designer):
        pid = self.state["pid"]
        a = self.state["sids"][0]
        r = upload(designer, f"/api/scenes/{a}/image", 1000, 1000, "TEST_square.jpg")
        assert r.status_code == 200 and r.json()["hotspots_need_check"] is True
        v = designer.get(f"/api/projects/{pid}/validate").json()
        assert not v["ok"] and any(e["code"] == "needs_check" for e in v["errors"])
        assert designer.post(f"/api/projects/{pid}/publish").status_code == 400
        r = designer.post(f"/api/scenes/{a}/confirm-hotspots")
        assert r.status_code == 200 and r.json()["hotspots_need_check"] is False

    def test_09_publish_and_snapshot(self, admin, designer, client_user):
        pid = self.state["pid"]
        v = designer.get(f"/api/projects/{pid}/validate").json()
        assert v["ok"], v
        r = designer.post(f"/api/projects/{pid}/publish")
        assert r.status_code == 200 and r.json()["number"] == 1
        # not assigned -> client cannot see
        assert client_user.get(f"/api/projects/{pid}/view").status_code == 404
        assert admin.patch(f"/api/projects/{pid}", json={"client_emails": [USERS["client"][1].upper(), "junk"]}).json()["client_emails"] == [USERS["client"][1]]
        v1 = client_user.get(f"/api/projects/{pid}/view")
        assert v1.status_code == 200 and v1.json()["revision"]["number"] == 1
        assert any(p["id"] == pid for p in client_user.get("/api/projects").json())
        # draft edit invisible until republish
        a = self.state["sids"][0]
        designer.patch(f"/api/scenes/{a}", json={"title": "TEST Changed"})
        titles = {s["id"]: s["title"] for s in client_user.get(f"/api/projects/{pid}/view").json()["scenes"]}
        assert titles[a] == "TEST Living"
        r = designer.post(f"/api/projects/{pid}/publish")
        assert r.json()["number"] == 2
        titles = {s["id"]: s["title"] for s in client_user.get(f"/api/projects/{pid}/view").json()["scenes"]}
        assert titles[a] == "TEST Changed"

    def test_10_broken_link_blocks_publish(self, designer):
        pid = self.state["pid"]
        a, b, c = self.state["sids"]
        designer.patch(f"/api/scenes/{c}", json={"hotspots": [{"id": "hc", "x": 0.5, "y": 0.5, "target_scene_id": b}]})
        assert designer.delete(f"/api/scenes/{b}").status_code == 200
        v = designer.get(f"/api/projects/{pid}/validate").json()
        assert any(e["code"] == "broken_link" for e in v["errors"])
        assert designer.post(f"/api/projects/{pid}/publish").status_code == 400
        assert b not in designer.get(f"/api/projects/{pid}/draft").json()["tour_order"]

    def test_11_room_rename_delete(self, designer):
        rid = self.state["rid"]
        assert designer.patch(f"/api/rooms/{rid}", json={"name": "TEST Renamed"}).json()["name"] == "TEST Renamed"

    def test_99_cleanup(self, admin, client_user):
        pid = self.state.get("pid")
        if pid:
            assert admin.delete(f"/api/projects/{pid}").status_code == 200
            assert admin.get(f"/api/projects/{pid}/draft").status_code == 404
            assert client_user.get(f"/api/projects/{pid}/view").status_code == 404
