import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api, errMsg, img } from "@/lib/api";
import { fmtDate } from "@/lib/rs";
import { RsShell, Pill } from "@/components/rs/RsShell";
import { useMe } from "@/context/MeContext";
import { InlineAdd, Label, UploadButton, btnGhost, inputCls } from "@/components/editor/ui";

const FIELDS: [string, string][] = [["description", "Deskripsi"], ["lighting", "Pencahayaan"], ["white_balance", "Target white balance"], ["exposure", "Eksposur"],
  ["contrast", "Kontras"], ["shadows", "Kelembutan bayangan"], ["natural_light", "Cahaya alami"], ["artificial_light", "Cahaya buatan"], ["palette", "Palet warna"], ["avoid", "Hindari"]];

function Preset({ a, admin, onChange }: { a: any; admin: boolean; onChange: () => void }) {
  const cur = a.versions.find((v: any) => v.version_no === a.current);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const dirty = Object.keys(draft).length > 0;
  const save = async (extra: any = {}) => {
    try {
      await api.patch(`/rs/ambiences/${a.id}`, { ...draft, ...extra });
      setDraft({});
      toast.success("Versi baru preset disimpan");
      onChange();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };
  const addRef = async ([f]: File[]) => {
    const fd = new FormData();
    fd.append("file", f);
    fd.append("scope", "ambience");
    const r = await api.post("/rs/files", fd);
    save({ reference_file_ids: [...cur.reference_file_ids, r.data.id] });
  };
  return (
    <details className="group border-t border-paper/10 py-5" data-testid={`rs-amb-${a.id}`}>
      <summary className="flex cursor-pointer list-none items-center gap-4">
        <div className="flex -space-x-2">{cur.refs.slice(0, 3).map((r: any) => <img key={r.id} src={img(r.thumb)} alt="" className="h-10 w-14 object-cover ring-1 ring-ink" />)}</div>
        <span className="display flex-1 text-2xl group-open:text-brass">{a.name}</span>
        <Pill>v{a.current}</Pill>
      </summary>
      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_300px]">
        <div className="grid gap-4 sm:grid-cols-2">
          {FIELDS.map(([k, l]) => (
            <div key={k + a.current}><Label>{l}</Label><textarea rows={2} className={`${inputCls} text-xs`} defaultValue={cur[k]} disabled={!admin} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} data-testid={`rs-amb-field-${k}`} /></div>
          ))}
          {admin && <button className={`${btnGhost} sm:col-span-2`} disabled={!dirty} onClick={() => save()} data-testid="rs-amb-save-btn">Simpan sebagai versi baru</button>}
        </div>
        <div>
          <Label>Referensi visual</Label>
          <div className="grid grid-cols-2 gap-2">{cur.refs.map((r: any) => <img key={r.id} src={img(r.thumb)} alt="" className="aspect-[3/2] w-full object-cover" />)}</div>
          {admin && <div className="mt-3"><UploadButton label="Tambah referensi" onFiles={addRef} testid={`rs-amb-ref-upload-${a.id}`} /></div>}
          <Label>Riwayat versi</Label>
          <ul className="space-y-1 text-xs text-paper/55">
            {[...a.versions].reverse().map((v: any) => (
              <li key={v.version_no} className="flex items-center gap-2">
                <span className="flex-1">v{v.version_no} · {v.created_by} · {fmtDate(v.created_at)}</span>
                {admin && v.version_no !== a.current && <button className="text-brass" onClick={async () => { await api.post(`/rs/ambiences/${a.id}/current`, { version_no: v.version_no }); onChange(); }} data-testid={`rs-amb-rollback-${v.version_no}`}>Pakai</button>}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </details>
  );
}

export default function RsAmbiences() {
  const { me } = useMe();
  const admin = me?.role === "admin";
  const [rows, setRows] = useState<any[]>([]);
  const load = () => api.get("/rs/ambiences").then((r) => setRows(r.data));
  useEffect(() => {
    load();
  }, []);
  return (
    <RsShell title="Ambience Library" aside={admin && <InlineAdd label="Preset baru" placeholder="Nama preset" testid="rs-amb-add" onAdd={async (name) => { await api.post("/rs/ambiences", { name }).catch((e) => toast.error(errMsg(e))); load(); }} />}>
      <p className="mb-8 max-w-2xl text-sm text-paper/50">Preset suasana dipakai saat render bila proyek/ruangan memilihnya. Ambience Master proyek (render yang disetujui) selalu didahulukan. {admin ? "" : "Hanya admin yang bisa mengubah preset."}</p>
      {rows.map((a) => <Preset key={a.id} a={a} admin={admin} onChange={load} />)}
    </RsShell>
  );
}
