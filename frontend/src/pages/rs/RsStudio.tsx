import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, img } from "@/lib/api";
import { ACTIVE, STATUS_LABEL, fmtDate, type Render } from "@/lib/rs";
import type { Adjust } from "@/lib/grade";
import { RsShell, Pill, approvalTone, statusTone } from "@/components/rs/RsShell";
import { Canvas, type Region, type View } from "@/components/rs/Canvas";
import { SourcePanel } from "@/components/rs/SourcePanel";
import { GradeTab, RenderTab, ReviewTab } from "@/components/rs/Director";
import { inputCls } from "@/components/editor/ui";

const VIEWS: [View, string][] = [["render", "Render"], ["source", "SketchUp"], ["compare", "Slider"], ["side", "Berdampingan"]];
const TABS = [["render", "Render"], ["grade", "Warna"], ["review", "Review & Revisi"]];

function Picker() {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => {
    api.get("/rs/history").then((r) => setRows(r.data.slice(0, 12)));
  }, []);
  return (
    <RsShell title="Render Studio">
      <p className="mb-8 max-w-xl text-sm text-paper/55">Pilih angle kamera dari sebuah <Link to="/render/projects" className="text-brass underline">proyek</Link>, atau lanjutkan dari render terakhir:</p>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {rows.map((r) => (
          <Link key={r.id} to={`/render/studio/${r.angle_id}`} className="group" data-testid={`rs-recent-${r.id}`}>
            <div className="aspect-[3/2] bg-surface">{r.raw.thumb && <img src={img(r.graded.thumb || r.raw.thumb)} alt="" className="h-full w-full object-cover" />}</div>
            <p className="mt-2 truncate text-xs text-paper/70 group-hover:text-brass">{r.project_name} · {r.room_name} · {r.angle_name}</p>
          </Link>
        ))}
      </div>
    </RsShell>
  );
}

export default function RsStudio() {
  const { aid } = useParams();
  return aid ? <Workspace key={aid} aid={aid} /> : <Picker />;
}

