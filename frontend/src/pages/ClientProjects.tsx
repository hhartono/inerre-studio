import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { StudioShell } from "@/components/StudioShell";
import { api, errMsg, img, pad } from "@/lib/api";
import type { Project } from "@/types";

export default function ClientProjects() {
  const [items, setItems] = useState<Project[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get("/projects").then((r) => setItems(r.data.filter((p: Project) => p.published_revision > 0))).catch((e) => setError(errMsg(e)));
  }, []);

  return (
    <StudioShell title="Proyek Anda">
      {error && <p className="text-sm text-red-400" data-testid="client-projects-error">{error}</p>}
      {items && items.length === 0 && (
        <p className="max-w-md text-sm text-paper/55" data-testid="client-projects-empty">
          Belum ada proyek yang dipublikasikan untuk Anda. Tim INERRE akan mengabari saat presentasi siap.
        </p>
      )}
      <div className="grid gap-x-8 gap-y-14 sm:grid-cols-2 xl:grid-cols-3">
        {items?.map((p, i) => (
          <Link
            key={p.id}
            to={`/view/${p.id}`}
            className="group block fade-up"
            style={{ animationDelay: `${i * 80}ms` }}
            data-testid={`client-project-card-${p.id}`}
          >
            <div className="relative aspect-[16/10] overflow-hidden bg-surface">
              {p.cover_url && (
                <img src={img(p.cover_url)} alt="" className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.04]" draggable={false} />
              )}
              <span className="eyebrow glass absolute left-4 top-4 px-3 py-1.5 text-brass">Revisi {pad(p.published_revision)}</span>
            </div>
            <p className="eyebrow mt-5 text-paper/45">{p.code || "Proyek"}</p>
            <h2 className="mt-2 text-lg text-paper transition-colors group-hover:text-brass">{p.name}</h2>
          </Link>
        ))}
      </div>
    </StudioShell>
  );
}
