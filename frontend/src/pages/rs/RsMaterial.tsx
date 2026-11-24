import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { X } from "lucide-react";
import { api, errMsg, img } from "@/lib/api";
import { ACTIVE, MAT_STATUS, STATUS_LABEL } from "@/lib/rs";
import { RsShell, Pill } from "@/components/rs/RsShell";
import { useMe } from "@/context/MeContext";
import { Label, UploadButton, btn, btnGhost, inputCls } from "@/components/editor/ui";

const SPEC: [string, string][] = [["finish", "Jenis finishing"], ["base_color", "Karakter warna dasar"], ["grain_direction", "Arah serat"], ["texture_scale", "Skala tekstur"],
  ["roughness", "Kekasaran permukaan"], ["reflection", "Karakter pantulan"], ["instructions", "Instruksi render"], ["negative", "Instruksi negatif (hindari)"]];
const QUICK = ["Terlalu kuning", "Terlalu merah", "Terlalu gelap", "Arah serat salah", "Serat terlalu besar", "Tekstur terlalu kuat", "Kurang matte", "Terlihat seperti kain, bukan kayu cat", "Terlihat seperti batu asli, bukan HPL"];

function Panel({ title, im, slot, editable, onUpload, testid }: any) {
  return (
    <div data-testid={testid}>
      <Label>{title}</Label>
      <div className="aspect-square bg-surface">{im?.url ? <img src={img(im.url)} alt="" className="h-full w-full object-cover" /> : <div className="eyebrow flex h-full items-center justify-center text-[9px] text-paper/25">Kosong</div>}</div>
      {editable && slot && <div className="mt-2"><UploadButton label={im?.url ? "Ganti" : "Unggah"} onFiles={([f]: File[]) => onUpload(slot, f)} testid={`${testid}-upload`} /></div>}
    </div>
  );
}

