# INERRE iteration_4/6: built-in music library (Lounge + Klasik), music-choice API, publish snapshot, legacy revisions
from pathlib import Path

import pytest
import requests
from dotenv import dotenv_values
from pymongo import MongoClient

from conftest import BASE_URL, USERS, upload
from test_media import make_wav

CLASSIC = ["gymnopedie-1", "clair-de-lune", "nocturne-op9-2", "gnossienne-1", "air-bach"]
LOUNGE = ["backbay-lounge", "airport-lounge", "casa-bossa-nova", "zazie", "kool-kats"]
REMOVED = ["chill-out-theme", "softly", "meekness", "chill-breeze", "lofi-upbeat"]
TRACKS = LOUNGE + CLASSIC


# ---- Track list + static mp3 serving ----
class TestTracks:
    def test_tracks_list(self, client_user):
        r = client_user.get("/api/music/tracks")
        assert r.status_code == 200
        d = r.json()
        assert d["default"] == "backbay-lounge"
        assert [t["id"] for t in d["tracks"]] == TRACKS
        for t in d["tracks"]:
            assert t["url"] == f"/music/{t['id']}.mp3" and t["title"] and t["artist"] and t["license"]
            assert t["genre"] == ("Klasik" if t["id"] in CLASSIC else "Lounge")
            if t["id"] in LOUNGE:
                assert t["artist"] == "Kevin MacLeod" and t["license"] == "CC BY 3.0"

    @pytest.mark.parametrize("tid", REMOVED)
    def test_removed_mp3_gone(self, tid):
        r = requests.get(f"{BASE_URL}/music/{tid}.mp3", headers={"Range": "bytes=0-99"}, timeout=30)
        assert not (r.status_code in (200, 206) and r.headers.get("content-type", "").startswith("audio/mpeg"))

    def test_tracks_unauth(self):
        assert requests.get(f"{BASE_URL}/api/music/tracks", timeout=30).status_code == 401

    @pytest.mark.parametrize("tid", TRACKS)
    def test_static_mp3(self, tid):
        url = f"{BASE_URL}/music/{tid}.mp3"
        r = requests.get(url, headers={"Range": "bytes=0-99"}, timeout=60)
        assert r.status_code == 206, r.status_code
        assert r.headers["content-type"].startswith("audio/mpeg"), r.headers["content-type"]
        assert len(r.content) == 100
        assert r.content[:3] == b"ID3" or r.content[0] == 0xFF


