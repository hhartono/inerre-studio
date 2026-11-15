# Creates a TEST_ shared project (2 scenes, published, share enabled pw TEST1234) for UI tests; `python3 setup_share_ui.py del <pid>` deletes it
import sys
from conftest import ClerkClient, USERS, upload

a, d = ClerkClient(USERS["admin"][0]), ClerkClient(USERS["designer"][0])
if len(sys.argv) > 2 and sys.argv[1] == "del":
    print("deleted", a.delete(f"/api/projects/{sys.argv[2]}").status_code)
    sys.exit()
pid = d.post("/api/projects", json={"name": "TEST_T1 Share UI"}).json()["id"]
fid = d.post(f"/api/projects/{pid}/floors", json={"name": "Lantai 1"}).json()["id"]
rid = d.post(f"/api/floors/{fid}/rooms", json={"name": "Ruang Tamu"}).json()["id"]
upload(d, f"/api/floors/{fid}/image/plan", 1200, 800, "TEST_plan.jpg")
for i, col in enumerate([(150, 120, 90), (60, 90, 120)]):
    from conftest import make_jpeg
    sid = d.post(f"/api/rooms/{rid}/scenes", files={"file": (f"TEST_s{i}.jpg", make_jpeg(1600, 1000, col), "image/jpeg")}).json()["id"]
    d.patch(f"/api/scenes/{sid}", json={"title": f"TEST Scene {i+1}", "description": "Deskripsi uji coba yang cukup panjang untuk melihat panel cerita di HP. " * 3,
                                         "camera": {"x": 0.3 + i * 0.3, "y": 0.5, "angle": 45, "fov": 60}})
print("publish", d.post(f"/api/projects/{pid}/publish").status_code)
s = d.put(f"/api/projects/{pid}/share", json={"enabled": True, "password": "TEST1234"}).json()
print(f"PID={pid}")
print(f"TOKEN={s['token']}")