export default function RsMaterial() {
  const { mid } = useParams();
  const { me } = useMe();
  const isAdmin = me?.role === "admin";
  const [m, setM] = useState<any>(null);
  const [vno, setVno] = useState<number | null>(null);
  const [corr, setCorr] = useState("");
  const [testId, setTestId] = useState<string | null>(null);
  const load = useCallback(() => api.get(`/rs/materials/${mid}`).then((r) => setM(r.data)), [mid]);
  useEffect(() => {
    load();
  }, [load]);
  const running = m?.tests.some((t: any) => ACTIVE.includes(t.status));
  useEffect(() => {
    if (!running) {
      return;
    }
    const t = setInterval(load, 3000);
    return () => {
      clearInterval(t);
    };
  }, [running, load]);
  if (!m) return <RsShell><p className="eyebrow animate-pulse text-paper/40">Memuat…</p></RsShell>;
  const v = m.versions.find((x: any) => x.version_no === vno) || m.versions[m.versions.length - 1];
  const editable = v.status === "draft";
  const tests = m.tests.filter((t: any) => t.material_version_id === v.id);
  const test = tests.find((t: any) => t.id === testId) || tests[0];
  const act = async (fn: () => Promise<any>, ok?: string) => {
    try {
      await fn();
      if (ok) toast.success(ok);
      load();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };
  const upload = (slot: string, f: File) => {
    const fd = new FormData();
    fd.append("file", f);
    act(() => api.post(`/rs/material-versions/${v.id}/images/${slot}`, fd));
  };
  const patch = (k: string, val: string) => val !== (v[k] || "") && act(() => api.patch(`/rs/material-versions/${v.id}`, { [k]: val }));

  return (
    <RsShell title={m.name} aside={<div className="flex items-center gap-3"><span className="eyebrow text-[10px] text-paper/45">{m.code} · {m.category}</span><Pill tone={v.status === "draft" ? "muted" : "green"} testid="rs-matv-status">v{v.version_no} {MAT_STATUS[v.status]}</Pill></div>}>
      <Link to="/render/materials" className="eyebrow mb-6 inline-block text-[9px] text-paper/45 hover:text-brass">← Material Library</Link>
      <div className="mb-6 flex flex-wrap items-center gap-2" data-testid="rs-matv-tabs">
        {m.versions.map((x: any) => (
          <button key={x.id} onClick={() => setVno(x.version_no)} className={`eyebrow border px-3 py-1.5 text-[9.5px] ${x.id === v.id ? "border-brass text-brass" : "border-paper/15 text-paper/50"}`} data-testid={`rs-matv-tab-${x.version_no}`}>v{x.version_no} · {MAT_STATUS[x.status]}</button>
        ))}
        {isAdmin && <button className="eyebrow ml-2 text-[9.5px] text-paper/50 hover:text-brass" onClick={() => act(() => api.post(`/rs/materials/${m.id}/versions`), "Versi baru dibuat")} data-testid="rs-matv-new-btn">+ Buat versi baru</button>}
      </div>
      {!editable && <p className="mb-6 max-w-2xl border-l-2 border-emerald-400/50 pl-3 text-xs text-paper/60" data-testid="rs-matv-locked-note">Versi ini {MAT_STATUS[v.status].toLowerCase()} oleh {v.locked_by || v.approved_by}. Tidak ada feedback proyek, suasana, atau revisi AI yang bisa mengubahnya. Perubahan hanya lewat versi baru oleh admin.</p>}

      <div className="grid gap-5 md:grid-cols-3">
        <Panel title="Tekstur SketchUp asli" im={v.sketchup_img} slot="sketchup" editable={editable} onUpload={upload} testid="rs-cal-sketchup" />
        <Panel title="Material asli / tampilan disetujui" im={v.approved_img?.url ? v.approved_img : v.photo_img} slot="photo" editable={editable} onUpload={upload} testid="rs-cal-photo" />
        <div data-testid="rs-cal-test">
          <Label>Hasil tes AI {test ? `· ${STATUS_LABEL[test.status]}` : ""}</Label>
          <div className="relative aspect-square bg-surface">
            {test?.raw.url ? <img src={img(test.raw.url)} alt="" className="h-full w-full object-cover" /> : <div className="eyebrow flex h-full items-center justify-center text-[9px] text-paper/25">{test && ACTIVE.includes(test.status) ? <span className="animate-pulse text-brass">Merender…</span> : "Belum ada tes"}</div>}
          </div>
          {test?.status === "failed" && <p className="mt-2 text-xs text-red-300" data-testid="rs-cal-error">{test.error}</p>}
          {tests.length > 1 && (
            <div className="mt-2 flex gap-1.5 overflow-x-auto">{tests.map((t: any) => <button key={t.id} onClick={() => setTestId(t.id)} className={`h-10 w-10 shrink-0 bg-surface ${t.id === test?.id ? "outline outline-1 outline-brass" : "opacity-60"}`}>{t.raw.thumb && <img src={img(t.raw.thumb)} alt="" className="h-full w-full object-cover" />}</button>)}</div>
          )}
        </div>
      </div>
      {v.photo_img?.url && v.approved_img?.url && <p className="mt-2 text-[11px] text-paper/40">Panel tengah menampilkan tampilan yang disetujui; foto material asli tetap tersimpan.</p>}

      {editable && (
        <div className="mt-6 flex flex-wrap gap-3" data-testid="rs-cal-actions">
          <button className={btn} disabled={running} onClick={() => act(() => api.post(`/rs/material-versions/${v.id}/test`), "Tes kalibrasi dimulai")} data-testid="rs-cal-generate-btn">{running ? "Merender…" : "Buat tes kalibrasi"}</button>
          {test?.raw.url && <button className={btnGhost} onClick={() => act(() => api.post(`/rs/material-versions/${v.id}/use-test`, { test_id: test.id }), "Dipakai sebagai tampilan disetujui")} data-testid="rs-cal-use-test-btn">Pakai hasil ini</button>}
          {isAdmin && <button className={btnGhost} onClick={() => act(() => api.post(`/rs/material-versions/${v.id}/approve`), "Material disetujui")} data-testid="rs-cal-approve-btn">Setujui material</button>}
        </div>
      )}
      {v.status === "approved" && isAdmin && <button className={`${btn} mt-6`} onClick={() => act(() => api.post(`/rs/material-versions/${v.id}/lock`), "Versi dikunci")} data-testid="rs-cal-lock-btn">Kunci versi material</button>}

      <div className="mt-12 grid gap-12 lg:grid-cols-2">
        <section>
          <p className="eyebrow mb-4 text-brass">Spesifikasi kalibrasi</p>
          <div className="space-y-4">
            {[["brand", "Brand"], ["manufacturer_code", "Kode pabrikan"]].map(([k, l]) => (
              <div key={k}><Label>{l}</Label><input className={inputCls} defaultValue={m[k]} disabled={!editable && !isAdmin} onBlur={(e) => e.target.value !== (m[k] || "") && act(() => api.patch(`/rs/materials/${m.id}`, { [k]: e.target.value }))} data-testid={`rs-mat-meta-${k}`} /></div>
            ))}
            {SPEC.map(([k, l]) => (
              <div key={k + v.id}><Label>{l}</Label><textarea rows={k.includes("instr") || k === "negative" ? 3 : 1} className={inputCls} defaultValue={v[k]} disabled={!editable} onBlur={(e) => patch(k, e.target.value)} data-testid={`rs-matv-${k}`} /></div>
            ))}
            {editable && <div><Label>Foto referensi tambahan</Label><div className="flex flex-wrap gap-2">{v.extra_imgs.map((x: any) => <img key={x.id} src={img(x.thumb)} alt="" className="h-16 w-16 object-cover" />)}<UploadButton label="Tambah" onFiles={([f]) => upload("extra", f)} testid="rs-matv-extra-upload" /></div></div>}
          </div>
        </section>
        <section>
          <p className="eyebrow mb-4 text-brass">Koreksi (aturan khusus material ini)</p>
          {editable && (
            <>
              <div className="mb-3 flex flex-wrap gap-1.5">{QUICK.map((q) => <button key={q} onClick={() => setCorr(q)} className="border border-paper/15 px-2 py-1 text-[11px] text-paper/60 hover:border-brass hover:text-brass">{q}</button>)}</div>
              <textarea rows={2} className={inputCls} value={corr} onChange={(e) => setCorr(e.target.value)} placeholder="Tulis koreksi untuk tes berikutnya…" data-testid="rs-cal-correction-input" />
              <div className="mt-2 flex gap-3">
                <button className={btnGhost} disabled={!corr.trim()} onClick={() => act(() => api.post(`/rs/material-versions/${v.id}/corrections`, { text: corr, test_id: test?.id }), "Tes ditolak, koreksi disimpan").then(() => setCorr(""))} data-testid="rs-cal-reject-btn">Tolak & revisi</button>
              </div>
            </>
          )}
          <ul className="mt-5 space-y-2" data-testid="rs-cal-corrections">
            {v.corrections.map((c: any) => (
              <li key={c.id} className="flex items-start gap-2 border-l border-paper/15 pl-3 text-sm text-paper/75">
                <span className="flex-1">{c.text} <span className="text-[11px] text-paper/35">— {c.by}</span></span>
                {editable && <button onClick={() => act(() => api.delete(`/rs/material-versions/${v.id}/corrections/${c.id}`))} className="text-paper/35 hover:text-red-300"><X size={13} /></button>}
              </li>
            ))}
            {!v.corrections.length && <li className="text-xs text-paper/40">Belum ada koreksi.</li>}
          </ul>
        </section>
      </div>
    </RsShell>
  );
}
