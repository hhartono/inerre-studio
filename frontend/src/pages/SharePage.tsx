import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Lock } from "lucide-react";
import { api, errMsg } from "@/lib/api";
import ViewerPage from "@/pages/ViewerPage";
import { Splash } from "@/components/RequireRole";

const storeKey = (t: string) => `inerre-share:${t}`;

function readAccess(token: string): string | null {
  try {
    const v = JSON.parse(localStorage.getItem(storeKey(token)) || "null");
    return v && v.exp > Date.now() ? v.access : null;
  } catch {
    return null;
  }
}

export default function SharePage() {
  const { token = "" } = useParams();
  const [meta, setMeta] = useState<{ project_name: string; code: string } | null>(null);
  const [error, setError] = useState("");
  const [access, setAccess] = useState<string | null>(() => readAccess(token));
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    api.get(`/share/${token}`).then((r) => setMeta(r.data)).catch((e) => setError(errMsg(e)));
  }, [token]);

  const onExpired = useCallback(() => {
    localStorage.removeItem(storeKey(token));
    setAccess(null);
  }, [token]);
  const share = useMemo(() => (access ? { token, access, onExpired } : undefined), [token, access, onExpired]);

  const unlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setFormError("");
    try {
      const { data } = await api.post(`/share/${token}/unlock`, { password });
      localStorage.setItem(storeKey(token), JSON.stringify({ access: data.access, exp: Date.now() + data.expires_in * 1000 - 60000 }));
      setAccess(data.access);
    } catch (err) {
      setFormError(errMsg(err));
    }
    setBusy(false);
  };

  if (error) {
    return (
      <div className="flex min-h-screen flex-col justify-center bg-ink px-6 md:px-16" data-testid="share-error">
        <p className="eyebrow mb-4 text-brass">INERRE</p>
        <p className="text-lg">{error}</p>
      </div>
    );
  }
  if (!meta) return <Splash />;
  if (share) return <ViewerPage mode="published" share={share} />;

  return (
    <div className="relative min-h-screen overflow-hidden bg-ink" data-testid="share-unlock-page">
      <img src="/hero-interior.jpg" alt="" className="absolute inset-0 h-full w-full object-cover opacity-30" />
      <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/80 to-ink/40" />
      <div className="relative flex min-h-screen flex-col justify-between px-6 py-8 md:px-16 md:py-14">
        <span className="eyebrow text-[12px] tracking-[0.42em]">INERRE</span>
        <form onSubmit={unlock} className="w-full max-w-sm fade-up">
          <p className="eyebrow mb-4 text-brass">{meta.code || "Presentasi"}</p>
          <h1 className="display text-3xl leading-tight sm:text-4xl" data-testid="share-project-name">{meta.project_name}</h1>
          <p className="mt-4 text-sm text-paper/60">Masukkan password yang diberikan tim INERRE.</p>
          <div className="mt-8 flex items-center gap-3 border-b border-paper/25 pb-2 focus-within:border-brass">
            <Lock size={15} className="text-paper/40" />
            <input
              type="password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="w-full bg-transparent py-2 text-base text-paper outline-none placeholder:text-paper/30"
              data-testid="share-password-input"
            />
          </div>
          {formError && <p className="mt-3 text-sm text-red-300" data-testid="share-password-error">{formError}</p>}
          <button disabled={busy || !password} className="eyebrow mt-8 w-full bg-brass py-4 text-ink transition-opacity hover:opacity-90 disabled:opacity-40" data-testid="share-unlock-btn">
            {busy ? "Membuka…" : "Buka presentasi"}
          </button>
        </form>
        <p className="eyebrow text-paper/35">Link ini bersifat rahasia</p>
      </div>
    </div>
  );
}
