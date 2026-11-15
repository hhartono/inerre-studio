import { useEffect, useState } from "react";
import { Copy, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { api, errMsg } from "@/lib/api";
import { useEditor } from "@/components/editor/EditorContext";
import { Label, Section, btn, btnGhost, inputCls } from "@/components/editor/ui";

interface ShareState {
  enabled: boolean;
  token: string | null;
  has_password: boolean;
}

export function ShareSettings() {
  const { data } = useEditor();
  const pid = data.project.id;
  const [share, setShare] = useState<ShareState | null>(null);
  const [password, setPassword] = useState("");
  const link = share?.token ? `${window.location.origin}/s/${share.token}` : "";

  useEffect(() => {
    api.get(`/projects/${pid}/share`).then((r) => setShare(r.data)).catch((e) => toast.error(errMsg(e)));
  }, [pid]);

  const save = async (enabled: boolean, pw?: string) => {
    try {
      const { data: s } = await api.put(`/projects/${pid}/share`, { enabled, ...(pw ? { password: pw } : {}) });
      setShare(s);
      setPassword("");
      toast.success(pw ? "Password disimpan" : enabled ? "Link berbagi aktif" : "Link berbagi dinonaktifkan");
    } catch (e) {
      toast.error(errMsg(e));
    }
  };
  const regenerate = async () => {
    if (!window.confirm("Buat link baru? Link lama langsung tidak berlaku dan klien perlu link baru.")) return;
    try {
      const { data: s } = await api.post(`/projects/${pid}/share/regenerate`);
      setShare(s);
      toast.success("Link baru dibuat");
    } catch (e) {
      toast.error(errMsg(e));
    }
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Link disalin");
    } catch {
      toast.error("Gagal menyalin. Salin manual dari kolom link.");
    }
  };
  if (!share) return null;

  return (
    <Section
      title="Link berbagi klien"
      aside={
        <label className="flex items-center gap-3">
          <span className="eyebrow text-paper/50">{share.enabled ? "Aktif" : "Nonaktif"}</span>
          <Switch checked={share.enabled} onCheckedChange={(v) => save(v)} disabled={!share.has_password} data-testid="share-enabled-switch" />
        </label>
      }
    >
      <p className="mb-6 text-sm text-paper/50">
        Klien membuka link rahasia dan memasukkan password, tanpa membuat akun. Yang tampil selalu revisi terakhir yang dipublikasikan.
        {!data.project.published_revision && " Proyek ini belum dipublikasikan, jadi link belum bisa dibuka."}
      </p>
      <div className="max-w-xl">
        <Label>{share.has_password ? "Ganti password" : "Buat password"}</Label>
        <div className="flex gap-3">
          <input type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="min. 4 karakter" className={inputCls} data-testid="share-password-setting-input" />
          <button disabled={password.length < 4} onClick={() => save(share.has_password ? share.enabled : true, password)} className={`${btn} shrink-0`} data-testid="share-password-save-btn">
            Simpan
          </button>
        </div>
        <p className="mt-2 text-xs text-paper/40">Mengganti password membuat semua orang harus memasukkan password baru.</p>
      </div>
      {share.enabled && link && (
        <div className="mt-8 max-w-xl" data-testid="share-link-box">
          <Label>Link rahasia</Label>
          <div className="flex flex-wrap gap-3">
            <input readOnly value={link} className={`${inputCls} min-w-0 flex-1`} onFocus={(e) => e.target.select()} data-testid="share-link-input" />
            <button onClick={copy} className={btnGhost} data-testid="share-copy-btn"><Copy size={13} /> Salin</button>
            <button onClick={regenerate} className={btnGhost} data-testid="share-regenerate-btn"><RefreshCw size={13} /> Link baru</button>
          </div>
        </div>
      )}
    </Section>
  );
}
