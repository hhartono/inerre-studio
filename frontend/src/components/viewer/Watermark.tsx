export function Watermark() {
  return (
    <div className="pointer-events-none absolute inset-0 z-[5] flex select-none items-center justify-center overflow-hidden mix-blend-difference" data-testid="render-watermark" aria-hidden>
      <span className="eyebrow text-[clamp(20px,5vw,64px)] tracking-[0.6em] text-white/[0.32]">INERRE</span>
      <span className="eyebrow absolute bottom-3 right-4 text-[9px] text-white/50">INERRE · Untuk presentasi</span>
    </div>
  );
}
