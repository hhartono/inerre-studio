# Creates a TEST_ project with plan, 3 cameras, hotspot, music + PDF, published + assigned to client. Usage: python setup_ui_media.py [delete <pid>]
import sys
from conftest import ClerkClient, USERS, upload
from test_media import make_pdf, make_wav

admin = ClerkClient(USERS["admin"][0])
if len(sys.argv) > 2 and sys.argv[1] == "delete":
    print(admin.delete(f"/api/projects/{sys.argv[2]}").status_code)
    sys.exit()
pid = admin.post("/api/projects", json={"name": "TEST_UI Media T1"}).json()["id"]
fid = admin.post(f"/api/projects/{pid}/floors", json={"name": "Lantai 1"}).json()["id"]
rid = admin.post(f"/api/floors/{fid}/rooms", json={"name": "Ruang Tamu"}).json()["id"]
upload(admin, f"/api/floors/{fid}/image/plan", 1400, 900, "TEST_plan.jpg")
sids = []
for i, (x, y, a) in enumerate([(0.2, 0.3, 0), (0.5, 0.6, 120), (0.8, 0.4, 240)]):
    s = upload(admin, f"/api/rooms/{rid}/scenes", name=f"TEST_s{i}.jpg").json()["id"]
    admin.patch(f"/api/scenes/{s}", json={"title": f"TEST Scene {i + 1}", "camera": {"x": x, "y": y, "angle": a, "fov": 60}})
    sids.append(s)
admin.patch(f"/api/scenes/{sids[0]}", json={"hotspots": [{"id": "h1", "x": 0.7, "y": 0.5, "target_scene_id": sids[1], "label": "Ke Scene 2"}]})
if "nomedia" not in sys.argv:
    print(admin.post(f"/api/projects/{pid}/music", files={"file": ("TEST_song.wav", make_wav(20), "audio/wav")}).status_code)
    print(admin.post(f"/api/projects/{pid}/pdf", files={"file": ("TEST_deck.pdf", make_pdf(3), "application/pdf")}).status_code)
print(admin.post(f"/api/projects/{pid}/publish").json())
admin.patch(f"/api/projects/{pid}", json={"client_emails": [USERS["client"][1]]})
print(f"PID={pid} SIDS={','.join(sids)}")
