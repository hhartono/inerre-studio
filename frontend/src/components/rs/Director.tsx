import { useEffect, useState } from "react";
import { Redo2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg } from "@/lib/api";
import { GRADE_GROUPS, type Adjust } from "@/lib/grade";
import { ACTIVE, download, type Render } from "@/lib/rs";
import { useMe } from "@/context/MeContext";
import { Label, btn, btnGhost, inputCls } from "@/components/editor/ui";

const sec = "border-b border-paper/10 p-4";

function Slider({ k, label, value, onChange, testid }: { k: string; label: string; value: number; onChange: (k: string, v: number) => void; testid: string }) {
  return (
    <label className="block py-1.5" onDoubleClick={() => onChange(k, 0)}>
      <span className="flex justify-between text-[11px] text-paper/60"><span>{label}</span><span className={value ? "text-brass" : ""}>{value > 0 ? `+${value}` : value}</span></span>
      <input type="range" min={-100} max={100} value={value} onChange={(e) => onChange(k, +e.target.value)} className="mt-1 w-full accent-[#c6b38b]" data-testid={testid} />
    </label>
  );
}

export function RenderTab({ angle, meta, active, onStart }: { angle: any; meta: any; active: boolean; onStart: (r: Render) => void }) {
  const [mode, setMode] = useState("draft");
  const [prot, setProt] = useState<Record<string, boolean>>(angle.protection || {});
  const [ctrl, setCtrl] = useState<Record<string, any>>(angle.controls || {});
  const [extra, setExtra] = useState("");
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try {
      await api.patch(`/rs/angles/${angle.id}`, { protection: prot, controls: ctrl });
      onStart((await api.post(`/rs/angles/${angle.id}/render`, { mode, protection: prot, controls: ctrl, extra })).data);
      toast.success("Render dimulai — biasanya 20–90 detik");
    } catch (e) {
      toast.error(errMsg(e));
    }
    setBusy(false);
  };
  return (
    <div data-testid="rs-render-tab">
      <div className={sec}>
        <Label>Mode render</Label>
        <div className="grid grid-cols-3 gap-1.5">
          {[["draft", "Draft"], ["final", "Final"], ["custom", "Custom"]].map(([k, l]) => (
            <button key={k} onClick={() => setMode(k)} className={`eyebrow border py-2 text-[9.5px] ${mode === k ? "border-brass text-brass" : "border-paper/15 text-paper/55"}`} data-testid={`rs-mode-${k}`}>{l}</button>
          ))}
        </div>
      </div>
      <div className={sec}>
        <Label>Proteksi desain</Label>
        {Object.entries(meta.protection as Record<string, string>).map(([k, l]) => (
          <label key={k} className="flex items-center justify-between py-1 text-xs text-paper/75">
            {l}
            <input type="checkbox" checked={!!prot[k]} onChange={(e) => setProt({ ...prot, [k]: e.target.checked })} data-testid={`rs-protect-${k}`} />
          </label>
        ))}
        <p className="mt-2 text-[11px] leading-relaxed text-paper/35">AI generatif tidak bisa menjamin geometri 100% sama. Proteksi ini menjadi instruksi wajib yang diprioritaskan.</p>
      </div>
      <div className={sec}>
        <Label>Pencahayaan & karakter AI (perlu render ulang)</Label>
        {Object.entries(meta.ai_controls as Record<string, string>).map(([k, l]) => (
          <Slider key={k} k={k} label={l} value={ctrl[k] || 0} onChange={(kk, v) => setCtrl({ ...ctrl, [kk]: v })} testid={`rs-ai-${k}`} />
        ))}
        <select className={`${inputCls} mt-2 py-2 text-xs`} value={ctrl.light_direction || ""} onChange={(e) => setCtrl({ ...ctrl, light_direction: e.target.value })} data-testid="rs-light-direction">
          <option value="">Arah cahaya: sesuai desain</option>
          {["left", "right", "front", "back", "top"].map((d) => <option key={d} value={d}>Dari {d}</option>)}
        </select>
      </div>
      <div className={sec}>
        <Label>Instruksi tambahan</Label>
        <textarea rows={3} className={`${inputCls} text-xs`} value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="Opsional…" data-testid="rs-extra-instructions" />
        <button className={`${btn} mt-4 w-full`} onClick={go} disabled={busy || active} data-testid="rs-render-btn">{active ? "Sedang merender…" : busy ? "Mengirim…" : "Render"}</button>
        <p className="mt-2 text-[11px] text-paper/35">Memakai kredit OpenAI. Hanya dijalankan saat tombol ini ditekan.</p>
      </div>
    </div>
  );
}

