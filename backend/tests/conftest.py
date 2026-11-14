# Shared fixtures: Clerk backend-API session tokens per role (auto-refresh), image generators
import io
import os
import time
from pathlib import Path

import pytest
import requests
from dotenv import dotenv_values
from PIL import Image

FRONT_ENV = dotenv_values(Path(__file__).resolve().parents[2] / "frontend" / ".env")
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or FRONT_ENV["REACT_APP_BACKEND_URL"]).rstrip("/")
_SK = dotenv_values(Path(__file__).resolve().parents[1] / ".env")["CLERK_SECRET_KEY"]
CLERK = "https://api.clerk.com/v1"
CH = {"Authorization": f"Bearer {_SK}", "User-Agent": "emergent-test"}

USERS = {
    "admin": ("user_3M6ByoGTMHanHnC5hKwJ7ZwNk4L", "inerre.admin+clerk_test@example.com"),
    "designer": ("user_3M6Bys8YNFYztx0dRcSdwLfY9bB", "inerre.designer+clerk_test@example.com"),
    "client": ("user_3M6BywmZ2BtUF72oTlOcabE964c", "inerre.client+clerk_test@example.com"),
}
SAMPLE_PID = "cd1357dfd8fb4edd9e5534e318887386"


class ClerkClient:
    """requests wrapper that refreshes the 60s Clerk session JWT transparently."""

    def __init__(self, user_id):
        self.user_id = user_id
        r = requests.post(f"{CLERK}/sessions", headers=CH, json={"user_id": user_id}, timeout=20)
        r.raise_for_status()
        self.sid = r.json()["id"]
        self.tok, self.ts = None, 0

    def token(self):
        if not self.tok or time.time() - self.ts > 40:
            r = requests.post(f"{CLERK}/sessions/{self.sid}/tokens", headers=CH, json={}, timeout=20)
            r.raise_for_status()
            self.tok, self.ts = r.json()["jwt"], time.time()
        return self.tok

    def req(self, method, path, **kw):
        h = kw.pop("headers", {})
        h["Authorization"] = f"Bearer {self.token()}"
        return requests.request(method, f"{BASE_URL}{path}", headers=h, timeout=120, **kw)

    def get(self, p, **kw): return self.req("GET", p, **kw)
    def post(self, p, **kw): return self.req("POST", p, **kw)
    def patch(self, p, **kw): return self.req("PATCH", p, **kw)
    def put(self, p, **kw): return self.req("PUT", p, **kw)
    def delete(self, p, **kw): return self.req("DELETE", p, **kw)


@pytest.fixture(scope="session")
def admin():
    return ClerkClient(USERS["admin"][0])


@pytest.fixture(scope="session")
def designer():
    return ClerkClient(USERS["designer"][0])


@pytest.fixture(scope="session")
def client_user():
    return ClerkClient(USERS["client"][0])


def make_jpeg(w, h, color=(120, 100, 80)):
    buf = io.BytesIO()
    Image.new("RGB", (w, h), color).save(buf, "JPEG", quality=80)
    return buf.getvalue()


def upload(c, path, w=1600, h=1000, name="TEST_render.jpg"):
    return c.post(path, files={"file": (name, make_jpeg(w, h), "image/jpeg")})
