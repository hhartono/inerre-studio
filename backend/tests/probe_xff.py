# Probe: what XFF chain reaches share_unlock for various client-supplied XFF values (creates & deletes a TEST_ project)
import requests
from conftest import ClerkClient, USERS, BASE_URL, upload

a, d = ClerkClient(USERS["admin"][0]), ClerkClient(USERS["designer"][0])
pid = d.post("/api/projects", json={"name": "TEST_T1 XFF"}).json()["id"]
try:
    fid = d.post(f"/api/projects/{pid}/floors", json={"name": "L1"}).json()["id"]
    rid = d.post(f"/api/floors/{fid}/rooms", json={"name": "R"}).json()["id"]
    upload(d, f"/api/floors/{fid}/image/plan", 1200, 800)
    sid = upload(d, f"/api/rooms/{rid}/scenes").json()["id"]
    d.patch(f"/api/scenes/{sid}", json={"title": "T", "camera": {"x": .5, "y": .5, "angle": 0, "fov": 60}})
    print("publish", d.post(f"/api/projects/{pid}/publish").status_code)
    tok = d.put(f"/api/projects/{pid}/share", json={"enabled": True, "password": "TEST1234"}).json()["token"]
    u = f"{BASE_URL}/api/share/{tok}/unlock"
    for x in [None, "1.2.3.4", "1.1.1.1, 2.2.2.2", "a, b, c, d", "11.0.0.1, 11.0.0.2, 11.0.0.3", "x"]:
        h = {"X-Forwarded-For": x} if x else {}
        print(repr(x), requests.post(u, json={"password": "TEST1234"}, headers=h).status_code)
finally:
    print("cleanup", a.delete(f"/api/projects/{pid}").status_code)
