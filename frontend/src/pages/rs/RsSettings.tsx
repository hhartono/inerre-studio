import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { api, errMsg, img } from "@/lib/api";
import { STATUS_LABEL } from "@/lib/rs";
import { RsShell } from "@/components/rs/RsShell";
import { useMe } from "@/context/MeContext";
import { Label, btn, inputCls } from "@/components/editor/ui";

const MODEL_FIELDS: [string, string][] = [["draft_model", "Model Draft (cepat)"], ["final_model", "Model Final (detail tinggi)"], ["custom_model", "Model Custom"], ["vision_model", "Model analisis (vision)"]];

function Stat({ label, value, testid }: { label: string; value: React.ReactNode; testid: string }) {
  return <div className="border-t border-paper/10 pt-4"><p className="eyebrow text-[9px] text-paper/40">{label}</p><p className="display mt-2 text-3xl" data-testid={testid}>{value}</p></div>;
}

export function UsagePanel() {
  const [u, setU] = useState<any>(null);
  useEffect(() => {
    api.get("/rs/usage").then((r) => setU(r.data));
  }, []);
  if (!u) return null;
  return (
    <section data-testid="rs-usage-panel">
      <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
        <Stat label={`Permintaan AI ${u.month}`} value={u.requests} testid="rs-usage-requests" />
        <Stat label="Gagal" value={u.failed} testid="rs-usage-failed" />
        <Stat label={u.priced ? "Estimasi biaya" : "Biaya (tarif belum diatur)"} value={u.priced ? `$${u.total_cost.toFixed(2)}` : "—"} testid="rs-usage-cost" />
        <Stat label="Anggaran bulanan" value={u.budget ? `$${u.budget}` : "Tanpa batas"} testid="rs-usage-budget" />
      </div>
      <div className="mt-8 grid gap-8 md:grid-cols-3 text-xs text-paper/60">
        {[["by_kind", "Per jenis"], ["by_project", "Per proyek"], ["by_user", "Per pengguna"]].map(([k, l]) => (
          <div key={k}><Label>{l}</Label>{u[k].map((x: any) => <p key={String(x.key)} className="flex justify-between border-b border-paper/5 py-1"><span>{x.name || x.key || "Kalibrasi"}</span><span>{x.count} · {x.tokens.toLocaleString()} tok{u.priced ? ` · $${x.cost.toFixed(2)}` : ""}</span></p>)}</div>
        ))}
      </div>
    </section>
  );
}