# ---- music-choice lifecycle on a TEST_ project ----
class TestMusicChoice:
    state = {}

    def test_01_setup(self, admin, designer):
        pid = designer.post("/api/projects", json={"name": "TEST_T1 Music"}).json()["id"]
        self.state["pid"] = pid
        fid = designer.post(f"/api/projects/{pid}/floors", json={"name": "Lantai 1"}).json()["id"]
        rid = designer.post(f"/api/floors/{fid}/rooms", json={"name": "Ruang"}).json()["id"]
        upload(designer, f"/api/floors/{fid}/image/plan", 1200, 800, "TEST_plan.jpg")
        sid = upload(designer, f"/api/rooms/{rid}/scenes", name="TEST_s.jpg").json()["id"]
        designer.patch(f"/api/scenes/{sid}", json={"title": "TEST", "camera": {"x": 0.5, "y": 0.5, "angle": 45, "fov": 60}})
        assert admin.patch(f"/api/projects/{pid}", json={"client_emails": [USERS["client"][1]]}).status_code == 200

    def test_02_new_project_default(self, designer):
        pid = self.state["pid"]
        for path in (f"/api/projects/{pid}/draft", f"/api/projects/{pid}/view?mode=draft"):
            d = designer.get(path).json()
            assert d["music_url"] == "/music/backbay-lounge.mp3", path
            assert d["music_title"] == "Backbay Lounge · Kevin MacLeod (CC BY 3.0)"

    def test_03_switch_track(self, designer):
        pid = self.state["pid"]
        r = designer.put(f"/api/projects/{pid}/music-choice", json={"source": "system", "track": "clair-de-lune"})
        assert r.status_code == 200 and r.json()["music_source"] == "system" and r.json()["music_track"] == "clair-de-lune"
        d = designer.get(f"/api/projects/{pid}/draft").json()
        assert d["music_url"] == "/music/clair-de-lune.mp3" and "Debussy" in d["music_title"]

    def test_03b_lounge_cc_by_credit(self, designer):
        pid = self.state["pid"]
        r = designer.put(f"/api/projects/{pid}/music-choice", json={"source": "system", "track": "zazie"})
        assert r.status_code == 200 and r.json()["music_track"] == "zazie"
        d = designer.get(f"/api/projects/{pid}/view?mode=draft").json()
        assert d["music_url"] == "/music/zazie.mp3"
        assert d["music_title"] == "Zazie · Kevin MacLeod (CC BY 3.0)"
        designer.put(f"/api/projects/{pid}/music-choice", json={"source": "system", "track": "gnossienne-1"})
        d = designer.get(f"/api/projects/{pid}/draft").json()
        assert d["music_url"] == "/music/gnossienne-1.mp3" and "CC" not in d["music_title"]
        designer.put(f"/api/projects/{pid}/music-choice", json={"source": "system", "track": "clair-de-lune"})

    def test_03c_removed_tracks_rejected_and_fallback(self, designer):
        pid = self.state["pid"]
        for tid in REMOVED:
            assert designer.put(f"/api/projects/{pid}/music-choice", json={"source": "system", "track": tid}).status_code == 400
        env = dotenv_values(Path(__file__).resolve().parents[1] / ".env")
        db = MongoClient(env["MONGO_URL"])[env["DB_NAME"]]
        db.projects.update_one({"id": pid}, {"$set": {"music_track": "meekness", "music_source": "system"}})
        d = designer.get(f"/api/projects/{pid}/draft").json()
        assert d["music_url"] == "/music/backbay-lounge.mp3"
        assert designer.put(f"/api/projects/{pid}/music-choice", json={"source": "system", "track": "clair-de-lune"}).status_code == 200

    def test_04_invalid(self, designer, client_user):
        pid = self.state["pid"]
        assert designer.put(f"/api/projects/{pid}/music-choice", json={"source": "system", "track": "nope"}).status_code == 400
        assert designer.put(f"/api/projects/{pid}/music-choice", json={"source": "system"}).status_code == 400
        assert designer.put(f"/api/projects/{pid}/music-choice", json={"source": "weird"}).status_code == 400
        r = designer.put(f"/api/projects/{pid}/music-choice", json={"source": "upload"})
        assert r.status_code == 400 and r.json()["detail"] == "Belum ada musik yang diunggah"
        assert client_user.put(f"/api/projects/{pid}/music-choice", json={"source": "none"}).status_code == 403
        assert requests.put(f"{BASE_URL}/api/projects/{pid}/music-choice", json={"source": "none"}, timeout=30).status_code == 401
        # still clair-de-lune
        assert designer.get(f"/api/projects/{pid}/draft").json()["music_url"] == "/music/clair-de-lune.mp3"

    def test_05_publish_snapshot_and_none(self, designer, client_user):
        pid = self.state["pid"]
        assert designer.post(f"/api/projects/{pid}/publish").json()["number"] == 1
        v = client_user.get(f"/api/projects/{pid}/view").json()
        assert v["music_url"] == "/music/clair-de-lune.mp3"
        r = designer.put(f"/api/projects/{pid}/music-choice", json={"source": "none"})
        assert r.status_code == 200 and r.json()["music_source"] == "none"
        d = designer.get(f"/api/projects/{pid}/draft").json()
        assert d["music_url"] is None and d["music_title"] is None
        # client still sees rev 1 choice
        assert client_user.get(f"/api/projects/{pid}/view").json()["music_url"] == "/music/clair-de-lune.mp3"
        assert designer.post(f"/api/projects/{pid}/publish").json()["number"] == 2
        assert client_user.get(f"/api/projects/{pid}/view").json()["music_url"] is None

    def test_06_upload_then_delete(self, designer):
        pid = self.state["pid"]
        r = designer.post(f"/api/projects/{pid}/music", files={"file": ("TEST_song.wav", make_wav(), "audio/wav")})
        assert r.status_code == 200 and r.json()["music_source"] == "upload"
        d = designer.get(f"/api/projects/{pid}/draft").json()
        assert d["music_url"].startswith("/api/img/") and "/audio?e=" in d["music_url"]
        assert d["music_title"] == "Musik unggahan"
        # switch to system and back to upload
        assert designer.put(f"/api/projects/{pid}/music-choice", json={"source": "system", "track": "air-bach"}).status_code == 200
        assert designer.get(f"/api/projects/{pid}/draft").json()["music_url"] == "/music/air-bach.mp3"
        assert designer.put(f"/api/projects/{pid}/music-choice", json={"source": "upload"}).status_code == 200
        assert "/audio?e=" in designer.get(f"/api/projects/{pid}/draft").json()["music_url"]
        r = designer.delete(f"/api/projects/{pid}/music")
        assert r.status_code == 200 and r.json()["music_source"] == "system" and r.json()["music_file_id"] is None
        # falls back to last chosen system track (air-bach)
        assert designer.get(f"/api/projects/{pid}/draft").json()["music_url"] == "/music/air-bach.mp3"

    def test_07_legacy_revision_no_music(self, designer, client_user):
        pid = self.state["pid"]
        assert designer.post(f"/api/projects/{pid}/publish").json()["number"] == 3
        assert client_user.get(f"/api/projects/{pid}/view").json()["music_url"] == "/music/air-bach.mp3"
        env = dotenv_values(Path(__file__).resolve().parents[1] / ".env")
        db = MongoClient(env["MONGO_URL"])[env["DB_NAME"]]
        res = db.revisions.update_one({"project_id": pid, "number": 3}, {"$unset": {"snapshot.music": ""}})
        assert res.modified_count == 1
        assert client_user.get(f"/api/projects/{pid}/view").json()["music_url"] is None

    def test_99_cleanup(self, admin):
        pid = self.state.get("pid")
        if pid:
            assert admin.delete(f"/api/projects/{pid}").status_code == 200
