import { useState } from "react";
import { toast } from "sonner";
import { api, errMsg, img, pad } from "@/lib/api";
import { useEditor } from "@/components/editor/EditorContext";
import { Label, Section, btn, btnDanger, btnGhost, inputCls } from "@/components/editor/ui";

function FileButton({ label, accept, onFile, busy, testid }: { label: string; accept: string; onFile: (f: File) => void; busy?: boolean; testid: string }) {
  return (
    <label className={`${btnGhost} cursor-pointer ${busy ? "pointer-events-none opacity-60" : ""}`} data-testid={testid}>
      {busy ? "Mengunggah…" : label}
      <input type="file" accept={accept} className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onFile(f); }} data-testid={`${testid}-input`} />
    </label>
  );
}

function MediaSettings() {
  const { data, reload } = useEditor();
  const p = data.project;
  const [busy, setBusy] = useState("");
  const upload = async (kind: "music" | "pdf", file: File) => {
    setBusy(kind);
    const fd = new FormData();
    fd.append("file", file);
    try {
      await api.post(`/projects/${p.id}/${kind}`, fd, { timeout: 300000 });
      toast.success(kind === "music" ? "Musik tur diunggah" : "PDF presentasi diunggah");
      await reload();
    } catch (e) {
      toast.error(errMsg(e));
    }
    setBusy("");
  };
  const remove = async (kind: "music" | "pdf") => {
    if (!window.confirm(kind === "music" ? "Hapus musik tur?" : "Hapus PDF presentasi?")) return;
    await api.delete(`/projects/${p.id}/${kind}`).catch((e) => toast.error(errMsg(e)));
    reload();
  };
  return (
    <>
      <Section title="Musik tur" aside={<FileButton label={p.music_name ? "Ganti musik" : "Unggah musik"} accept="audio/*" busy={busy === "music"} onFile={(f) => upload("music", f)} testid="upload-music" />}>
        {data.music_url ? (
          <div className="flex flex-wrap items-center gap-4" data-testid="music-current">
            <audio controls src={img(data.music_url)} preload="none" className="h-10 max-w-full" />
            <span className="text-sm text-paper/60">{p.music_name}</span>
            <button onClick={() => remove("music")} className={btnDanger} data-testid="music-remove-btn">Hapus</button>
          </div>
        ) : (
          <p className="text-sm text-paper/45">Lagu diputar saat klien menjalankan tur (mp3/m4a, maks 30 MB). Klien bisa mematikannya.</p>
        )}
      </Section>
      <Section title="Presentasi PDF" aside={<FileButton label={p.pdf ? "Ganti PDF" : "Unggah PDF"} accept="application/pdf" busy={busy === "pdf"} onFile={(f) => upload("pdf", f)} testid="upload-pdf" />}>
        {p.pdf ? (
          <div className="flex flex-wrap items-center gap-4" data-testid="pdf-current">
            <span className="text-sm text-paper/70">{p.pdf.name}</span>
            <span className="eyebrow text-paper/45">{p.pdf.pages.length} halaman</span>
            <button onClick={() => remove("pdf")} className={btnDanger} data-testid="pdf-remove-btn">Hapus</button>
          </div>
        ) : (
          <p className="text-sm text-paper/45">Tab "Presentasi" hanya muncul di viewer kalau PDF diunggah. Halaman ditampilkan sebagai gambar, tanpa tombol unduh.</p>
        )}
      </Section>
    </>
  );
}

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

      <div className="mt-10">
        <MediaSettings />
      </div>

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
