# Creates a TEST_ project with one real-photo scene for AI-description UI testing; prints pid / sid. `--delete PID` removes it.
import io
import sys

from PIL import Image
from conftest import ClerkClient, USERS

d = ClerkClient(USERS["designer"][0])
if len(sys.argv) > 2 and sys.argv[1] == "--delete":
    a = ClerkClient(USERS["admin"][0])
    print(a.delete(f"/api/projects/{sys.argv[2]}").status_code)
    sys.exit()
im = Image.open("/app/frontend/public/hero-interior.jpg").convert("RGB")
im.thumbnail((1600, 1600))
buf = io.BytesIO()
im.save(buf, "JPEG", quality=82)
pid = d.post("/api/projects", json={"name": "TEST_AI UI", "code": "TUI"}).json()["id"]
fid = d.post(f"/api/projects/{pid}/floors", json={"name": "Lantai 1"}).json()["id"]
rid = d.post(f"/api/floors/{fid}/rooms", json={"name": "Ruang Tamu"}).json()["id"]
sid = d.post(f"/api/rooms/{rid}/scenes", files={"file": ("TEST_sofa.jpg", buf.getvalue(), "image/jpeg")}).json()["id"]
sc = next(x for x in d.get(f"/api/projects/{pid}/draft").json()["scenes"] if x["id"] == sid)
print("pid", pid, "sid", sid, "title", sc.get("title"), "desc", repr(sc.get("description")))
