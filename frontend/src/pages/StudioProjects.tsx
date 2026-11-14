import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus, Trash2, Eye, PenLine } from "lucide-react";
import { toast } from "sonner";
import { StudioShell } from "@/components/StudioShell";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api, errMsg, img, pad } from "@/lib/api";
import { useMe } from "@/context/MeContext";
import type { Project } from "@/types";

function NewProjectDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data } = await api.post("/projects", { name, code });
      navigate(`/studio/${data.id}`);
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-paper/10 bg-surface text-paper" data-testid="new-project-dialog">
        <DialogHeader>
          <DialogTitle className="eyebrow text-brass">Proyek baru</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <Input placeholder="Nama proyek" value={name} onChange={(e) => setName(e.target.value)} required data-testid="new-project-name-input" />
          <Input placeholder="Kode proyek (opsional)" value={code} onChange={(e) => setCode(e.target.value)} data-testid="new-project-code-input" />
          <button disabled={busy} className="eyebrow w-full bg-brass py-3 text-ink transition-opacity hover:opacity-90 disabled:opacity-50" data-testid="new-project-submit-btn">
            {busy ? "Membuat…" : "Buat proyek"}
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function StudioProjects() {
  const { me } = useMe();
  const [items, setItems] = useState<Project[] | null>(null);
  const [open, setOpen] = useState(false);
  const load = () => api.get("/projects").then((r) => setItems(r.data)).catch((e) => toast.error(errMsg(e)));
  useEffect(() => {
    load();
  }, []);

  const remove = async (p: Project) => {
    if (!window.confirm(`Hapus proyek "${p.name}" beserta semua scene dan revisinya?`)) return;
    await api.delete(`/projects/${p.id}`).catch((e) => toast.error(errMsg(e)));
    load();
  };

  return (
    <StudioShell>
      <div className="mb-12 flex flex-wrap items-end justify-between gap-6">
        <div className="fade-up">
          <p className="eyebrow mb-4 text-brass">Studio</p>
          <h1 className="display text-4xl sm:text-5xl">Proyek</h1>
        </div>
        <button onClick={() => setOpen(true)} className="eyebrow inline-flex items-center gap-3 border border-brass/60 px-6 py-3.5 text-brass transition-colors hover:bg-brass hover:text-ink" data-testid="new-project-btn">
          <Plus size={14} /> Proyek baru
        </button>
      </div>
      {items && items.length === 0 && <p className="text-sm text-paper/55" data-testid="studio-projects-empty">Belum ada proyek. Mulai dengan membuat proyek baru.</p>}
      <div className="divide-y divide-paper/10 border-y border-paper/10">
        {items?.map((p) => (
          <div key={p.id} className="group grid items-center gap-5 py-5 md:grid-cols-[160px_1fr_auto]" data-testid={`studio-project-row-${p.id}`}>
            <div className="aspect-[16/10] w-full overflow-hidden bg-surface md:w-40">
              {p.cover_url && <img src={img(p.cover_url)} alt="" className="h-full w-full object-cover" />}
            </div>
            <div>
              <p className="eyebrow text-paper/40">{p.code || "—"} · {p.scene_count} scene</p>
              <Link to={`/studio/${p.id}`} className="mt-2 block text-lg transition-colors hover:text-brass">{p.name}</Link>
              <p className="eyebrow mt-2 text-brass/80">{p.published_revision ? `Revisi ${pad(p.published_revision)} terbit` : "Draft · belum terbit"}</p>
            </div>
            <div className="flex gap-2">
              <Link to={`/studio/${p.id}`} className="inline-flex h-10 w-10 items-center justify-center border border-paper/15 transition-colors hover:border-brass hover:text-brass" title="Edit" data-testid={`edit-project-${p.id}`}><PenLine size={15} /></Link>
              <Link to={`/preview/${p.id}`} className="inline-flex h-10 w-10 items-center justify-center border border-paper/15 transition-colors hover:border-brass hover:text-brass" title="Preview" data-testid={`preview-project-${p.id}`}><Eye size={15} /></Link>
              {me?.role === "admin" && (
                <button onClick={() => remove(p)} className="inline-flex h-10 w-10 items-center justify-center border border-paper/15 transition-colors hover:border-red-400 hover:text-red-400" title="Hapus" data-testid={`delete-project-${p.id}`}><Trash2 size={15} /></button>
              )}
            </div>
          </div>
        ))}
      </div>
      <NewProjectDialog open={open} onOpenChange={setOpen} />
    </StudioShell>
  );
}
