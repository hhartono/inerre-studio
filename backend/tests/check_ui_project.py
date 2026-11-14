# Ad-hoc verifier for the UI-created TEST_ project (persistence of editor actions)
import sys
from conftest import ClerkClient, USERS

pid = open("/tmp/ui_pid.txt").read().strip()
a = ClerkClient(USERS["admin"][0])
c = ClerkClient(USERS["client"][0])
d = a.get(f"/api/projects/{pid}/draft").json()
print("project:", d["project"]["name"], "rev:", d["project"]["published_revision"], "clients:", d["project"]["client_emails"])
print("floors:", [(f["name"], bool(f["plan_file_id"]), bool(f["layout3d_file_id"]), f["layout3d_caption"]) for f in d["floors"]])
print("rooms:", [r["name"] for r in d["rooms"]])
for s in d["scenes"]:
    print("scene:", s["id"][:6], s["title"], "|", s["area"], "|", s["description"], "| cam:", s["camera"], "| hs:", [(h["x"], h["y"], (h["target_scene_id"] or "")[:6], h["label"]) for h in s["hotspots"]])
print("tour:", [x[:6] for x in d["tour_order"]])
print("revisions:", [(r["number"], r["scene_count"]) for r in d["revisions"]])
v = c.get(f"/api/projects/{pid}/view")
print("client view:", v.status_code, v.json().get("revision") if v.ok else v.text)
if len(sys.argv) > 1 and sys.argv[1] == "delete":
    print("delete:", a.delete(f"/api/projects/{pid}").status_code, a.get(f"/api/projects/{pid}/draft").status_code)
