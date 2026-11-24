# Cleanup helper: admin-delete given TEST_ render projects and verify TEST-MAT-1 is gone
import sys
from conftest import ClerkClient, USERS

a = ClerkClient(USERS["admin"][0])
for pid in sys.argv[1:]:
    p = a.get(f"/api/rs/projects/{pid}")
    if p.status_code == 200 and p.json()["name"].startswith("TEST_"):
        print(pid, "delete:", a.delete(f"/api/rs/projects/{pid}").status_code, "after:", a.get(f"/api/rs/projects/{pid}").status_code)
print("TEST-MAT left:", [m["code"] for m in a.get("/api/rs/materials").json() if m["code"].startswith("TEST")])
s = a.get("/api/rs/settings").json()
print("custom_model:", repr(s["custom_model"]), "draft_quality:", s["draft_quality"])
print("projects:", [(p["name"]) for p in a.get("/api/rs/projects").json()])