function Workspace({ aid }: { aid: string }) {
  const [angle, setAngle] = useState<any>(null);
  const [renders, setRenders] = useState<Render[]>([]);
  const [meta, setMeta] = useState<any>(null);
  const [materials, setMaterials] = useState<any[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [view, setView] = useState<View>("render");
  const [base, setBase] = useState("source");
  const [adjust, setAdjust] = useState<Adjust>({});
  const [tab, setTab] = useState("render");
  const [regionMode, setRegionMode] = useState(false);
  const [region, setRegion] = useState<Region | null>(null);
  const loadRenders = useCallback(() => api.get(`/rs/angles/${aid}/renders`).then((r) => setRenders(r.data)), [aid]);
  useEffect(() => {
    api.get(`/rs/angles/${aid}`).then((r) => setAngle(r.data));
    api.get("/rs/meta").then((r) => setMeta(r.data));
    api.get("/rs/materials").then((r) => setMaterials(r.data));
    loadRenders();
  }, [aid, loadRenders]);
  const active = renders.some((r) => ACTIVE.includes(r.status));
  useEffect(() => {
    if (!active) {
      return;
    }
    const t = setInterval(loadRenders, 3000);
    return () => {
      clearInterval(t);
    };
  }, [active, loadRenders]);
  const cur = renders.find((r) => r.id === sel) || renders[0] || null;
  useEffect(() => {
    setAdjust(cur?.adjust || {});
  }, [cur?.id, cur?.adjust]);
  useEffect(() => {
    if (regionMode) setView("render");
  }, [regionMode]);
  const upsert = (r: Render) => {
    setRenders((rs) => [r, ...rs.filter((x) => x.id !== r.id)].sort((a, b) => b.version_no - a.version_no));
    setSel(r.id);
  };
  if (!angle || !meta) return <RsShell><p className="eyebrow animate-pulse text-paper/40">Memuat…</p></RsShell>;
  const baseRender = renders.find((r) => r.id === base);
  const baseUrl = base === "source" ? angle.source.url : baseRender?.graded.url || baseRender?.raw.url || angle.source.url;

  return (
    <RsShell bare>
      <div className="grid h-[calc(100vh-56px)] grid-cols-1 lg:grid-cols-[280px_1fr_330px]" data-testid="rs-workspace">
        <aside className="no-scrollbar order-2 overflow-y-auto border-r border-paper/10 lg:order-1">
          <div className="border-b border-paper/10 p-4">
            <Link to={`/render/projects/${angle.project_id}`} className="eyebrow text-[9px] text-paper/45 hover:text-brass" data-testid="rs-back-project">← {angle.project?.name}</Link>
            <h1 className="display mt-2 text-2xl">{angle.name}</h1>
            <p className="text-xs text-paper/45">{angle.room?.name}</p>
          </div>
          <SourcePanel angle={angle} materials={materials} onSaved={setAngle} />
        </aside>
        <section className="order-1 flex min-h-[60vh] flex-col lg:order-2 lg:min-h-0">
          <div className="flex flex-wrap items-center gap-2 border-b border-paper/10 px-4 py-2.5">
            {VIEWS.map(([v, l]) => (
              <button key={v} onClick={() => setView(v)} className={`eyebrow px-2.5 py-1.5 text-[9.5px] ${view === v ? "bg-paper/10 text-brass" : "text-paper/50 hover:text-paper"}`} data-testid={`rs-view-${v}`}>{l}</button>
            ))}
            {(view === "compare" || view === "side") && (
              <select className={`${inputCls} w-auto py-1 text-xs`} value={base} onChange={(e) => setBase(e.target.value)} data-testid="rs-compare-base">
                <option value="source">vs SketchUp</option>
                {renders.filter((r) => r.raw.url && r.id !== cur?.id).map((r) => <option key={r.id} value={r.id}>vs Versi {r.version_no}</option>)}
              </select>
            )}
            <span className="flex-1" />
            {cur && <Pill tone={statusTone(cur.status) as any} testid="rs-current-status">{STATUS_LABEL[cur.status]}</Pill>}
            {cur && <Pill tone={approvalTone(cur.approval) as any} testid="rs-current-approval">{cur.approval === "approved" ? "Disetujui" : cur.approval === "rejected" ? "Ditolak" : "Belum dinilai"}</Pill>}
          </div>
          <div className="relative min-h-0 flex-1">
            <Canvas aspect={angle.aspect || 1.5} source={view === "source" ? angle.source.url : baseUrl} render={cur?.raw.url || null} adjust={adjust} view={view}
              regionMode={regionMode} region={region} onRegion={setRegion}
              overlay={cur && ACTIVE.includes(cur.status) ? <div className="glass eyebrow absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 animate-pulse px-5 py-3 text-[10px] text-brass" data-testid="rs-job-progress">{STATUS_LABEL[cur.status]}…</div> : null} />
            {cur?.status === "failed" && <div className="absolute inset-x-6 bottom-6 border border-red-400/40 bg-ink/90 p-3 text-xs text-red-200" data-testid="rs-job-error">Render gagal: {cur.error}</div>}
          </div>
          <div className="no-scrollbar flex gap-2 overflow-x-auto border-t border-paper/10 p-3" data-testid="rs-version-timeline">
            {renders.map((r) => (
              <button key={r.id} onClick={() => setSel(r.id)} className={`relative w-28 shrink-0 text-left ${cur?.id === r.id ? "outline outline-1 outline-brass" : "opacity-70 hover:opacity-100"}`} data-testid={`rs-version-${r.version_no}`}>
                <div className="aspect-[3/2] bg-surface">{r.raw.thumb && <img src={img(r.graded.thumb || r.raw.thumb)} alt="" className="h-full w-full object-cover" />}</div>
                <p className="mt-1 px-1 text-[10px] text-paper/60">v{r.version_no} · {r.kind === "render" ? r.mode : r.kind === "local" ? "area" : "revisi"} · {STATUS_LABEL[r.status]}</p>
                <p className="px-1 text-[9px] text-paper/35">{fmtDate(r.created_at)}</p>
              </button>
            ))}
            {!renders.length && <p className="p-2 text-xs text-paper/40">Belum ada versi. Atur di panel kanan lalu tekan Render.</p>}
          </div>
        </section>
        <aside className="no-scrollbar order-3 overflow-y-auto border-l border-paper/10">
          <div className="sticky top-0 z-10 grid grid-cols-3 border-b border-paper/10 bg-ink">
            {TABS.map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)} className={`eyebrow py-3 text-[9px] ${tab === k ? "text-brass" : "text-paper/45"}`} data-testid={`rs-tab-${k}`}>{l}</button>
            ))}
          </div>
          {tab === "render" && <RenderTab angle={angle} meta={meta} active={active} onStart={upsert} />}
          {tab === "grade" && <GradeTab render={cur?.status === "completed" ? cur : null} adjust={adjust} setAdjust={setAdjust} onSaved={upsert} />}
          {tab === "review" && <ReviewTab render={cur} angle={angle} regionMode={regionMode} setRegionMode={setRegionMode} region={region} onChange={upsert} />}
        </aside>
      </div>
    </RsShell>
  );
}