export function RsSettings() {
  const { me } = useMe();
  const admin = me?.role === "admin";
  const [s, setS] = useState<any>(null);
  useEffect(() => {
    api.get("/rs/settings").then((r) => setS(r.data));
  }, []);
  if (!s) return <RsShell><p className="eyebrow animate-pulse text-paper/40">Memuat…</p></RsShell>;
  const save = async () => {
    try {
      const { key_configured, id, ...body } = s;
      setS({ ...(await api.put("/rs/settings", { ...body, price_in_per_m: +body.price_in_per_m, price_out_per_m: +body.price_out_per_m, monthly_budget_usd: +body.monthly_budget_usd })).data, key_configured });
      toast.success("Pengaturan disimpan");
    } catch (e) {
      toast.error(errMsg(e));
    }
  };
  const inp = (k: string, type = "text") => <input type={type} className={inputCls} value={s[k] ?? ""} disabled={!admin} onChange={(e) => setS({ ...s, [k]: e.target.value })} data-testid={`rs-setting-${k}`} />;
  return (
    <RsShell title="Pengaturan">
      <p className="mb-8 text-sm text-paper/55" data-testid="rs-key-status">Kunci OpenAI: {s.key_configured ? <span className="text-emerald-300">terpasang di server (tidak pernah dikirim ke browser)</span> : <span className="text-red-300">belum terpasang</span>}</p>
      <div className="grid max-w-4xl gap-5 sm:grid-cols-2">
        {MODEL_FIELDS.map(([k, l]) => <div key={k}><Label>{l}</Label>{inp(k)}</div>)}
        {[["draft_quality", "Kualitas Draft"], ["final_quality", "Kualitas Final"]].map(([k, l]) => (
          <div key={k}><Label>{l}</Label><select className={inputCls} value={s[k]} disabled={!admin} onChange={(e) => setS({ ...s, [k]: e.target.value })} data-testid={`rs-setting-${k}`}>{["low", "medium", "high", "auto"].map((q) => <option key={q}>{q}</option>)}</select></div>
        ))}
        <div><Label>Tarif input / 1 juta token (USD, untuk estimasi)</Label>{inp("price_in_per_m", "number")}</div>
        <div><Label>Tarif output / 1 juta token (USD)</Label>{inp("price_out_per_m", "number")}</div>
        <div><Label>Anggaran bulanan (USD, 0 = tanpa batas)</Label>{inp("monthly_budget_usd", "number")}</div>
        <div className="sm:col-span-2"><Label>Instruksi render dasar INERRE</Label><textarea rows={6} className={`${inputCls} text-xs`} value={s.base_instruction} disabled={!admin} onChange={(e) => setS({ ...s, base_instruction: e.target.value })} data-testid="rs-setting-base_instruction" /></div>
      </div>
      {admin ? <button className={`${btn} mt-6`} onClick={save} data-testid="rs-settings-save-btn">Simpan pengaturan</button> : <p className="mt-6 text-xs text-paper/40">Hanya admin yang bisa mengubah pengaturan.</p>}
      <p className="mt-4 max-w-2xl text-[11px] text-paper/35">Model terverifikasi di akun OpenAI Anda: gpt-image-2.6-flare (draft), gpt-image-2.6-sunburst (final). Jika render gagal, sistem tidak pernah berpindah ke model lain secara otomatis.</p>
      <div className="mt-16"><p className="eyebrow mb-6 text-brass">Pemakaian AI</p><UsagePanel /></div>
    </RsShell>
  );
}

export function RsDashboard() {
  const [recent, setRecent] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  useEffect(() => {
    api.get("/rs/history").then((r) => setRecent(r.data.slice(0, 8)));
    api.get("/rs/projects").then((r) => setProjects(r.data));
  }, []);
  return (
    <RsShell title="INERRE Render Studio">
      <div className="mb-12 flex flex-wrap gap-3"><Link to="/render/projects" className={btn} data-testid="rs-dash-projects-btn">Buka proyek</Link></div>
      <div className="mb-12 grid grid-cols-2 gap-6 md:grid-cols-4">
        <Stat label="Proyek" value={projects.length} testid="rs-dash-projects" />
        <Stat label="Render terakhir" value={recent.length ? STATUS_LABEL[recent[0].status] : "—"} testid="rs-dash-last" />
      </div>
      <p className="eyebrow mb-4 text-brass">Render terbaru</p>
      <div className="mb-16 grid grid-cols-2 gap-4 md:grid-cols-4">
        {recent.map((r) => (
          <Link key={r.id} to={`/render/studio/${r.angle_id}`} className="group">
            <div className="aspect-[3/2] bg-surface">{r.raw.thumb && <img src={img(r.graded.thumb || r.raw.thumb)} alt="" className="h-full w-full object-cover" />}</div>
            <p className="mt-2 truncate text-xs text-paper/65 group-hover:text-brass">{r.project_name} · {r.angle_name} · v{r.version_no}</p>
          </Link>
        ))}
        {!recent.length && <p className="text-sm text-paper/40">Belum ada render. Mulai dengan membuat proyek dan mengunggah screenshot SketchUp.</p>}
      </div>
      <p className="eyebrow mb-6 text-brass">Pemakaian bulan ini</p>
      <UsagePanel />
    </RsShell>
  );
}
