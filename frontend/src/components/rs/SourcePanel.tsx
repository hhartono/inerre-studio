import { useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg, img } from "@/lib/api";
import { MAT_STATUS, REF_ROLES } from "@/lib/rs";
import { Pill } from "@/components/rs/RsShell";
import { Label, UploadButton, inputCls } from "@/components/editor/ui";

const sec = "border-b border-paper/10 p-4";

export function SourcePanel({ angle, materials, onSaved }: { angle: any; materials: any[]; onSaved: (a: any) => void }) {
  const [role, setRole] = useState("ambience");
  const [busy, setBusy] = useState("");
  const [instr, setInstr] = useState(angle.instructions || "");
  const [pick, setPick] = useState("");
  const patch = async (body: any) => {
    try {
      onSaved((await api.patch(`/rs/angles/${angle.id}`, body)).data);
    } catch (e) {
      toast.error(errMsg(e));
    }
  };
  const refs = angle.references.map(({ file_id, role, note }: any) => ({ file_id, role, note }));
  const addRefs = async (files: File[]) => {
    setBusy("ref");
    const added = [];
    for (const f of files) {
      const fd = new FormData();
      fd.append("file", f);
      fd.append("scope", angle.project_id);
      try {
        added.push({ file_id: (await api.post("/rs/files", fd)).data.id, role, note: "" });
      } catch (e) {
        toast.error(errMsg(e));
      }
    }
    await patch({ references: [...refs, ...added] });
    setBusy("");
  };
  const replace = async ([f]: File[]) => {
    setBusy("src");
    const fd = new FormData();
    fd.append("file", f);
    await api.post(`/rs/angles/${angle.id}/source`, fd).catch((e) => toast.error(errMsg(e)));
    onSaved((await api.get(`/rs/angles/${angle.id}`)).data);
    setBusy("");
  };
  const addMat = () => {
    const m = materials.find((x) => x.id === pick);
    if (!m) return;
    const ok = [...m.versions].reverse().find((v: any) => v.status === "locked" || v.status === "approved") || m.versions[m.versions.length - 1];
    patch({ materials: [...angle.materials, { material_id: m.id, version_no: ok.version_no, surface: "" }] });
    setPick("");
  };
  const mats = angle.materials as any[];

  return (
    <div className="text-sm" data-testid="rs-source-panel">
      <div className={sec}>
        <Label>Screenshot SketchUp (geometri utama)</Label>
        <img src={img(angle.source.thumb)} alt="" className="mb-3 w-full" data-testid="rs-source-thumb" />
        <UploadButton label="Ganti screenshot" busy={busy === "src" ? "Mengunggah…" : ""} onFiles={replace} testid="rs-replace-source" />
      </div>
      <div className={sec}>
        <Label>Referensi (wajib berperan)</Label>
        <div className="space-y-2">
          {angle.references.map((r: any, i: number) => (
            <div key={r.file_id + i} className="flex items-center gap-2" data-testid={`rs-ref-${i}`}>
              <img src={img(r.thumb)} alt="" className="h-10 w-14 shrink-0 object-cover" />
              <select className={`${inputCls} py-1.5 text-xs`} value={r.role} onChange={(e) => patch({ references: refs.map((x: any, j: number) => (j === i ? { ...x, role: e.target.value } : x)) })} data-testid={`rs-ref-role-${i}`}>
                {Object.entries(REF_ROLES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
              <button onClick={() => patch({ references: refs.filter((_: any, j: number) => j !== i) })} className="p-1 text-paper/40 hover:text-red-300" data-testid={`rs-ref-remove-${i}`}><X size={14} /></button>
            </div>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <select className={`${inputCls} py-2 text-xs`} value={role} onChange={(e) => setRole(e.target.value)} data-testid="rs-ref-new-role">
            {Object.entries(REF_ROLES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <UploadButton label="Tambah" multiple busy={busy === "ref" ? "…" : ""} onFiles={addRefs} testid="rs-ref-upload" />
        </div>
      </div>
      <div className={sec}>
        <Label>Material terpasang</Label>
        <div className="space-y-3">
          {mats.map((mr, i) => {
            const m = materials.find((x) => x.id === mr.material_id);
            const st = m?.versions.find((v: any) => v.version_no === mr.version_no)?.status;
            return (
              <div key={mr.material_id + i} data-testid={`rs-mat-${i}`}>
                <div className="flex items-center gap-2">
                  <span className="flex-1 truncate text-xs">{m ? `${m.code} ${m.name}` : "?"} · v{mr.version_no}</span>
                  <Pill tone={st === "locked" || st === "approved" ? "green" : "muted"}>{MAT_STATUS[st] || st}</Pill>
                  <button onClick={() => patch({ materials: mats.filter((_, j) => j !== i) })} className="p-1 text-paper/40 hover:text-red-300" data-testid={`rs-mat-remove-${i}`}><X size={13} /></button>
                </div>
                <input className={`${inputCls} mt-1.5 py-1.5 text-xs`} placeholder="Permukaan, mis. bedhead, kabinet dapur" defaultValue={mr.surface}
                  onBlur={(e) => e.target.value !== mr.surface && patch({ materials: mats.map((x, j) => (j === i ? { ...x, surface: e.target.value } : x)) })} data-testid={`rs-mat-surface-${i}`} />
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex gap-2">
          <select className={`${inputCls} py-2 text-xs`} value={pick} onChange={(e) => setPick(e.target.value)} data-testid="rs-mat-pick">
            <option value="">Pilih material…</option>
            {materials.map((m) => <option key={m.id} value={m.id}>{m.code} {m.name} ({MAT_STATUS[m.status]})</option>)}
          </select>
          <button onClick={addMat} disabled={!pick} className="eyebrow bg-brass px-3 text-[9.5px] text-ink disabled:opacity-40" data-testid="rs-mat-add">Pasang</button>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-paper/35">Versi material dikunci saat dipasang. Proyek tetap memakai versi ini sampai Anda menggantinya.</p>
      </div>
      <div className={sec}>
        <Label>Instruksi scene / angle</Label>
        <textarea rows={4} className={`${inputCls} text-xs`} value={instr} onChange={(e) => setInstr(e.target.value)} onBlur={() => instr !== angle.instructions && patch({ instructions: instr })}
          placeholder="Menimpa instruksi ruangan & proyek untuk angle ini…" data-testid="rs-angle-instructions" />
      </div>
    </div>
  );
}
