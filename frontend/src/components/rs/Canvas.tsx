import { useEffect, useRef, useState } from "react";
import { Maximize2, RotateCcw } from "lucide-react";
import { img } from "@/lib/api";
import { applyGrade, type Adjust } from "@/lib/grade";

export type View = "render" | "source" | "compare" | "side";
export interface Region { x: number; y: number; w: number; h: number }

function GradedLayer({ src, adjust }: { src: string; adjust: Adjust }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [base, setBase] = useState<ImageData | null>(null);
  useEffect(() => {
    const im = new Image();
    im.crossOrigin = "anonymous";
    im.onload = () => {
      const s = Math.min(1, 1600 / Math.max(im.width, im.height));
      const c = document.createElement("canvas");
      c.width = Math.round(im.width * s);
      c.height = Math.round(im.height * s);
      const ctx = c.getContext("2d")!;
      ctx.drawImage(im, 0, 0, c.width, c.height);
      setBase(ctx.getImageData(0, 0, c.width, c.height));
    };
    im.src = src;
  }, [src]);
  useEffect(() => {
    if (!base || !ref.current) {
      return;
    }
    const id = requestAnimationFrame(() => {
      const c = ref.current!;
      c.width = base.width;
      c.height = base.height;
      c.getContext("2d")!.putImageData(applyGrade(base, adjust), 0, 0);
    });
    return () => {
      cancelAnimationFrame(id);
    };
  }, [base, adjust]);
  return <canvas ref={ref} className="absolute inset-0 h-full w-full object-contain" data-testid="rs-live-canvas" />;
}

function Layer({ src, adjust, testid }: { src: string; adjust?: Adjust; testid: string }) {
  const live = adjust && Object.values(adjust).some(Boolean);
  return live ? <GradedLayer src={src} adjust={adjust!} /> : <img src={src} alt="" draggable={false} className="absolute inset-0 h-full w-full object-contain" data-testid={testid} />;
}

interface Props {
  aspect: number; source: string | null; render: string | null; adjust: Adjust; view: View;
  regionMode: boolean; region: Region | null; onRegion: (r: Region | null) => void; overlay?: React.ReactNode;
}

export function Canvas({ aspect, source, render, adjust, view, regionMode, region, onRegion, overlay }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [z, setZ] = useState({ s: 1, x: 0, y: 0 });
  const [pos, setPos] = useState(50);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    if (regionMode) setZ({ s: 1, x: 0, y: 0 });
  }, [regionMode]);
  const src = img(source), out = render ? img(render) : null;
  const rel = (e: React.PointerEvent) => {
    const r = box.current!.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  };
  const down = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    if (regionMode) {
      start.current = rel(e);
      onRegion(null);
    } else drag.current = { x: e.clientX, y: e.clientY, ox: z.x, oy: z.y };
  };
  const move = (e: React.PointerEvent) => {
    if (regionMode && start.current) {
      const p = rel(e), s = start.current;
      onRegion({ x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) });
    } else if (drag.current && z.s > 1) setZ({ ...z, x: drag.current.ox + e.clientX - drag.current.x, y: drag.current.oy + e.clientY - drag.current.y });
  };
  const up = () => {
    start.current = null;
    drag.current = null;
  };
  const single = (s: string | null, adj?: Adjust, testid = "rs-canvas-image") => (s ? <Layer src={s} adjust={adj} testid={testid} /> : <div className="eyebrow absolute inset-0 flex items-center justify-center text-paper/30">Belum ada render</div>);

  const stage = (content: React.ReactNode, ref?: React.Ref<HTMLDivElement>, interactive = true) => (
    <div ref={ref} className="relative max-h-full max-w-full overflow-hidden bg-surface" style={{ aspectRatio: aspect, width: view === "side" ? "100%" : `min(100%, calc((100vh - 190px) * ${aspect}))` }}
      onPointerDown={interactive ? down : undefined} onPointerMove={interactive ? move : undefined} onPointerUp={up} onDoubleClick={() => setZ({ s: 1, x: 0, y: 0 })}
      onWheel={(e) => !regionMode && setZ((v) => ({ ...v, s: Math.min(6, Math.max(1, v.s * (e.deltaY < 0 ? 1.12 : 0.9))) }))}>
      <div className="absolute inset-0 origin-center" style={{ transform: `translate(${z.x}px, ${z.y}px) scale(${z.s})`, cursor: regionMode ? "crosshair" : z.s > 1 ? "grab" : "default" }}>{content}</div>
      {interactive && region && (
        <div className="pointer-events-none absolute border border-brass bg-brass/15" style={{ left: `${region.x * 100}%`, top: `${region.y * 100}%`, width: `${region.w * 100}%`, height: `${region.h * 100}%` }} data-testid="rs-region-box" />
      )}
      {interactive && overlay}
    </div>
  );

  return (
    <div ref={wrap} className="relative flex h-full w-full items-center justify-center bg-ink p-3 md:p-6" data-testid="rs-canvas" data-view={view}>
      {view === "side" ? (
        <div className="grid w-full grid-cols-2 gap-3">
          {stage(single(src, undefined, "rs-side-source"), undefined, false)}
          {stage(single(out, adjust, "rs-side-render"), box)}
        </div>
      ) : view === "compare" ? (
        stage(
          <>
            {single(out, adjust)}
            <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>{single(src, undefined, "rs-compare-source")}</div>
            <div className="pointer-events-none absolute inset-y-0 w-px bg-brass" style={{ left: `${pos}%` }} />
            <input type="range" min={0} max={100} value={pos} onChange={(e) => setPos(+e.target.value)} onPointerDown={(e) => e.stopPropagation()}
              className="absolute bottom-3 left-1/2 w-1/2 -translate-x-1/2 accent-[#c6b38b]" data-testid="rs-compare-slider" />
          </>, box)
      ) : stage(single(view === "source" ? src : out, view === "source" ? undefined : adjust), box)}
      <div className="absolute right-4 top-4 flex gap-1.5">
        {z.s > 1 && <button onClick={() => setZ({ s: 1, x: 0, y: 0 })} className="glass p-2 text-paper/80" title="Reset zoom" data-testid="rs-zoom-reset"><RotateCcw size={14} /></button>}
        <button onClick={() => (document.fullscreenElement ? document.exitFullscreen() : wrap.current?.requestFullscreen?.())} className="glass p-2 text-paper/80" title="Layar penuh" data-testid="rs-canvas-fullscreen"><Maximize2 size={14} /></button>
      </div>
      {z.s > 1 && <span className="eyebrow absolute bottom-4 left-4 text-[9px] text-paper/50">{Math.round(z.s * 100)}%</span>}
    </div>
  );
}
