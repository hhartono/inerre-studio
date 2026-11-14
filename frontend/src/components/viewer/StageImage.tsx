import { AnimatePresence, motion } from "framer-motion";
import { img } from "@/lib/api";
import { useElementSize } from "@/lib/geometry";
import { Watermark } from "@/components/viewer/Watermark";
import type { Hotspot, Scene } from "@/types";

function HotspotButton({ h, onGo }: { h: Hotspot; onGo: (id: string) => void }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        if (h.target_scene_id) onGo(h.target_scene_id);
      }}
      className="group absolute z-10 flex -translate-x-2 -translate-y-1/2 items-center gap-2 outline-none"
      style={{ left: `${h.x * 100}%`, top: `${h.y * 100}%` }}
      data-testid={`hotspot-${h.id}`}
    >
      <span className="hotspot-dot relative block h-4 w-4 shrink-0 rounded-full border-2 border-white bg-white/35 shadow-[0_0_12px_rgba(0,0,0,0.5)] backdrop-blur-sm transition-transform duration-300 group-hover:scale-125" />
      {h.label && (
        <span className="hotspot-label eyebrow whitespace-nowrap bg-ink/75 px-2.5 py-1.5 text-[9.5px] text-paper backdrop-blur-md">{h.label}</span>
      )}
    </button>
  );
}

export function StageImage({ scene, valid, onGo }: { scene: Scene; valid: Set<string>; onGo: (id: string) => void }) {
  const [ref, size] = useElementSize<HTMLDivElement>();
  const a = scene.aspect || 1.5;
  const w = Math.min(size.width, size.height * a);
  const hotspots = scene.hotspots.filter((h) => h.target_scene_id && valid.has(h.target_scene_id));
  return (
    <div ref={ref} className="protect absolute inset-0 flex items-center justify-center">
      <div className="relative shadow-[0_30px_80px_rgba(0,0,0,0.55)]" style={{ width: w, height: w / a }} data-testid="stage-image-frame">
        <AnimatePresence initial={false}>
          <motion.img
            key={scene.id}
            src={img(scene.image_url)}
            alt={scene.title}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="absolute inset-0 h-full w-full select-none object-cover"
            draggable={false}
            onContextMenu={(e) => e.preventDefault()}
            data-testid="stage-image"
          />
        </AnimatePresence>
        <Watermark />
        {hotspots.map((h) => (
          <HotspotButton key={h.id} h={h} onGo={onGo} />
        ))}
      </div>
    </div>
  );
}
