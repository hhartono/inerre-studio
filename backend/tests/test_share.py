# INERRE iteration_8/9 (rate-limit tests moved to test_share_ratelimit.py): guest share links (secret link + password), staff share settings, public guest endpoints
import uuid

import jwt as pyjwt
import pytest
import requests

from conftest import BASE_URL, USERS, SAMPLE_PID, upload


def pub(method, path, **kw):
    return requests.request(method, f"{BASE_URL}{path}", timeout=60, **kw)


def unlock(tok, pw, ip=None):
    h = {"X-Forwarded-For": ip} if ip else {}
    return pub("POST", f"/api/share/{tok}/unlock", json={"password": pw}, headers=h)


def view(tok, access):
    return pub("GET", f"/api/share/{tok}/view", headers={"X-Share-Access": access} if access is not None else {})


class TestShare:
    state = {}

    # ---- setup: TEST_ project with floor/room/scene ----
    def test_01_setup(self, admin, designer):
        pid = designer.post("/api/projects", json={"name": "TEST_T1 Share"}).json()["id"]
        self.state["pid"] = pid
        fid = designer.post(f"/api/projects/{pid}/floors", json={"name": "Lantai 1"}).json()["id"]
        rid = designer.post(f"/api/floors/{fid}/rooms", json={"name": "Ruang"}).json()["id"]
        upload(designer, f"/api/floors/{fid}/image/plan", 1200, 800, "TEST_plan.jpg")
        sid = upload(designer, f"/api/rooms/{rid}/scenes", name="TEST_s.jpg").json()["id"]
        designer.patch(f"/api/scenes/{sid}", json={"title": "TEST", "camera": {"x": 0.5, "y": 0.5, "angle": 45, "fov": 60}})
        assert admin.patch(f"/api/projects/{pid}", json={"client_emails": [USERS["client"][1]]}).status_code == 200

    # ---- staff GET/PUT share ----
    def test_02_initial_and_enable_without_password(self, designer):
        pid = self.state["pid"]
        r = designer.get(f"/api/projects/{pid}/share")
        assert r.status_code == 200
        d = r.json()
        assert d["enabled"] is False and d["has_password"] is False and d["token"] is None
        r = designer.put(f"/api/projects/{pid}/share", json={"enabled": True})
        assert r.status_code == 400
        r = designer.put(f"/api/projects/{pid}/share", json={"enabled": True, "password": "abc"})
        assert r.status_code == 422  # min 4

    def test_03_enable_with_password(self, designer):
        pid = self.state["pid"]
        r = designer.put(f"/api/projects/{pid}/share", json={"enabled": True, "password": "TEST1234"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["enabled"] is True and d["has_password"] is True and isinstance(d["token"], str) and len(d["token"]) >= 20
        assert "password" not in str(d).replace("has_password", "")
        assert "$2" not in str(d)
        self.state["tok"] = d["token"]
        g = designer.get(f"/api/projects/{pid}/share").json()
        assert g["token"] == d["token"] and g["enabled"] is True

    def test_04_client_forbidden(self, client_user):
        pid = self.state["pid"]
        assert client_user.get(f"/api/projects/{pid}/share").status_code == 403
        assert client_user.put(f"/api/projects/{pid}/share", json={"enabled": False}).status_code == 403
        assert client_user.post(f"/api/projects/{pid}/share/regenerate").status_code == 403
        assert pub("GET", f"/api/projects/{pid}/share").status_code == 401

    def test_05_unpublished_404(self):
        tok = self.state["tok"]
        assert pub("GET", f"/api/share/{tok}").status_code == 404

    def test_06_publish_then_meta(self, designer):
        pid = self.state["pid"]
        assert designer.post(f"/api/projects/{pid}/publish").status_code == 200
        r = pub("GET", f"/api/share/{self.state['tok']}")
        assert r.status_code == 200
        d = r.json()
        assert d["project_name"] == "TEST_T1 Share" and set(d.keys()) == {"project_name", "code"}
        assert pub("GET", "/api/share/doesnotexist123").status_code == 404

    def test_07_no_share_leak(self, designer, client_user):
        pid = self.state["pid"]
        for c in (designer, client_user):
            lst = c.get("/api/projects").json()
            items = lst if isinstance(lst, list) else lst.get("projects", lst.get("items", []))
            mine = [p for p in items if p.get("id") == pid]
            assert mine and "share" not in mine[0]
        assert "share" not in designer.get(f"/api/projects/{pid}/draft").text.replace('"share"', '"share"') or '"share"' not in designer.get(f"/api/projects/{pid}/draft").text
        r = designer.patch(f"/api/projects/{pid}", json={"name": "TEST_T1 Share"})
        assert r.status_code == 200 and "share" not in r.json() and "$2b$" not in r.text
        v = client_user.get(f"/api/projects/{pid}/view").text
        assert "password_hash" not in v and self.state["tok"] not in v

    def test_08_wrong_password(self):
        ip = f"10.9.{uuid.uuid4().int % 250}.1"
        r = unlock(self.state["tok"], "wrongpw", ip)
        assert r.status_code == 401 and r.json()["detail"] == "Password salah"

    def test_09_correct_unlock_and_view(self, client_user):
        r = unlock(self.state["tok"], "TEST1234", "10.8.0.1")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["expires_in"] == 43200 and isinstance(d["access"], str)
        hdr = pyjwt.get_unverified_header(d["access"])
        assert hdr["alg"] == "HS256"
        claims = pyjwt.decode(d["access"], options={"verify_signature": False})
        assert claims["exp"] - claims.get("iat", claims["exp"] - 43200) <= 43200 + 5
        self.state["access"] = d["access"]
        v = view(self.state["tok"], d["access"])
        assert v.status_code == 200, v.text
        gv = v.json()
        cv = client_user.get(f"/api/projects/{self.state['pid']}/view").json()
        assert gv["mode"] == "published" and gv["revision"]["number"] == cv["revision"]["number"]
        assert [s["id"] for s in gv["scenes"]] == [s["id"] for s in cv["scenes"]]
        assert gv["music_url"] == cv["music_url"]
        # signed image URL works without auth
        url = next((s.get(k) for s in gv["scenes"] for k in ("image_url", "url", "src") if s.get(k)), None)
        assert url, gv["scenes"][0].keys()
        ir = pub("GET", url if url.startswith("http") else url)
        assert ir.status_code == 200 and ir.headers["content-type"].startswith("image/")

    def test_10_view_invalid_access(self):
        tok = self.state["tok"]
        assert view(tok, None).status_code == 401
        assert view(tok, "garbage").status_code == 401
        forged = pyjwt.encode({"typ": "share", "tok": tok, "v": 1, "exp": 9999999999}, "wrongsecret", algorithm="HS256")
        assert view(tok, forged).status_code == 401
        # access for token A not usable on other token
        assert view("othertoken123", self.state["access"]).status_code == 404

    def test_13_change_password_invalidates(self, designer):
        pid, tok = self.state["pid"], self.state["tok"]
        r = designer.put(f"/api/projects/{pid}/share", json={"enabled": True, "password": "NEWPASS99"})
        assert r.status_code == 200 and r.json()["token"] == tok
        assert view(tok, self.state["access"]).status_code == 401
        assert unlock(tok, "TEST1234", "10.5.0.1").status_code == 401
        r = unlock(tok, "NEWPASS99", "10.5.0.2")
        assert r.status_code == 200
        self.state["access"] = r.json()["access"]
        assert view(tok, self.state["access"]).status_code == 200

    def test_14_disable_then_reenable(self, designer):
        pid, tok = self.state["pid"], self.state["tok"]
        r = designer.put(f"/api/projects/{pid}/share", json={"enabled": False})
        assert r.status_code == 200 and r.json()["enabled"] is False and r.json()["has_password"] is True
        assert pub("GET", f"/api/share/{tok}").status_code == 404
        assert view(tok, self.state["access"]).status_code == 404
        assert unlock(tok, "NEWPASS99", "10.4.0.1").status_code == 404
        r = designer.put(f"/api/projects/{pid}/share", json={"enabled": True})
        assert r.status_code == 200 and r.json()["enabled"] is True and r.json()["token"] == tok
        # iteration_9: disabling bumps version -> old guest access revoked even after re-enable
        assert view(tok, self.state["access"]).status_code == 401
        r = unlock(tok, "NEWPASS99")
        assert r.status_code == 200
        self.state["access"] = r.json()["access"]
        assert view(tok, self.state["access"]).status_code == 200
        # toggling enabled=True while already enabled must NOT bump version
        assert designer.put(f"/api/projects/{pid}/share", json={"enabled": True}).status_code == 200
        assert view(tok, self.state["access"]).status_code == 200

    def test_15_regenerate(self, designer):
        pid, old = self.state["pid"], self.state["tok"]
        r = designer.post(f"/api/projects/{pid}/share/regenerate")
        assert r.status_code == 200
        new = r.json()["token"]
        assert new != old and r.json()["enabled"] is True
        assert pub("GET", f"/api/share/{old}").status_code == 404
        assert pub("GET", f"/api/share/{new}").status_code == 200
        assert view(new, self.state["access"]).status_code == 401
        self.state["tok"] = new
        assert unlock(new, "NEWPASS99", "10.3.0.1").status_code == 200

    def test_16_regenerate_no_share_404(self, designer):
        assert designer.post(f"/api/projects/{SAMPLE_PID}/share/regenerate").status_code in (404,)  # sample has no share

    def test_17_db_hash(self):
        from pathlib import Path
        from dotenv import dotenv_values
        from pymongo import MongoClient
        env = dotenv_values(Path(__file__).resolve().parents[1] / ".env")
        p = MongoClient(env["MONGO_URL"])[env["DB_NAME"]].projects.find_one({"id": self.state["pid"]})
        h = p["share"]["password_hash"]
        assert h.startswith("$2") and "NEWPASS99" not in h

    def test_99_cleanup(self, admin):
        pid = self.state.get("pid")
        if pid:
            assert admin.delete(f"/api/projects/{pid}").status_code == 200
            assert pub("GET", f"/api/share/{self.state.get('tok')}").status_code == 404
