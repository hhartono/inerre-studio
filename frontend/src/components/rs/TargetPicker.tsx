import { useRef, useState } from "react";
import { Dialog, DialogContent as DC, DialogTitle as DT } from "@/components/ui/dialog";

const DialogContent = DC as any;
const DialogTitle = DT as any;
import { img } from "@/lib/api";
import { btn, btnGhost } from "@/components/editor/ui";

type Box = { x: number; y: number; w: number; h: number };

export function TargetPicker({ open, onClose, source, aspect, refThumb, initial, onSave }: {
  open: boolean; onClose: () => void; source: string | null; aspect: number; refThumb: string | null; initial: Box | null; onSave: (b: Box | null) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const [b, setB] = useState<Box | null>(initial);
  const rel = (e: React.PointerEvent) => {
    const r = box.current!.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl border-paper/15 bg-ink text-paper" data-testid="rs-target-dialog">
        <DialogTitle className="display text-2xl font-normal">Tandai lokasi objek</DialogTitle>
        <div className="flex items-center gap-3 text-xs text-paper/55">
          {refThumb && <img src={img(refThumb)} alt="" className="h-12 w-16 object-cover" />}
          Tarik kotak di screenshot SketchUp pada objek yang harus mengikuti referensi ini (mis. lampu gantung, kursi, dinding wallpaper).
        </div>
        <div ref={box} className="relative w-full cursor-crosshair touch-none select-none bg-surface" style={{ aspectRatio: aspect }}
          onPointerDown={(e) => { (e.target as Element).setPointerCapture?.(e.pointerId); start.current = rel(e); setB(null); }}
          onPointerMove={(e) => { if (!start.current) return; const p = rel(e), s = start.current; setB({ x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) }); }}
          onPointerUp={() => (start.current = null)} data-testid="rs-target-canvas">
          {source && <img src={img(source)} alt="" draggable={false} className="pointer-events-none absolute inset-0 h-full w-full object-contain" />}
          {b && <div className="pointer-events-none absolute border-2 border-brass bg-brass/20" style={{ left: `${b.x * 100}%`, top: `${b.y * 100}%`, width: `${b.w * 100}%`, height: `${b.h * 100}%` }} data-testid="rs-target-box" />}
        </div>
        <div className="flex justify-end gap-3">
          {initial && <button className={btnGhost} onClick={() => onSave(null)} data-testid="rs-target-clear">Hapus tanda</button>}
          <button className={btnGhost} onClick={onClose}>Batal</button>
          <button className={btn} disabled={!b || b.w < 0.01 || b.h < 0.01} onClick={() => b && onSave(b)} data-testid="rs-target-save">Simpan lokasi</button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
