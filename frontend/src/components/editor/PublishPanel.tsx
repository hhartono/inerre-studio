import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CheckCircle2, CircleAlert } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg, pad } from "@/lib/api";
import { useEditor } from "@/components/editor/EditorContext";
import { btn, btnGhost } from "@/components/editor/ui";

interface Issue {
  code: string;
  message: string;
  scene_id?: string;
  floor_id?: string;
}

export function PublishPanel() {
  const { data, reload, select } = useEditor();
  const [result, setResult] = useState<{ ok: boolean; errors: Issue[]; warnings: Issue[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const pid = data.project.id;
  const next = (data.project.published_revision || 0) + 1;

  const check = useCallback(() => {
    api.get(`/projects/${pid}/validate`).then((r) => setResult(r.data)).catch((e) => toast.error(errMsg(e)));
  }, [pid]);
  useEffect(() => {
    check();
  }, [check, data]);

  const publish = async () => {
    setBusy(true);
    try {
      const { data: r } = await api.post(`/projects/${pid}/publish`);
      toast.success(`Revisi ${pad(r.number)} dipublikasikan`);
      await reload();
    } catch (e: any) {
      const d = e?.response?.data?.detail;
      if (d?.errors) setResult({ ok: false, errors: d.errors, warnings: d.warnings || [] });
      toast.error(errMsg(e));
    }
    setBusy(false);
  };

  const open = (i: Issue) => {
    if (i.scene_id) select({ kind: "scene", id: i.scene_id });
    else if (i.floor_id) select({ kind: "floor", id: i.floor_id });
  };
  const IssueRow = ({ i, kind }: { i: Issue; kind: "error" | "warning" }) => (
    <button onClick={() => open(i)} className="flex w-full items-start gap-3 border-b border-paper/10 py-3 text-left text-sm transition-colors hover:text-brass" data-testid={`validation-${kind}-${i.code}`}>
      {kind === "error" ? <CircleAlert size={15} className="mt-0.5 shrink-0 text-red-400" /> : <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-300/80" />}
      <span className={kind === "error" ? "text-red-100" : "text-paper/65"}>{i.message}</span>
    </button>
  );

  return (
    <div className="max-w-3xl" data-testid="publish-panel">
      <p className="eyebrow mb-3 text-brass">Validasi & publikasi</p>
      <h2 className="display mb-3 text-3xl">Revisi {pad(next)}</h2>
      <p className="mb-10 text-sm text-paper/55">Publikasi membekukan isi proyek saat ini menjadi revisi baru yang bisa dilihat klien.</p>

      {result && (
        <div className="mb-10">
          {result.ok ? (
            <p className="flex items-center gap-3 text-sm text-emerald-300" data-testid="validation-ok"><CheckCircle2 size={16} /> Tidak ada link rusak atau hotspot yang perlu dicek.</p>
          ) : (
            <p className="mb-3 eyebrow text-red-300" data-testid="validation-blocked">{result.errors.length} masalah memblokir publikasi</p>
          )}
          {result.errors.map((i, k) => <IssueRow key={`e${k}`} i={i} kind="error" />)}
          {result.warnings.length > 0 && <p className="eyebrow mb-1 mt-8 text-paper/40">Catatan ({result.warnings.length})</p>}
          {result.warnings.map((i, k) => <IssueRow key={`w${k}`} i={i} kind="warning" />)}
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <Link to={`/preview/${pid}`} className={btnGhost} data-testid="publish-preview-link">Preview seperti klien</Link>
        <button onClick={check} className={btnGhost} data-testid="revalidate-btn">Cek ulang</button>
        <button onClick={publish} disabled={busy || !result?.ok} className={btn} data-testid="publish-btn">{busy ? "Mempublikasikan…" : `Publikasikan Revisi ${pad(next)}`}</button>
      </div>
    </div>
  );
}
