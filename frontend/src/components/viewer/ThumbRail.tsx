import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { img, pad } from "@/lib/api";
import type { Scene } from "@/types";

export function ThumbRail({ tour, index, playing, onSelect }: { tour: Scene[]; index: number; playing: boolean; onSelect: (i: number) => void }) {
  const activeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [index]);
  return (
    <div className="no-scrollbar flex gap-2 overflow-x-auto border-t border-paper/10 bg-ink px-4 py-3 md:gap-3 md:px-8 md:py-4" data-testid="thumb-rail">
      {tour.map((s, i) => {
        const active = i === index;
        return (
          <button
            key={s.id}
            ref={active ? activeRef : null}
            onClick={() => onSelect(i)}
            className={`relative h-14 w-20 shrink-0 overflow-hidden transition-opacity duration-300 md:h-[72px] md:w-28 ${active ? "opacity-100 ring-1 ring-brass" : "opacity-45 hover:opacity-90"}`}
            data-testid={`thumb-${i + 1}`}
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
