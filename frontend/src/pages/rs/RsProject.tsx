import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { api, errMsg, img } from "@/lib/api";
import { ACTIVE, STATUS_LABEL, download, type Angle, type RsProject } from "@/lib/rs";
import { RsShell, Pill, statusTone } from "@/components/rs/RsShell";
import { useMe } from "@/context/MeContext";
import { InlineAdd, Label, Section, UploadButton, btn, btnDanger, btnGhost, inputCls } from "@/components/editor/ui";

const MEMORY: [keyof RsProject, string][] = [["description", "Deskripsi proyek"], ["concept", "Konsep desain"], ["palette", "Palet material"], ["instructions", "Instruksi render khusus proyek"]];

function Field({ p, k, label, onSave, area }: { p: any; k: string; label: string; onSave: (k: string, v: string) => void; area?: boolean }) {
  const [v, setV] = useState(p[k] || "");
  useEffect(() => {
    setV(p[k] || "");
  }, [p, k]);
  const props = { className: inputCls, value: v, onChange: (e: any) => setV(e.target.value), onBlur: () => v !== (p[k] || "") && onSave(k, v), "data-testid": `rs-field-${k}` };
  return <div><Label>{label}</Label>{area ? <textarea rows={3} {...props} /> : <input {...props} />}</div>;
}

function AngleCard({ a, picked, onPick }: { a: Angle; picked: boolean; onPick: () => void }) {
  const r = a.latest;
  const thumb = r?.graded?.thumb || r?.raw?.thumb || a.source.thumb;
  return (
    <div className="group relative" data-testid={`rs-angle-card-${a.id}`}>
      <Link to={`/render/studio/${a.id}`} className="block aspect-[3/2] overflow-hidden bg-surface">
        <img src={img(thumb)} alt="" className="h-full w-full object-cover transition-opacity group-hover:opacity-85" />
      </Link>
      <label className="absolute left-2 top-2 flex items-center gap-1.5 bg-ink/80 px-2 py-1 text-[10px]">
        <input type="checkbox" checked={picked} onChange={onPick} data-testid={`rs-angle-pick-${a.id}`} /> Seri
      </label>
      <div className="mt-2 flex items-center justify-between gap-2">
        <Link to={`/render/studio/${a.id}`} className="truncate text-sm text-paper/85 hover:text-brass">{a.name}</Link>
        {r && <Pill tone={statusTone(r.status) as any}>{STATUS_LABEL[r.status]}{r.status === "completed" ? ` v${r.version_no}` : ""}</Pill>}
      </div>
    </div>
  );
}

