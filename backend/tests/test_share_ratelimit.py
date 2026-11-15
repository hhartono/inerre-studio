# INERRE iteration_9: share unlock rate limit — spoofed X-Forwarded-For no longer bypasses; per-token cap 20/15min
# NOTE: rate-limit state is in-memory; restart backend for a clean slate. Each class uses its own TEST_ project/token.
import requests

from conftest import BASE_URL, upload

INTERNAL = "http://localhost:8001"  # only used to simulate distinct right-most XFF hops for the per-token cap


def _mk_project(designer, name):
    pid = designer.post("/api/projects", json={"name": name}).json()["id"]
    fid = designer.post(f"/api/projects/{pid}/floors", json={"name": "L1"}).json()["id"]
    rid = designer.post(f"/api/floors/{fid}/rooms", json={"name": "R"}).json()["id"]
    upload(designer, f"/api/floors/{fid}/image/plan", 1200, 800, "TEST_plan.jpg")
    sid = upload(designer, f"/api/rooms/{rid}/scenes", name="TEST_s.jpg").json()["id"]
    designer.patch(f"/api/scenes/{sid}", json={"title": "T", "camera": {"x": .5, "y": .5, "angle": 0, "fov": 60}})
    assert designer.post(f"/api/projects/{pid}/publish").status_code == 200
    r = designer.put(f"/api/projects/{pid}/share", json={"enabled": True, "password": "TEST1234"})
    assert r.status_code == 200
    return pid, r.json()["token"]


def unlock(tok, pw, xff=None, base=BASE_URL):
    h = {"X-Forwarded-For": xff} if xff else {}
    return requests.post(f"{base}/api/share/{tok}/unlock", json={"password": pw}, headers=h, timeout=60)


class TestXffSpoofBlocked:
    state = {}

    def test_01_setup(self, designer):
        self.state["pid"], self.state["tok"] = _mk_project(designer, "TEST_T1 RL XFF")

    def test_02_rotating_spoof_xff_locked_after_5(self):
        tok = self.state["tok"]
        codes = [unlock(tok, "bad", f"1.2.3.{i}").status_code for i in range(5)]
        assert codes == [401] * 5, codes
        more = [unlock(tok, "bad", f"9.8.7.{i}").status_code for i in range(3)]
        assert more == [429] * 3, more
        assert unlock(tok, "bad", "1.1.1.1, 2.2.2.2").status_code == 429

    def test_03_correct_password_also_429(self):
        tok = self.state["tok"]
        assert unlock(tok, "TEST1234", "5.5.5.5").status_code == 429
        r = unlock(tok, "TEST1234")
        assert r.status_code == 429 and "Terlalu banyak" in r.json()["detail"]

    def test_99_cleanup(self, admin):
        assert admin.delete(f"/api/projects/{self.state['pid']}").status_code == 200


class TestPerTokenCap:
    """Simulates 5 different trusted right-most hops via the internal port (XFF last entry = 'client ip')."""
    state = {}

    def test_01_setup(self, designer):
        self.state["pid"], self.state["tok"] = _mk_project(designer, "TEST_T1 RL Cap")

    def test_02_20_failures_across_ips_then_cap(self):
        tok = self.state["tok"]
        codes = [unlock(tok, "bad", f"10.20.{ip}.1", INTERNAL).status_code for ip in range(4) for _ in range(5)]
        assert codes == [401] * 20, codes
        # a brand-new ip is now blocked by the per-token cap (wrong and correct password)
        assert unlock(tok, "bad", "10.99.0.1", INTERNAL).status_code == 429
        assert unlock(tok, "TEST1234", "10.99.0.2", INTERNAL).status_code == 429
        assert unlock(tok, "TEST1234").status_code == 429  # public path too

    def test_99_cleanup(self, admin):
        assert admin.delete(f"/api/projects/{self.state['pid']}").status_code == 200
