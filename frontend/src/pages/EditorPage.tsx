import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Eye } from "lucide-react";
import { UserButton } from "@clerk/react";
import { api, errMsg, pad } from "@/lib/api";
import { useMe } from "@/context/MeContext";
import type { Draft, Scene } from "@/types";
import { Splash } from "@/components/RequireRole";
import { EditorContext, Sel } from "@/components/editor/EditorContext";
import { StructureTree } from "@/components/editor/StructureTree";
import { ProjectSettings } from "@/components/editor/ProjectSettings";
import { FloorPanel } from "@/components/editor/FloorPanel";
import { ScenePanel } from "@/components/editor/ScenePanel";
import { TourOrder } from "@/components/editor/TourOrder";
import { PublishPanel } from "@/components/editor/PublishPanel";

function Workspace({ data, sel }: { data: Draft; sel: Sel }) {
  if (sel.kind === "tour") return <TourOrder />;
  if (sel.kind === "publish") return <PublishPanel />;
  const floor = sel.kind === "floor" && data.floors.find((f) => f.id === sel.id);
  if (floor) return <FloorPanel floor={floor} />;
  const scene = sel.kind === "scene" && data.scenes.find((s) => s.id === sel.id);
  if (scene) return <ScenePanel key={scene.id} scene={scene} />;
  return <ProjectSettings key={data.project.id} />;
}

export default function EditorPage() {
  const { projectId } = useParams();
  const { me } = useMe();
  const [data, setData] = useState<Draft | null>(null);
  const [error, setError] = useState("");
  const [sel, setSel] = useState<Sel>({ kind: "project" });

  const reload = useCallback(async () => {
    try {
      const r = await api.get(`/projects/${projectId}/draft`);
      setData(r.data);
    } catch (e) {
      setError(errMsg(e));
    }
  }, [projectId]);
  useEffect(() => {
    reload();
  }, [reload]);

  const replaceScene = useCallback((s: Scene) => {
    setData((d) => (d ? { ...d, scenes: d.scenes.map((x) => (x.id === s.id ? s : x)) } : d));
  }, []);

  const ctx = useMemo(
    () => (data ? { data, reload, replaceScene, sel, select: setSel, isAdmin: me?.role === "admin" } : null),
    [data, reload, replaceScene, sel, me],
  );

  if (error) return <div className="p-10 text-paper" data-testid="editor-error">{error}</div>;
  if (!ctx || !data) return <Splash />;

  return (
    <EditorContext.Provider value={ctx}>
      <div className="flex min-h-screen flex-col bg-ink text-paper md:h-screen" data-testid="editor-page">
        <header className="flex h-14 shrink-0 items-center gap-5 border-b border-paper/10 px-4 md:px-6">
          <Link to="/studio" className="text-paper/50 transition-colors hover:text-brass" data-testid="editor-back-link"><ArrowLeft size={16} /></Link>
          <span className="eyebrow hidden text-[11px] tracking-[0.42em] sm:inline">INERRE</span>
          <span className="hidden h-4 w-px bg-paper/15 sm:block" />
          <p className="min-w-0 flex-1 truncate text-sm" data-testid="editor-project-name">{data.project.name}</p>
          <span className="eyebrow hidden text-paper/45 md:inline" data-testid="editor-revision-status">
            {data.project.published_revision ? `Terbit: Revisi ${pad(data.project.published_revision)}` : "Belum terbit"}
          </span>
          <Link to={`/preview/${data.project.id}`} className="eyebrow inline-flex items-center gap-2 border border-paper/15 px-3 py-2 transition-colors hover:border-brass hover:text-brass" data-testid="editor-preview-btn">
            <Eye size={13} /> Preview
          </Link>
          <UserButton />
        </header>
        <div className="flex flex-1 flex-col md:min-h-0 md:flex-row">
          <aside className="max-h-[45vh] shrink-0 overflow-y-auto border-b border-paper/10 px-2 md:max-h-none md:w-[290px] md:border-b-0 md:border-r">
            <StructureTree />
          </aside>
          <main className="flex-1 overflow-y-auto px-5 py-10 md:px-12" data-testid="editor-workspace">
            <Workspace data={data} sel={sel} />
          </main>
        </div>
      </div>
    </EditorContext.Provider>
  );
}