export default function RsProject() {
  const { pid } = useParams();
  const nav = useNavigate();
  const { me } = useMe();
  const [p, setP] = useState<RsProject | null>(null);
  const [ambs, setAmbs] = useState<any[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [mode, setMode] = useState("draft");
  const [busy, setBusy] = useState("");
  const load = useCallback(() => api.get(`/rs/projects/${pid}`).then((r) => setP(r.data)), [pid]);
  useEffect(() => {
    load();
    api.get("/rs/ambiences").then((r) => setAmbs(r.data));
  }, [load]);
  const running = p?.angles.some((a) => a.latest && ACTIVE.includes(a.latest.status));
  useEffect(() => {
    if (!running) {
      return;
    }
    const t = setInterval(load, 4000);
    return () => {
      clearInterval(t);
    };
  }, [running, load]);
  if (!p) return <RsShell><p className="eyebrow animate-pulse text-paper/40">Memuat…</p></RsShell>;

  const save = async (k: string, v: any) => {
    await api.patch(`/rs/projects/${p.id}`, { [k]: v }).catch((e) => toast.error(errMsg(e)));
    load();
  };
  const upload = async (rid: string, files: File[]) => {
    setBusy(rid);
    for (const f of files) {
      const fd = new FormData();
      fd.append("file", f);
      fd.append("name", f.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").slice(0, 60));
      await api.post(`/rs/rooms/${rid}/angles`, fd).catch((e) => toast.error(errMsg(e)));
    }
    setBusy("");
    load();
  };
  const series = async () => {
    try {
      const r = await api.post(`/rs/projects/${p.id}/series`, { angle_ids: picked, mode });
      toast.success(`${r.data.jobs.length} render dimulai${r.data.skipped.length ? `, ${r.data.skipped.length} dilewati (masih berjalan)` : ""}`);
      setPicked([]);
      load();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };
  const del = async () => {
    if (!window.confirm(`Hapus proyek "${p.name}" beserta semua riwayat render?`)) return;
    await api.delete(`/rs/projects/${p.id}`);
    nav("/render/projects");
  };

  return (
    <RsShell title={p.name} aside={<div className="flex gap-3"><button className={btnGhost} onClick={() => download(`/rs/projects/${p.id}/approved.zip`, `${p.code || p.name}-approved.zip`).catch((e) => toast.error(e?.response?.status === 404 ? "Belum ada render yang disetujui" : errMsg(e)))} data-testid="rs-download-zip-btn">Unduh ZIP disetujui</button>{me?.role === "admin" && <button className={btnDanger} onClick={del} data-testid="rs-project-delete-btn">Hapus</button>}</div>}>
      <div className="grid gap-12 xl:grid-cols-[1fr_380px]">
        <div>
          <Section title="Ruangan & angle kamera" aside={<InlineAdd label="Tambah ruangan" placeholder="Living Room" testid="rs-add-room" onAdd={async (n) => { await api.post(`/rs/projects/${p.id}/rooms`, { name: n }); load(); }} />}>
            {!p.rooms.length && <p className="text-sm text-paper/45">Tambahkan ruangan dulu, lalu unggah screenshot SketchUp per angle.</p>}
            <div className="space-y-12">
              {p.rooms.map((room) => (
                <div key={room.id} data-testid={`rs-room-${room.id}`}>
                  <div className="mb-4 flex flex-wrap items-center gap-3">
                    <h3 className="display text-2xl">{room.name}</h3>
                    {room.master_render_id && <Pill tone="brass">Master ruangan</Pill>}
                    <span className="flex-1" />
                    <select className={`${inputCls} w-auto py-1.5 text-xs`} value={room.ambience_id || ""} onChange={async (e) => { await api.patch(`/rs/rooms/${room.id}`, { ambience_id: e.target.value }); load(); }} data-testid={`rs-room-ambience-${room.id}`}>
                      <option value="">Suasana: ikut proyek</option>
                      {ambs.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                    <UploadButton label="Unggah screenshot" multiple busy={busy === room.id ? "Mengunggah…" : ""} onFiles={(f) => upload(room.id, f)} testid={`rs-upload-angle-${room.id}`} />
                    <button onClick={async () => { if (window.confirm(`Hapus ruangan "${room.name}"?`)) { await api.delete(`/rs/rooms/${room.id}`); load(); } }} className="p-2 text-paper/35 hover:text-red-300" data-testid={`rs-room-delete-${room.id}`}><Trash2 size={14} /></button>
                  </div>
                  <RoomInstr room={room} onSaved={load} />
                  <div className="grid grid-cols-2 gap-4 md:grid-cols-3 2xl:grid-cols-4">
                    {p.angles.filter((a) => a.room_id === room.id).map((a) => (
                      <AngleCard key={a.id} a={a} picked={picked.includes(a.id)} onPick={() => setPicked((x) => (x.includes(a.id) ? x.filter((i) => i !== a.id) : [...x, a.id]))} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Section>
          {picked.length > 0 && (
            <div className="glass sticky bottom-4 z-30 flex flex-wrap items-center gap-4 p-4" data-testid="rs-series-bar">
              <span className="text-sm">{picked.length} angle dipilih — render seri (tiap angle diproses terpisah, suasana proyek yang sama)</span>
              <select className={`${inputCls} w-auto py-2`} value={mode} onChange={(e) => setMode(e.target.value)} data-testid="rs-series-mode"><option value="draft">Draft</option><option value="final">Final</option></select>
              <button className={btn} onClick={series} data-testid="rs-series-render-btn">Render seri</button>
            </div>
          )}
        </div>
        <aside>
          <Section title="Memori proyek">
            <div className="space-y-4">
              {[["code", "Kode"], ["client", "Klien"], ["designer", "Desainer"]].map(([k, l]) => <Field key={k} p={p} k={k} label={l} onSave={save} />)}
              {MEMORY.map(([k, l]) => <Field key={k} p={p} k={k as string} label={l} onSave={save} area />)}
              <div>
                <Label>Preset suasana proyek</Label>
                <select className={inputCls} value={p.ambience_id || ""} onChange={(e) => save("ambience_id", e.target.value)} data-testid="rs-project-ambience-select">
                  <option value="">— Tanpa preset —</option>
                  {ambs.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div>
                <Label>Ambience master proyek</Label>
                {p.master ? (
                  <div data-testid="rs-project-master">
                    <img src={img(p.master.graded.thumb || p.master.raw.thumb)} alt="" className="w-full" />
                  </div>
                ) : <p className="text-xs text-paper/40">Setujui sebuah render lalu tekan “Jadikan Ambience Master” di Render Studio.</p>}
              </div>
            </div>
          </Section>
        </aside>
      </div>
    </RsShell>
  );
}

function RoomInstr({ room, onSaved }: { room: any; onSaved: () => void }) {
  const [v, setV] = useState(room.instructions || "");
  return (
    <textarea rows={1} className={`${inputCls} mb-4 text-xs`} placeholder="Instruksi khusus ruangan (menimpa default proyek)…" value={v} onChange={(e) => setV(e.target.value)}
      onBlur={async () => { if (v !== (room.instructions || "")) { await api.patch(`/rs/rooms/${room.id}`, { instructions: v }); onSaved(); } }} data-testid={`rs-room-instructions-${room.id}`} />
  );
}
