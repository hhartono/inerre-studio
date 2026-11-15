# INERRE iteration_10: share unlock rate limit — client IP = xff[-TRUSTED_PROXY_HOPS] (3); spoofed left-most XFF does not bypass;
# a different real client is not locked out by guest A; per-token cap 20/15min across IPs; bcrypt in thread keeps pw semantics.
# NOTE: rate-limit state is in-memory; restart backend for a clean slate. Each class uses its own TEST_ project/token.
import requests

from conftest import BASE_URL, upload

INTERNAL = "http://localhost:8001"  # simulates distinct trusted CF-worker hops (3rd-from-right XFF entry)
CF, LB = "172.71.1.1", "34.8.246.104"


def chain(client_ip, spoof=None):
    """XFF as the real ingress builds it: <client-supplied...>, <real client (CF worker)>, <cloudflare>, <google lb>"""
    return ", ".join(([spoof] if spoof else []) + [client_ip, CF, LB])


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


def my_egress_ip():
    return requests.get("https://api.ipify.org", timeout=20).text.strip()


class TestPublicSpoofBlocked:
    """Public URL: guest A (this pod's real IP) rotates spoofed XFF -> still 429 after 5."""
    state = {}

    def test_01_setup(self, designer):
        self.state["pid"], self.state["tok"] = _mk_project(designer, "TEST_T1 RL XFF")

    def test_02_correct_password_ok_then_wrong(self):
        tok = self.state["tok"]
        r = unlock(tok, "TEST1234")
        assert r.status_code == 200 and r.json()["expires_in"] == 43200
        r = unlock(tok, "bad")
        assert r.status_code == 401 and r.json()["detail"] == "Password salah"

    def test_03_rotating_spoof_locked_after_5(self):
        tok = self.state["tok"]
        codes = [unlock(tok, "bad", f"1.2.3.{i}").status_code for i in range(4)]  # 1 already used in test_02
        assert codes == [401] * 4, codes
        more = [unlock(tok, "bad", x).status_code for x in ("9.8.7.1", "1.1.1.1, 2.2.2.2", "11.0.0.1, 11.0.0.2, 11.0.0.3", None)]
        assert more == [429] * 4, more
        r = unlock(tok, "TEST1234", "5.5.5.5")
        assert r.status_code == 429 and "Terlalu banyak" in r.json()["detail"]

    def test_04_other_real_client_not_locked(self):
        """Different trusted hop (internal port) is NOT locked out by A; same hop as A is locked."""
        tok = self.state["tok"]
        assert unlock(tok, "TEST1234", chain("203.0.113.7"), INTERNAL).status_code == 200
        assert unlock(tok, "bad", chain("203.0.113.8", spoof="1.2.3.4"), INTERNAL).status_code == 401
        me = my_egress_ip()
        # key derived from the public request == this pod's egress at xff[-3]
        assert unlock(tok, "TEST1234", chain(me), INTERNAL).status_code == 429
        assert unlock(tok, "TEST1234", chain(me, spoof="8.8.8.8"), INTERNAL).status_code == 429

    def test_99_cleanup(self, admin):
        assert admin.delete(f"/api/projects/{self.state['pid']}").status_code == 200


class TestPublicMalformedXffBypass:
    """iteration_10 finding: a non-IP token in client XFF makes the Google LB append an extra 35.191.x.x hop,
    so xff[-3] becomes the (rotating) Cloudflare egress IP -> per-IP limit of 5 is bypassed from ONE machine."""
    state = {}

    def test_01_setup(self, designer):
        self.state["pid"], self.state["tok"] = _mk_project(designer, "TEST_T1 RL Malformed")

    def test_02_malformed_xff_still_limited_to_5(self):
        tok = self.state["tok"]
        codes = [unlock(tok, "bad", "x").status_code for _ in range(8)]
        assert codes[:5] == [401] * 5 and codes[5:] == [429] * 3, codes

    def test_99_cleanup(self, admin):
        assert admin.delete(f"/api/projects/{self.state['pid']}").status_code == 200


class TestInternalHopIsolation:
    state = {}

    def test_01_setup(self, designer):
        self.state["pid"], self.state["tok"] = _mk_project(designer, "TEST_T1 RL Hop")

    def test_02_left_spoof_does_not_bypass(self):
        tok = self.state["tok"]
        a = "198.51.100.10"
        codes = [unlock(tok, "bad", chain(a, spoof=f"6.6.6.{i}"), INTERNAL).status_code for i in range(5)]
        assert codes == [401] * 5, codes
        assert unlock(tok, "TEST1234", chain(a, spoof="7.7.7.7"), INTERNAL).status_code == 429
        assert unlock(tok, "TEST1234", chain(a), INTERNAL).status_code == 429
        # varying right-most (CF egress) entries also doesn't change key
        assert unlock(tok, "TEST1234", f"{a}, 104.22.9.9, {LB}", INTERNAL).status_code == 429

    def test_03_client_b_unaffected(self):
        tok = self.state["tok"]
        b = "198.51.100.20"
        assert unlock(tok, "bad", chain(b), INTERNAL).status_code == 401
        assert unlock(tok, "TEST1234", chain(b), INTERNAL).status_code == 200
        # success resets B's own counter
        codes = [unlock(tok, "bad", chain(b), INTERNAL).status_code for _ in range(5)]
        assert codes == [401] * 5, codes
        assert unlock(tok, "bad", chain(b), INTERNAL).status_code == 429

    def test_04_short_chain_fallbacks(self):
        tok = self.state["tok"]
        # len < 3 -> xff[0]
        assert unlock(tok, "TEST1234", "192.0.2.50, 10.0.0.1", INTERNAL).status_code == 200
        # no XFF -> client.host (127.0.0.1), works
        assert unlock(tok, "TEST1234", None, INTERNAL).status_code == 200

    def test_99_cleanup(self, admin):
        assert admin.delete(f"/api/projects/{self.state['pid']}").status_code == 200


class TestPerTokenCap:
    state = {}

    def test_01_setup(self, designer):
        self.state["pid"], self.state["tok"] = _mk_project(designer, "TEST_T1 RL Cap")

    def test_02_20_failures_across_ips_then_cap(self):
        tok = self.state["tok"]
        codes = [unlock(tok, "bad", chain(f"10.20.{ip}.1"), INTERNAL).status_code for ip in range(4) for _ in range(5)]
        assert codes == [401] * 20, codes
        assert unlock(tok, "bad", chain("10.99.0.1"), INTERNAL).status_code == 429
        assert unlock(tok, "TEST1234", chain("10.99.0.2"), INTERNAL).status_code == 429
        assert unlock(tok, "TEST1234").status_code == 429  # public path too

    def test_99_cleanup(self, admin):
        assert admin.delete(f"/api/projects/{self.state['pid']}").status_code == 200
