# INERRE iteration_2: tour music + PDF presentation (upload/delete, draft media URLs, publish snapshot, audio Range)
import io
import struct
import wave

import pymupdf
import pytest
import requests

from conftest import BASE_URL, SAMPLE_PID, USERS, upload


def make_wav(seconds=1):
    buf = io.BytesIO()
    w = wave.open(buf, "wb")
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(8000)
    w.writeframes(b"".join(struct.pack("<h", (i * 300) % 30000 - 15000) for i in range(8000 * seconds)))
    w.close()
    return buf.getvalue()


def make_pdf(n=3):
    doc = pymupdf.open()
    for i in range(n):
        pg = doc.new_page(width=842, height=595)
        pg.insert_text((72, 100), f"TEST page {i + 1}", fontsize=40)
    return doc.tobytes()


# ---- Sample project must have no media ----
class TestSampleNoMedia:
    def test_sample_view_no_media(self, client_user):
        d = client_user.get(f"/api/projects/{SAMPLE_PID}/view").json()
        assert d["music_url"] is None
        assert d["pdf_pages"] == []


# ---- Music + PDF lifecycle on TEST_ project ----
class TestMedia:
    state = {}

    def test_01_setup_publish(self, admin, designer):
        pid = designer.post("/api/projects", json={"name": "TEST_T1 Media"}).json()["id"]
        self.state["pid"] = pid
        fid = designer.post(f"/api/projects/{pid}/floors", json={"name": "Lantai 1"}).json()["id"]
        rid = designer.post(f"/api/floors/{fid}/rooms", json={"name": "Ruang"}).json()["id"]
        upload(designer, f"/api/floors/{fid}/image/plan", 1200, 800, "TEST_plan.jpg")
        for i in range(2):
            sid = upload(designer, f"/api/rooms/{rid}/scenes", name=f"TEST_s{i}.jpg").json()["id"]
            designer.patch(f"/api/scenes/{sid}", json={"title": f"TEST {i}", "camera": {"x": 0.3 + i * 0.3, "y": 0.5, "angle": 45, "fov": 60}})
        assert designer.post(f"/api/projects/{pid}/publish").json()["number"] == 1
        r = admin.patch(f"/api/projects/{pid}", json={"client_emails": [USERS["client"][1]]})
        assert r.status_code == 200

    def test_02_music_reject_non_audio(self, designer):
        pid = self.state["pid"]
        r = designer.post(f"/api/projects/{pid}/music", files={"file": ("x.txt", b"hello", "text/plain")})
        assert r.status_code == 400

    def test_03_music_upload(self, designer):
        pid = self.state["pid"]
        r = designer.post(f"/api/projects/{pid}/music", files={"file": ("TEST_song.wav", make_wav(), "audio/wav")})
        assert r.status_code == 200, r.text
        assert r.json()["music_name"] == "TEST_song.wav" and r.json()["music_file_id"]
        d = designer.get(f"/api/projects/{pid}/draft").json()
        assert d["music_url"] and "/audio?e=" in d["music_url"]
        self.state["music_url"] = d["music_url"]

    def test_04_audio_serving_range(self, designer):
        url = BASE_URL + self.state["music_url"]
        full = requests.get(url, timeout=60)
        assert full.status_code == 200 and full.headers["content-type"].startswith("audio/")
        size = len(full.content)
        r = requests.get(url, headers={"Range": "bytes=0-99"}, timeout=60)
        assert r.status_code == 206 and len(r.content) == 100
        assert r.headers["content-range"] == f"bytes 0-99/{size}"
        r = requests.get(url, headers={"Range": "bytes=100-"}, timeout=60)
        assert r.status_code == 206 and len(r.content) == size - 100
        r = requests.get(url, headers={"Range": "bytes=-50"}, timeout=60)
        assert r.status_code == 206 and len(r.content) == 50
        r = requests.get(url, headers={"Range": f"bytes={size + 10}-"}, timeout=60)
        assert r.status_code == 416
        # tampered signature
        assert requests.get(url.replace("/audio?", "/web?"), timeout=30).status_code == 403
        # iteration_3: malformed / reversed ranges -> 416 (not 500 / empty 206)
        for bad in ["bytes=abc-", "bytes=10-5", "bytes=-abc", "bytes=5-x"]:
            r = requests.get(url, headers={"Range": bad}, timeout=60)
            assert r.status_code == 416, (bad, r.status_code)
            assert r.headers.get("content-range") == f"bytes */{size}"

    def test_04b_music_empty_file(self, designer):
        # iteration_3: empty audio -> 400 'File kosong'
        r = designer.post(f"/api/projects/{self.state['pid']}/music", files={"file": ("TEST_empty.mp3", b"", "audio/mpeg")})
        assert r.status_code == 400 and r.json()["detail"] == "File kosong"

    def test_05_pdf_reject_non_pdf(self, designer):
        pid = self.state["pid"]
        r = designer.post(f"/api/projects/{pid}/pdf", files={"file": ("x.pdf", b"not a pdf", "application/pdf")})
        assert r.status_code == 400

    def test_06_pdf_upload(self, designer):
        pid = self.state["pid"]
        r = designer.post(f"/api/projects/{pid}/pdf", files={"file": ("TEST_deck.pdf", make_pdf(3), "application/pdf")})
        assert r.status_code == 200, r.text
        pdf = r.json()["pdf"]
        assert pdf["name"] == "TEST_deck.pdf" and len(pdf["pages"]) == 3
        assert abs(pdf["pages"][0]["aspect"] - 842 / 595) < 0.01
        d = designer.get(f"/api/projects/{pid}/view?mode=draft").json()
        assert len(d["pdf_pages"]) == 3 and d["music_url"]
        pg = requests.get(BASE_URL + d["pdf_pages"][0]["url"], timeout=60)
        assert pg.status_code == 200 and pg.headers["content-type"] == "image/webp"

    def test_07_client_sees_media_after_publish_only(self, designer, client_user):
        pid = self.state["pid"]
        v = client_user.get(f"/api/projects/{pid}/view").json()
        assert v["music_url"] is None and v["pdf_pages"] == []
        assert designer.post(f"/api/projects/{pid}/publish").json()["number"] == 2
        v = client_user.get(f"/api/projects/{pid}/view").json()
        assert v["music_url"] and len(v["pdf_pages"]) == 3

    def test_08_client_cannot_upload(self, client_user):
        pid = self.state["pid"]
        assert client_user.post(f"/api/projects/{pid}/music", files={"file": ("a.wav", make_wav(), "audio/wav")}).status_code == 403
        assert client_user.delete(f"/api/projects/{pid}/pdf").status_code == 403

    def test_09_delete_media_snapshot_preserved(self, designer, client_user):
        pid = self.state["pid"]
        r = designer.delete(f"/api/projects/{pid}/music")
        assert r.status_code == 200 and r.json()["music_file_id"] is None
        r = designer.delete(f"/api/projects/{pid}/pdf")
        assert r.status_code == 200 and r.json()["pdf"] is None
        d = designer.get(f"/api/projects/{pid}/draft").json()
        assert d["music_url"] is None and d["pdf_pages"] == []
        v = client_user.get(f"/api/projects/{pid}/view").json()
        assert v["music_url"] and len(v["pdf_pages"]) == 3  # rev 2 snapshot keeps media
        designer.post(f"/api/projects/{pid}/publish")
        v = client_user.get(f"/api/projects/{pid}/view").json()
        assert v["music_url"] is None and v["pdf_pages"] == []

    def test_99_cleanup(self, admin):
        pid = self.state.get("pid")
        if pid:
            assert admin.delete(f"/api/projects/{pid}").status_code == 200
