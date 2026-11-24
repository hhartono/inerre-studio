import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { api, errMsg, img } from "@/lib/api";
import { RsShell } from "@/components/rs/RsShell";
import { btn, inputCls } from "@/components/editor/ui";

export default function RsProjects() {
  const [rows, setRows] = useState<any[] | null>(null);
  const [form, setForm] = useState({ name: "", code: "", client: "", designer: "" });
  const load = () => api.get("/rs/projects").then((r) => setRows(r.data));
  useEffect(() => {
    load();
  }, []);
  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post("/rs/projects", form);
      setForm({ name: "", code: "", client: "", designer: "" });
      load();
    } catch (err) {
      toast.error(errMsg(err));
    }
  };
  return (
    <RsShell title="Proyek Render">
      <form onSubmit={create} className="mb-12 grid max-w-4xl gap-3 sm:grid-cols-5" data-testid="rs-project-create-form">
        <input className={`${inputCls} sm:col-span-2`} placeholder="Nama proyek" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="rs-project-name-input" />
        <input className={inputCls} placeholder="Kode" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} data-testid="rs-project-code-input" />
        <input className={inputCls} placeholder="Klien" value={form.client} onChange={(e) => setForm({ ...form, client: e.target.value })} data-testid="rs-project-client-input" />
        <button className={btn} disabled={!form.name.trim()} data-testid="rs-project-create-btn">Buat proyek</button>
      </form>
      {rows && !rows.length && <p className="text-sm text-paper/45" data-testid="rs-projects-empty">Belum ada proyek render.</p>}
      <div className="grid gap-x-6 gap-y-10 sm:grid-cols-2 xl:grid-cols-3">
        {rows?.map((p) => (
          <Link key={p.id} to={`/render/projects/${p.id}`} className="group block" data-testid={`rs-project-card-${p.id}`}>
            <div className="aspect-[3/2] overflow-hidden bg-surface">
              {p.cover?.url ? <img src={img(p.cover.url)} alt="" className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.03]" /> : <div className="flex h-full items-center justify-center eyebrow text-paper/25">Belum ada render</div>}
            </div>
            <div className="mt-4 flex items-baseline justify-between gap-4">
              <h2 className="display text-2xl text-paper transition-colors group-hover:text-brass">{p.name}</h2>
              <span className="eyebrow text-[9px] text-paper/40">{p.code}</span>
            </div>
            <p className="mt-1 text-xs text-paper/45">{p.client || "—"} · {p.angles} angle · {p.renders} render</p>
          </Link>
        ))}
      </div>
    </RsShell>
  );
}
