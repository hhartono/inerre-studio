import { useState } from "react";
import { toast } from "sonner";
import { api, errMsg, pad } from "@/lib/api";
import { useEditor } from "@/components/editor/EditorContext";
import { Label, Section, btn, inputCls } from "@/components/editor/ui";

export function ProjectSettings() {
  const { data, reload, isAdmin } = useEditor();
  const p = data.project;
  const [name, setName] = useState(p.name);
  const [code, setCode] = useState(p.code);
  const [clients, setClients] = useState(p.client_emails.join("\n"));

  const save = async () => {
    const body: any = { name, code };
    if (isAdmin) body.client_emails = clients.split(/[\s,;]+/).filter(Boolean);
    try {
      await api.patch(`/projects/${p.id}`, body);
      toast.success("Proyek disimpan");
      reload();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  return (
    <div className="max-w-2xl" data-testid="project-settings-panel">
      <p className="eyebrow mb-3 text-brass">Pengaturan proyek</p>
      <h2 className="display mb-10 text-3xl">{p.name}</h2>
      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <Label>Nama proyek</Label>
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} data-testid="project-name-input" />
        </div>
        <div>
          <Label>Kode</Label>
          <input className={inputCls} value={code} onChange={(e) => setCode(e.target.value)} data-testid="project-code-input" />
        </div>
      </div>
      <div className="mt-8">
        <Label>Email klien (satu per baris)</Label>
        <textarea
          rows={4}
          className={inputCls}
          value={clients}
          onChange={(e) => setClients(e.target.value)}
          disabled={!isAdmin}
          placeholder="klien@email.com"
          data-testid="project-client-emails-input"
        />
        <p className="mt-2 text-xs text-paper/40">{isAdmin ? "Klien hanya melihat revisi yang sudah dipublikasikan." : "Hanya admin yang bisa mengatur klien."}</p>
      </div>
      <button onClick={save} className={`${btn} mt-8`} data-testid="project-settings-save-btn">Simpan</button>

      <Section title="Riwayat publikasi">
        {data.revisions.length === 0 && <p className="text-sm text-paper/45">Belum pernah dipublikasikan.</p>}
        <div className="divide-y divide-paper/10">
          {data.revisions.map((r) => (
            <div key={r.number} className="flex justify-between py-3 text-sm" data-testid={`revision-row-${r.number}`}>
              <span className="eyebrow text-brass">Revisi {pad(r.number)}</span>
              <span className="text-paper/50">{new Date(r.published_at).toLocaleString("id-ID")} · {r.scene_count} scene</span>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
