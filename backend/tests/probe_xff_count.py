# Probe: how many wrong unlocks from ONE machine with a malformed client XFF ('x') before 429 (creates & deletes a TEST_ project)
import requests
from conftest import ClerkClient, USERS, BASE_URL
from test_share_ratelimit import _mk_project

a, d = ClerkClient(USERS["admin"][0]), ClerkClient(USERS["designer"][0])
pid, tok = _mk_project(d, "TEST_T1 XFF count")
try:
    u = f"{BASE_URL}/api/share/{tok}/unlock"
    codes = [requests.post(u, json={"password": "bad"}, headers={"X-Forwarded-For": "x"}).status_code for _ in range(24)]
    print("codes:", codes, "401s:", codes.count(401))
    print("other guest (no spoof) correct pw:", requests.post(u, json={"password": "TEST1234"}).status_code)
finally:
    print("cleanup", a.delete(f"/api/projects/{pid}").status_code)