export function GradeTab({ render, adjust, setAdjust, onSaved }: { render: Render | null; adjust: Adjust; setAdjust: (a: Adjust) => void; onSaved: (r: Render) => void }) {
  const [hist, setHist] = useState<{ past: Adjust[]; future: Adjust[] }>({ past: [], future: [] });
  const [presets, setPresets] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api.get("/rs/grade-presets").then((r) => setPresets(r.data));
  }, []);
  useEffect(() => {
    setHist({ past: [], future: [] });
  }, [render?.id]);
  const commit = (a: Adjust) => {
    setHist((h) => ({ past: [...h.past.slice(-50), adjust], future: [] }));
    setAdjust(a);
  };
  const undo = () => hist.past.length && (setHist({ past: hist.past.slice(0, -1), future: [adjust, ...hist.future] }), setAdjust(hist.past[hist.past.length - 1]));
  const redo = () => hist.future.length && (setHist({ past: [...hist.past, adjust], future: hist.future.slice(1) }), setAdjust(hist.future[0]));
  const save = async () => {
    setBusy(true);
    try {
      onSaved((await api.post(`/rs/renders/${render!.id}/grade`, { adjust })).data);
      toast.success("Hasil warna disimpan (resolusi penuh). Render asli tetap utuh.");
    } catch (e) {
      toast.error(errMsg(e));
    }
    setBusy(false);
  };
  const savePreset = async () => {
    const name = window.prompt("Nama preset warna");
    if (!name) return;
    const r = await api.post("/rs/grade-presets", { name, values: adjust });
    setPresets([...presets, r.data]);
  };
  if (!render?.raw.url) return <p className="p-4 text-xs text-paper/40">Pilih render yang sudah selesai untuk mengatur warna.</p>;
  const dirty = JSON.stringify(adjust) !== JSON.stringify(render.adjust || {});
  return (
    <div data-testid="rs-grade-tab">
      <div className={`${sec} flex items-center gap-2`}>
        <span className="eyebrow flex-1 text-[9px] text-emerald-300/80">Live — tanpa kredit AI</span>
        <button onClick={undo} disabled={!hist.past.length} className="p-1.5 text-paper/60 disabled:opacity-30" title="Undo" data-testid="rs-grade-undo"><Undo2 size={15} /></button>
        <button onClick={redo} disabled={!hist.future.length} className="p-1.5 text-paper/60 disabled:opacity-30" title="Redo" data-testid="rs-grade-redo"><Redo2 size={15} /></button>
        <button onClick={() => commit({})} className="eyebrow text-[9px] text-paper/50 hover:text-brass" data-testid="rs-grade-reset">Reset</button>
      </div>
      {GRADE_GROUPS.map((g) => (
        <div key={g.title} className={sec}>
          <Label>{g.title}</Label>
          {g.keys.map(([k, l]) => <Slider key={k} k={k} label={l} value={adjust[k] || 0} onChange={(kk, v) => commit({ ...adjust, [kk]: v })} testid={`rs-grade-${k}`} />)}
        </div>
      ))}
      <div className={`${sec} space-y-3`}>
        <div className="flex gap-2">
          <select className={`${inputCls} py-2 text-xs`} value="" onChange={(e) => { const p = presets.find((x) => x.id === e.target.value); if (p) commit(p.values); }} data-testid="rs-grade-preset-select">
            <option value="">Pakai preset warna…</option>
            {presets.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button className={btnGhost} onClick={savePreset} data-testid="rs-grade-preset-save">Simpan</button>
        </div>
        <button className={`${btn} w-full`} onClick={save} disabled={busy || !dirty} data-testid="rs-grade-save-btn">{busy ? "Memproses resolusi penuh…" : "Simpan hasil warna"}</button>
        <div className="grid grid-cols-2 gap-2">
          {[["png", "PNG"], ["jpeg", "JPEG"]].map(([f, l]) => (
            <button key={f} className={btnGhost} onClick={() => download(`/rs/renders/${render.id}/download?variant=graded&fmt=${f}`, `INERRE-v${render.version_no}.${f === "jpeg" ? "jpg" : "png"}`)} data-testid={`rs-download-${f}`}>Unduh {l}</button>
          ))}
        </div>
        <button className="eyebrow text-[9px] text-paper/45 hover:text-brass" onClick={() => download(`/rs/renders/${render.id}/download?variant=raw&fmt=png`, `INERRE-v${render.version_no}-raw.png`)} data-testid="rs-download-raw">Unduh render AI asli (tanpa warna)</button>
        {dirty && <p className="text-[11px] text-paper/40">Unduhan memakai hasil warna yang terakhir disimpan.</p>}
      </div>
    </div>
  );
}

