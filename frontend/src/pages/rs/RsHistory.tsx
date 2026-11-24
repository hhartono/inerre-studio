import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, img } from "@/lib/api";
import { APPROVAL_LABEL, STATUS_LABEL, fmtDate, type Render } from "@/lib/rs";
import { RsShell, Pill, approvalTone, statusTone } from "@/components/rs/RsShell";
import { btnGhost, inputCls } from "@/components/editor/ui";

export default function RsHistory() {
  const [rows, setRows] = useState<Render[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [pid, setPid] = useState("");
  const [appr, setAppr] = useState("");
  const [pick, setPick] = useState<string[]>([]);
  useEffect(() => {
    api.get("/rs/projects").then((r) => setProjects(r.data));
  }, []);
  useEffect(() => {
    api.get("/rs/history", { params: { project_id: pid, approval: appr } }).then((r) => setRows(r.data));
  }, [pid, appr]);
  const toggle = (id: string) => setPick((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p.slice(-1), id]));
  const cmp = rows.filter((r) => pick.includes(r.id));
  return (
    <RsShell title="Riwayat Render" aside={
      <div className="flex gap-2">
        <select className={`${inputCls} w-auto`} value={pid} onChange={(e) => setPid(e.target.value)} data-testid="rs-history-project"><option value="">Semua proyek</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        <select className={`${inputCls} w-auto`} value={appr} onChange={(e) => setAppr(e.target.value)} data-testid="rs-history-approval"><option value="">Semua status</option>{Object.entries(APPROVAL_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      </div>}>
      {cmp.length === 2 && (
        <div className="mb-10" data-testid="rs-history-compare">
          <div className="mb-3 flex items-center justify-between"><p className="eyebrow text-brass">Perbandingan 2 versi</p><button className={btnGhost} onClick={() => setPick([])}>Tutup</button></div>
          <div className="grid gap-3 md:grid-cols-2">{cmp.map((r) => <div key={r.id}><img src={img(r.graded.url || r.raw.url)} alt="" className="w-full" /><p className="mt-1 text-xs text-paper/55">{r.angle_name} · v{r.version_no} · {r.model}</p></div>)}</div>
        </div>
      )}
      <p className="mb-6 text-xs text-paper/40">Centang dua render untuk membandingkan.</p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-4 xl:grid-cols-5">
        {rows.map((r) => (
          <div key={r.id} data-testid={`rs-history-item-${r.id}`}>
            <div className="relative aspect-[3/2] bg-surface">
              {r.raw.thumb && <img src={img(r.graded.thumb || r.raw.thumb)} alt="" className="h-full w-full object-cover" />}
              {r.raw.thumb && <input type="checkbox" checked={pick.includes(r.id)} onChange={() => toggle(r.id)} className="absolute left-2 top-2" data-testid={`rs-history-pick-${r.id}`} />}
            </div>
            <Link to={`/render/studio/${r.angle_id}`} className="mt-2 block truncate text-xs text-paper/75 hover:text-brass">{r.project_name} · {r.room_name} · {r.angle_name}</Link>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <Pill tone={statusTone(r.status) as any}>v{r.version_no} {STATUS_LABEL[r.status]}</Pill>
              <Pill tone={approvalTone(r.approval) as any}>{APPROVAL_LABEL[r.approval]}</Pill>
            </div>
            <p className="mt-1 text-[10px] text-paper/35">{fmtDate(r.created_at)} · {r.created_by_name}</p>
          </div>
        ))}
      </div>
      {!rows.length && <p className="text-sm text-paper/40">Belum ada render.</p>}
    </RsShell>
  );
}
