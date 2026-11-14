import { img, pad } from "@/lib/api";
import type { PdfPage } from "@/types";
import { Watermark } from "@/components/viewer/Watermark";

export function PresentationView({ pages }: { pages: PdfPage[] }) {
  return (
    <div className="mx-auto max-w-[1400px] space-y-10 px-3 py-6 md:space-y-16 md:px-10 md:py-12" data-testid="pdf-view">
      {pages.map((p, i) => (
        <figure key={p.url} className="fade-up">
          <div className="protect relative w-full bg-surface shadow-[0_20px_60px_rgba(0,0,0,0.45)]" style={{ aspectRatio: `${p.aspect}` }}>
            <img
              src={img(p.url)}
              alt={`Halaman ${i + 1}`}
              loading={i < 2 ? "eager" : "lazy"}
              className="absolute inset-0 h-full w-full select-none object-contain"
              draggable={false}
              onContextMenu={(e) => e.preventDefault()}
              data-testid={`pdf-page-${i + 1}`}
            />
            <Watermark />
          </div>
          <figcaption className="eyebrow mt-3 text-paper/40">
            {pad(i + 1)} <span className="text-paper/25">/ {pad(pages.length)}</span>
          </figcaption>
        </figure>
      ))}
    </div>
  );
}