export function ReviewTab({ render, angle, regionMode, setRegionMode, region, onChange }: { render: Render | null; angle: any; regionMode: boolean; setRegionMode: (v: boolean) => void; region: any; onChange: (r: Render) => void }) {
  const { me } = useMe();
  const [fb, setFb] = useState("");
  const [rev, setRev] = useState("");
  const [busy, setBusy] = useState(false);
  const [prompt, setPrompt] = useState("");
  if (!render) return <p className="p-4 text-xs text-paper/40">Belum ada render.</p>;
  const done = render.status === "completed";
  const review = async (approval?: string) => {
    try {
      onChange((await api.patch(`/rs/renders/${render.id}/review`, { approval, feedback: fb })).data);
      setFb("");
    } catch (e) {
      toast.error(errMsg(e));
    }
  };
  const revise = async () => {
    setBusy(true);
    try {
      onChange((await api.post(`/rs/renders/${render.id}/revise`, { instruction: rev, region: regionMode ? region : null })).data);
      setRev("");
      setRegionMode(false);
      toast.success("Revisi dimulai — versi baru akan dibuat, versi lama tetap aman");
    } catch (e) {
      toast.error(errMsg(e));
    }
    setBusy(false);
  };
  const master = async (scope: string) => {
    try {
      await api.post(`/rs/renders/${render.id}/master`, { scope, room_ids: [angle.room_id] });
      toast.success(scope === "project" ? "Dijadikan Ambience Master proyek" : "Dijadikan Ambience Master ruangan ini");
    } catch (e) {
      toast.error(errMsg(e));
    }
  };
  return (
    <div data-testid="rs-review-tab">
      <div className={sec}>
        <Label>Penilaian</Label>
        <div className="grid grid-cols-2 gap-2">
          <button className={`${btnGhost} ${render.approval === "approved" ? "!border-emerald-400 !text-emerald-300" : ""}`} disabled={!done} onClick={() => review("approved")} data-testid="rs-approve-btn">Setujui</button>
          <button className={`${btnGhost} ${render.approval === "rejected" ? "!border-red-400 !text-red-300" : ""}`} disabled={!done} onClick={() => review("rejected")} data-testid="rs-reject-btn">Tolak</button>
        </div>
        <textarea rows={2} className={`${inputCls} mt-3 text-xs`} value={fb} onChange={(e) => setFb(e.target.value)} placeholder="Catatan / feedback…" data-testid="rs-feedback-input" />
        <button className="eyebrow mt-2 text-[9px] text-paper/50 hover:text-brass" disabled={!fb.trim()} onClick={() => review()} data-testid="rs-feedback-save">Simpan catatan</button>
        {render.feedback.map((f, i) => <p key={i} className="mt-2 border-l border-paper/15 pl-2 text-[11px] text-paper/55">{f.text} <span className="text-paper/30">— {f.by}</span></p>)}
        {render.approval === "approved" && (
          <div className="mt-4 grid gap-2">
            <button className={btnGhost} onClick={() => master("project")} data-testid="rs-master-project-btn">Jadikan Ambience Master proyek</button>
            <button className={btnGhost} onClick={() => master("rooms")} data-testid="rs-master-room-btn">Master untuk ruangan ini saja</button>
          </div>
        )}
      </div>
      <div className={sec}>
        <Label>Revisi AI (versi baru)</Label>
        <textarea rows={3} className={`${inputCls} text-xs`} value={rev} onChange={(e) => setRev(e.target.value)} placeholder="Mis. bedhead harus cat duco, bukan kain. Pertahankan semuanya." data-testid="rs-revise-input" />
        <label className="mt-2 flex items-center gap-2 text-xs text-paper/70">
          <input type="checkbox" checked={regionMode} onChange={(e) => setRegionMode(e.target.checked)} data-testid="rs-region-toggle" /> Edit area terpilih saja (tarik kotak di gambar)
        </label>
        <button className={`${btn} mt-3 w-full`} disabled={!done || busy || !rev.trim() || (regionMode && !region) || ACTIVE.includes(render.status)} onClick={revise} data-testid="rs-revise-btn">Terapkan revisi AI</button>
        <p className="mt-2 text-[11px] text-paper/35">Untuk koreksi warna (kurang kuning, lebih hangat) pakai tab Warna — tanpa kredit AI.</p>
      </div>
      <div className={`${sec} space-y-1 text-[11px] text-paper/50`} data-testid="rs-render-details">
        <p>Model: <span className="text-paper/75">{render.model}</span> · {render.quality} · {render.size}</p>
        {render.ambience && <p>Suasana: {render.ambience.name} v{render.ambience.version_no}</p>}
        {render.master_render_id && <p>Memakai Ambience Master</p>}
        {render.materials.map((m) => <p key={m.material_id}>{m.code} v{m.version_no} ({m.status})</p>)}
        {render.revision && <p>Revisi: “{render.revision}”{render.region ? " (area)" : ""}</p>}
        {render.usage?.total_tokens ? <p>Token: {render.usage.total_tokens.toLocaleString()} · estimasi ${render.cost_est.toFixed(3)}</p> : null}
        {me?.role === "admin" && (
          <button className="eyebrow pt-2 text-[9px] text-brass" onClick={async () => setPrompt(prompt ? "" : (await api.get(`/rs/renders/${render.id}`)).data.prompt)} data-testid="rs-show-prompt">{prompt ? "Tutup prompt" : "Lihat prompt (debug)"}</button>
        )}
        {prompt && <pre className="max-h-80 overflow-auto whitespace-pre-wrap bg-surface p-2 text-[10px] text-paper/70" data-testid="rs-prompt-text">{prompt}</pre>}
      </div>
    </div>
  );
}
