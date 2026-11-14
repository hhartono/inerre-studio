"""Seed Clerk test users (admin/designer/client) and an editable sample project for preview."""
import json
import os
import sys
import urllib.request
from pathlib import Path

import requests
from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv("/app/backend/.env")
SK = os.environ["CLERK_SECRET_KEY"]
API = "http://localhost:8001/api"
PASSWORD = "Inerre-test-12345!"
USERS = {
    "admin": "inerre.admin+clerk_test@example.com",
    "designer": "inerre.designer+clerk_test@example.com",
    "client": "inerre.client+clerk_test@example.com",
}
H = {"Authorization": "Bearer " + SK, "Content-Type": "application/json", "User-Agent": "emergent-test"}
db = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]


def bapi(method, path, body=None):
    r = requests.request(method, "https://api.clerk.com/v1" + path, headers=H, data=json.dumps(body) if body else None, timeout=20)
    r.raise_for_status()
    return r.json()


def ensure_user(email):
    found = bapi("GET", f"/users?email_address={email}")
    if found:
        return found[0]["id"]
    return bapi("POST", "/users", {"email_address": [email], "password": PASSWORD, "skip_password_checks": True})["id"]


def token_for(uid):
    session = bapi("POST", "/sessions", {"user_id": uid})
    return bapi("POST", f"/sessions/{session['id']}/tokens", {"expires_in_seconds": 3600})["jwt"]


ids = {}
for role, email in USERS.items():
    uid = ensure_user(email)
    ids[role] = uid
    db.users.update_one({"user_id": uid}, {"$set": {"user_id": uid, "role": role, "env": "preview", "email": email, "emails": [email], "name": f"Test {role.title()}"}}, upsert=True)
print("users", ids)

if "--users-only" in sys.argv:
    sys.exit(0)

T = {"Authorization": "Bearer " + token_for(ids["admin"])}
IMG = Path("/tmp/inerre_demo")
IMG.mkdir(exist_ok=True)
SRC = {
    "plan": "https://static.prod-images.emergentagent.com/jobs/d559515e-dc21-4768-82e4-34bbddeb7d1d/images/d33e91b68d68639a4d62d945646cc67734edfcfc1e74dfd78a2037afeed63714.jpeg",
    "layout": "https://static.prod-images.emergentagent.com/jobs/d559515e-dc21-4768-82e4-34bbddeb7d1d/images/8e292a4dad31d2d40af4076c6befb608fe420f22e5ace20f79a20df50cba2d8a.jpeg",
    "living1": "https://images.unsplash.com/photo-1724582586529-62622e50c0b3?w=2400&q=85&fm=jpg",
    "living2": "https://images.unsplash.com/photo-1600494448850-6013c64ba722?w=2400&q=85&fm=jpg",
    "living3": "https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?w=2400&q=85&fm=jpg",
    "kitchen1": "https://images.unsplash.com/photo-1663811397261-916af74a9363?w=2400&q=85&fm=jpg",
    "kitchen2": "https://images.unsplash.com/photo-1663811396777-05505d999151?w=2400&q=85&fm=jpg",
    "bed1": "https://images.unsplash.com/photo-1663811396760-b6c84fa45ee9?w=2400&q=85&fm=jpg",
}
for k, u in SRC.items():
    p = IMG / f"{k}.jpg"
    if not p.exists():
        urllib.request.urlretrieve(u, p)


def call(method, path, **kw):
    r = requests.request(method, API + path, headers=T, timeout=180, **kw)
    if r.status_code >= 400:
        raise SystemExit(f"{method} {path} -> {r.status_code} {r.text[:300]}")
    return r.json()


def up(path, key):
    with open(IMG / f"{key}.jpg", "rb") as f:
        return call("POST", path, files={"file": (f"{key}.jpg", f, "image/jpeg")})


proj = call("POST", "/projects", json={"name": "Contoh: Apartemen Kemang", "code": "INR-DEMO-01"})
pid = proj["id"]
call("PATCH", f"/projects/{pid}", json={"client_emails": [USERS["client"]]})
floor = call("POST", f"/projects/{pid}/floors", json={"name": "Lantai 1"})
up(f"/floors/{floor['id']}/image/plan", "plan")
up(f"/floors/{floor['id']}/image/layout3d", "layout")
call("PATCH", f"/floors/{floor['id']}", json={"layout3d_caption": "Contoh keterangan layout 3D. Ubah teks ini di editor lantai."})
rooms = {n: call("POST", f"/floors/{floor['id']}/rooms", json={"name": n}) for n in ["Ruang Keluarga", "Dapur", "Kamar Utama"]}
plan = [
    ("Ruang Keluarga", "living1", "Living room overview", "Contoh deskripsi scene. Tulis cerita ruang di sini.", (0.62, 0.55, 200)),
    ("Ruang Keluarga", "living2", "Sofa & reading corner", "Contoh deskripsi scene.", (0.48, 0.62, -30)),
    ("Ruang Keluarga", "living3", "Window view", "Contoh deskripsi scene.", (0.55, 0.40, 90)),
    ("Dapur", "kitchen1", "Kitchen island", "Contoh deskripsi scene.", (0.80, 0.30, 180)),
    ("Dapur", "kitchen2", "Pantry wall", "Contoh deskripsi scene.", (0.86, 0.45, -90)),
    ("Kamar Utama", "bed1", "Master bedroom", "Contoh deskripsi scene.", (0.22, 0.30, 45)),
]
scenes = []
for room, key, title, desc, cam in plan:
    s = up(f"/rooms/{rooms[room]['id']}/scenes", key)
    call("PATCH", f"/scenes/{s['id']}", json={"title": title, "description": desc, "camera": {"x": cam[0], "y": cam[1], "angle": cam[2], "fov": 70}})
    scenes.append(s["id"])
links = [(0, 1, 0.30, 0.62, "Sofa corner"), (0, 3, 0.85, 0.50, "Ke Dapur"), (1, 2, 0.70, 0.45, "Window view"), (3, 4, 0.75, 0.55, "Pantry"), (2, 5, 0.20, 0.55, "Ke Kamar Utama")]
for a, b, x, y, label in links:
    cur = call("GET", f"/projects/{pid}/draft")["scenes"]
    sa = next(s for s in cur if s["id"] == scenes[a])
    hid = f"h{a}{b}"
    call("PATCH", f"/scenes/{scenes[a]}", json={"hotspots": sa["hotspots"] + [{"id": hid, "x": x, "y": y, "target_scene_id": scenes[b], "label": label}]})
    call("POST", f"/scenes/{scenes[a]}/backlink", json={"hotspot_id": hid})
print("publish", call("POST", f"/projects/{pid}/publish"))
print("project", pid)
