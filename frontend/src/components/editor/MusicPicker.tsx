import { useEffect, useRef, useState } from "react";
import { Pause, Play, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg } from "@/lib/api";
import { mediaSrc } from "@/lib/viewer";
import { useEditor } from "@/components/editor/EditorContext";
import { Section, btnGhost } from "@/components/editor/ui";

interface Track {
  id: string;
  title: string;
  artist: string;
  genre: string;
  license: string;
  url: string;
}

function Row({ active, onPick, children, testid }: { active: boolean; onPick: () => void; children: React.ReactNode; testid: string }) {
  return (
    <div className={`flex items-center gap-4 border px-4 py-3 transition-colors ${active ? "border-brass/60 bg-surface" : "border-paper/10 hover:border-paper/25"}`} data-testid={testid}>
      <button onClick={onPick} className="flex min-w-0 flex-1 items-center gap-3 text-left" data-testid={`${testid}-pick`}>
        <span className={`h-3.5 w-3.5 shrink-0 rounded-full border ${active ? "border-brass bg-brass" : "border-paper/35"}`} />
        {children}
      </button>
    </div>
  );
}

export function MusicPicker() {
  const { data, reload } = useEditor();
  const p = data.project as any;
  const [tracks, setTracks] = useState<Track[]>([]);
  const [def, setDef] = useState("");
  const [previewing, setPreviewing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);
  const source = p.music_source || (p.music_file_id ? "upload" : "system");
  const track = p.music_track || def;

  useEffect(() => {
    api.get("/music/tracks").then((r) => {
      setTracks(r.data.tracks);
      setDef(r.data.default);
    });
    return () => {
      audio.current?.pause();
    };
  }, []);

  const choose = async (src: string, t?: string) => {
    try {
      await api.put(`/projects/${p.id}/music-choice`, { source: src, track: t });
      reload();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };
  const preview = (id: string, url: string) => {
    audio.current?.pause();
    if (previewing === id) return setPreviewing(null);
    audio.current = new Audio(mediaSrc(url));
    audio.current.volume = 0.6;
    audio.current.play().catch(() => setPreviewing(null));
    setPreviewing(id);
  };
  const upload = async (file: File) => {
    setBusy(true);
    const fd = new FormData();
    fd.append("file", file);
    try {
      await api.post(`/projects/${p.id}/music`, fd, { timeout: 300000 });
      toast.success("Musik diunggah dan dipakai untuk tur");
      await reload();
    } catch (e) {
      toast.error(errMsg(e));
    }
    setBusy(false);
  };
  const removeUpload = async () => {
    if (!window.confirm("Hapus musik unggahan? Tur kembali memakai lagu bawaan.")) return;
    await api.delete(`/projects/${p.id}/music`).catch((e) => toast.error(errMsg(e)));
    reload();
  };
  const PreviewBtn = ({ id, url }: { id: string; url: string }) => (
    <button onClick={() => preview(id, url)} className="shrink-0 p-2 text-paper/55 transition-colors hover:text-brass" title="Dengarkan" data-testid={`music-preview-${id}`}>
      {previewing === id ? <Pause size={14} /> : <Play size={14} />}
    </button>
  );

  return (
    <Section title="Musik tur">
      <p className="mb-5 text-sm text-paper/45">Diputar saat klien menjalankan tur. Lagu bawaan: musik klasik domain publik dan musik kontemporer berlisensi bebas (CC0 / CC BY, kredit tampil otomatis di viewer). Klien bisa mematikannya.</p>
      <div className="space-y-2" data-testid="music-picker">
        {tracks.map((t, i) => (
          <div key={t.id}>
            {(i === 0 || tracks[i - 1].genre !== t.genre) && <p className="eyebrow pb-2 pt-4 text-paper/45" data-testid={`music-genre-${t.genre}`}>{t.genre}</p>}
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <Row active={source === "system" && track === t.id} onPick={() => choose("system", t.id)} testid={`music-track-${t.id}`}>
                <span className="truncate text-sm">{t.title}</span>
                <span className="eyebrow hidden truncate text-paper/40 sm:inline">{t.artist}</span>
                {t.license.startsWith("CC BY") && <span className="eyebrow hidden shrink-0 text-[9px] text-paper/30 md:inline">{t.license}</span>}
                {t.id === def && <span className="eyebrow ml-auto shrink-0 text-[9px] text-brass">Default</span>}
              </Row>
            </div>
            <PreviewBtn id={t.id} url={t.url} />
          </div>
          </div>
        ))}
        {p.music_file_id && (
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <Row active={source === "upload"} onPick={() => choose("upload")} testid="music-upload-option">
                <span className="truncate text-sm">{p.music_name || "Musik unggahan"}</span>
                <span className="eyebrow ml-auto shrink-0 text-[9px] text-paper/40">Unggahan</span>
              </Row>
            </div>
            <button onClick={removeUpload} className="shrink-0 p-2 text-paper/45 transition-colors hover:text-red-400" data-testid="music-remove-btn"><Trash2 size={14} /></button>
          </div>
        )}
        <div className="flex items-center gap-2 pt-4">
          <div className="flex-1">
            <Row active={source === "none"} onPick={() => choose("none")} testid="music-none-option">
              <span className="text-sm text-paper/70">Tanpa musik</span>
            </Row>
          </div>
          <span className="w-[30px] shrink-0" />
        </div>
      </div>
      <label className={`${btnGhost} mt-5 cursor-pointer ${busy ? "pointer-events-none opacity-60" : ""}`} data-testid="upload-music">
        {busy ? "Mengunggah…" : p.music_file_id ? "Ganti musik unggahan" : "Unggah musik sendiri"}
        <input type="file" accept="audio/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) upload(f); }} data-testid="upload-music-input" />
      </label>
    </Section>
  );
}
