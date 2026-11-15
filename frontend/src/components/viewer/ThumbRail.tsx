import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { img, pad } from "@/lib/api";
import type { Scene } from "@/types";

export function ThumbRail({ tour, index, playing, onSelect, overlay }: { tour: Scene[]; index: number; playing: boolean; onSelect: (i: number) => void; overlay?: boolean }) {
  const activeRef = useRef<HTMLButtonElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = activeRef.current;
    const rail = railRef.current;
    if (!el || !rail) {
      return;
    }
    rail.scrollTo({ left: el.offsetLeft - (rail.clientWidth - el.offsetWidth) / 2, behavior: "smooth" });
  }, [index]);
  return (
    <div
      ref={railRef}
      className={overlay ? "no-scrollbar relative flex gap-1.5 overflow-x-auto bg-gradient-to-t from-ink/90 to-transparent px-3 pb-2.5 pt-6" : "no-scrollbar relative hidden gap-3 overflow-x-auto border-t border-paper/10 bg-ink px-8 py-4 md:flex short:hidden"}
      data-testid={overlay ? "thumb-rail-overlay" : "thumb-rail"}
    >
      {tour.map((s, i) => {
        const active = i === index;
        return (
          <button
            key={s.id}
            ref={active ? activeRef : null}
            onClick={() => onSelect(i)}
            className={`relative shrink-0 overflow-hidden transition-opacity duration-300 ${overlay ? "h-11 w-16" : "h-[72px] w-28"} ${active ? "opacity-100 ring-1 ring-brass" : "opacity-45 hover:opacity-90"}`}
            data-testid={`${overlay ? "othumb" : "thumb"}-${i + 1}`}
          >
            <img src={img(s.thumb_url)} alt="" className="h-full w-full object-cover" draggable={false} loading="lazy" />
            <span className="eyebrow absolute left-1.5 top-1 text-[8.5px] text-white drop-shadow">{pad(i + 1)}</span>
            {active && playing && (
              <motion.span key={`p-${index}`} initial={{ width: "0%" }} animate={{ width: "100%" }} transition={{ duration: 7, ease: "linear" }} className="absolute bottom-0 left-0 h-[2px] bg-brass" data-testid="autoplay-progress" />
            )}
          </button>
        );
      })}
    </div>
  );
}
