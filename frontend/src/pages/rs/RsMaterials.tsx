import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { api, errMsg, img } from "@/lib/api";
import { MAT_STATUS } from "@/lib/rs";
import { RsShell, Pill } from "@/components/rs/RsShell";
import { useMe } from "@/context/MeContext";
import { btn, btnGhost, inputCls } from "@/components/editor/ui";

const tone = (s: string) => (s === "locked" || s === "approved" ? "green" : s === "testing" ? "brass" : "muted");

export default function RsMaterials() {
  const { me } = useMe();
  const [rows, setRows] = useState<any[]>([]);
  const [cats, setCats] = useState<string[]>([]);
  const [f, setF] = useState({ code: "", name: "", category: "", brand: "" });
  const [cat, setCat] = useState("");
  const [json, setJson] = useState("");
  const load = () => api.get("/rs/materials").then((r) => setRows(r.data));
  useEffect(() => {
    load();
    api.get("/rs/meta").then((r) => setCats(r.data.categories));
  }, []);
  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post("/rs/materials", f);
      setF({ code: "", name: "", category: "", brand: "" });
      load();
    } catch (err) {
      toast.error(errMsg(err));
    }
  };
  const doImport = async () => {
    try {
      const items = JSON.parse(json);
      const r = await api.post("/rs/materials/import", Array.isArray(items) ? items : [items]);
      toast.success(`${r.data.created} dibuat, ${r.data.updated} diperbarui${r.data.skipped.length ? `, ${r.data.skipped.length} dilewati` : ""}`);
      r.data.skipped.forEach((s: string) => toast.warning(s));
      setJson("");
      load();
    } catch (err: any) {
      toast.error(err instanceof SyntaxError ? "JSON tidak valid" : errMsg(err));
    }
  };
  const shown = rows.filter((m) => !cat || m.category === cat);
  return (
    <RsShell title="Material Library" aside={<select className={`${inputCls} w-auto`} value={cat} onChange={(e) => setCat(e.target.value)} data-testid="rs-mat-filter"><option value="">Semua kategori</option>{cats.map((c) => <option key={c}>{c}</option>)}</select>}>
      <form onSubmit={create} className="mb-10 grid max-w-4xl gap-3 sm:grid-cols-5" data-testid="rs-mat-create-form">
        <input className={inputCls} placeholder="MAT-011" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} data-testid="rs-mat-code-input" />
        <input className={`${inputCls} sm:col-span-2`} placeholder="Nama material" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} data-testid="rs-mat-name-input" />
        <select className={inputCls} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} data-testid="rs-mat-category-select"><option value="">Kategori…</option>{cats.map((c) => <option key={c}>{c}</option>)}</select>
        <button className={btn} disabled={!f.code || !f.name || !f.category} data-testid="rs-mat-create-btn">Tambah</button>
      </form>
      <div className="grid gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
        {shown.map((m) => (
          <Link key={m.id} to={`/render/materials/${m.id}`} className="group block" data-testid={`rs-material-card-${m.code}`}>
            <div className="aspect-[4/3] bg-surface">{m.preview.thumb ? <img src={img(m.preview.thumb)} alt="" className="h-full w-full object-cover" /> : <div className="eyebrow flex h-full items-center justify-center text-[9px] text-paper/25">Belum ada referensi</div>}</div>
            <div className="mt-3 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="eyebrow text-[9px] text-paper/40">{m.code} · {m.category}</p>
                <p className="mt-1 truncate text-sm text-paper group-hover:text-brass">{m.name}</p>
              </div>
              <Pill tone={tone(m.status) as any} testid={`rs-material-status-${m.code}`}>{MAT_STATUS[m.status]}</Pill>
            </div>
          </Link>
        ))}
      </div>
      {me?.role === "admin" && (
        <section className="mt-16 max-w-3xl border-t border-paper/10 pt-8">
          <p className="eyebrow mb-3 text-brass">Impor data kalibrasi (JSON)</p>
          <p className="mb-3 text-xs text-paper/45">Array berisi code, name, category, brand, finish, base_color, grain_direction, texture_scale, roughness, reflection, instructions, negative. Hanya mengisi versi draft — tidak pernah otomatis disetujui. Gambar diunggah di halaman material.</p>
          <textarea rows={5} className={`${inputCls} font-mono text-xs`} value={json} onChange={(e) => setJson(e.target.value)} placeholder='[{"code":"MAT-001","name":"Autumn Oak Veneer","category":"Natural veneer","finish":"matte"}]' data-testid="rs-mat-import-input" />
          <button className={`${btnGhost} mt-3`} disabled={!json.trim()} onClick={doImport} data-testid="rs-mat-import-btn">Impor</button>
        </section>
      )}
    </RsShell>
  );
}
