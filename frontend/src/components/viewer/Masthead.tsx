import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { pad } from "@/lib/api";
import type { ViewData } from "@/types";

export type ViewerTab = "ruang" | "denah" | "layout";
const TABS: { id: ViewerTab; label: string }[] = [
  { id: "ruang", label: "Ruang" },
  { id: "denah", label: "Denah" },
  { id: "layout", label: "Layout 3D" },
];

export function Masthead({ data, tab, setTab, backTo }: { data: ViewData; tab: ViewerTab; setTab: (t: ViewerTab) => void; backTo: string }) {
  const badge = data.mode === "draft" ? "Preview · Draft" : `Revisi ${pad(data.revision?.number || 0)}`;
  return (
    <header className="sticky top-0 z-50 border-b border-paper/10 bg-ink/85 backdrop-blur-xl" data-testid="viewer-masthead">
      <div className="flex h-14 items-center gap-4 px-4 md:h-16 md:gap-8 md:px-8">
        <Link to={backTo} className="text-paper/50 transition-colors hover:text-brass" title="Kembali" data-testid="viewer-back-link">
          <ArrowLeft size={16} />
        </Link>
        <span className="eyebrow text-[11px] tracking-[0.42em]">INERRE</span>
        <span className="hidden h-4 w-px bg-paper/15 md:block" />
        <p className="min-w-0 flex-1 truncate text-sm text-paper/80 md:flex-none" data-testid="viewer-project-name">{data.project.name}</p>
        <span className={`eyebrow shrink-0 border px-2.5 py-1 text-[9px] ${data.mode === "draft" ? "border-amber-300/40 text-amber-200" : "border-brass/50 text-brass"}`} data-testid="viewer-revision-badge">
          {badge}
        </span>
        <nav className="ml-auto hidden gap-8 md:flex">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} className={`eyebrow relative py-5 transition-colors ${tab === t.id ? "text-brass" : "text-paper/55 hover:text-paper"}`} data-testid={`viewer-tab-${t.id}`}>
              {t.label}
              {tab === t.id && <span className="absolute inset-x-0 bottom-0 h-px bg-brass" />}
            </button>
          ))}
        </nav>
      </div>
      <nav className="grid grid-cols-3 border-t border-paper/10 md:hidden">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`eyebrow py-3 text-[9.5px] transition-colors ${tab === t.id ? "bg-surface text-brass" : "text-paper/55"}`} data-testid={`viewer-tab-mobile-${t.id}`}>
            {t.label}
          </button>
        ))}
      </nav>
    </header>
  );
}
