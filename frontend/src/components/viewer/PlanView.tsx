import { img } from "@/lib/api";
import { PLAN_W, conePath, planHeight, useElementSize } from "@/lib/geometry";
import { pinColor } from "@/lib/viewer";
import type { Floor, Scene } from "@/types";

interface Props {
  floor: Floor;
  scenes: Scene[];
  activeId?: string;
  roomId?: string | null;
  compact?: boolean;
  numbers?: Record<string, number>;
  onSelect?: (sceneId: string) => void;
}

// Sizes are in screen pixels (u = plan units per px) so pins stay small and readable on phones.
export function PlanView({ floor, scenes, activeId, roomId, compact, numbers, onSelect }: Props) {
  const [ref, size] = useElementSize<HTMLDivElement>();
  const H = planHeight(floor.plan_aspect);
  const u = size.width ? PLAN_W / size.width : 2;
  const small = compact || size.width < 600;
  const dotPx = small ? 7.5 : 9;
  const conePx = small ? 30 : 46;
  const pins = scenes
    .filter((s) => s.camera)
    .map((s) => ({ s, n: numbers?.[s.id], c: s.camera!, active: s.id === activeId, dim: !!roomId && s.room_id !== roomId }));
  if (!floor.plan_url) {
    return <div className="eyebrow flex aspect-[4/3] items-center justify-center bg-surface text-paper/40" data-testid="plan-missing">Denah belum tersedia</div>;
  }
  const select = (id: string) => (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect?.(id);
  };
  const ordered = [...pins].sort((a, b) => Number(a.active) - Number(b.active));
  return (
    <div ref={ref} className="protect relative w-full" style={{ aspectRatio: `${floor.plan_aspect || 1.4}` }} data-testid={`plan-view-${floor.id}`}>
      <img src={img(floor.plan_url)} alt={floor.name} className="absolute inset-0 h-full w-full object-contain" draggable={false} onContextMenu={(e) => e.preventDefault()} />
      <svg viewBox={`0 0 ${PLAN_W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
        {ordered.map(({ s, n, c, active, dim }) => {
          const color = pinColor(n);
          const r = (active ? conePx * 1.2 : conePx) * u;
          const rad = (c.angle * Math.PI) / 180;
          const cx = c.x * PLAN_W;
          const cy = c.y * H;
          return (
            <g key={`c-${s.id}`} onClick={select(s.id)} className="cursor-pointer" style={{ opacity: dim ? 0.2 : 1, transition: "opacity 0.3s" }}>
              <path d={conePath(cx, cy, c.angle, c.fov, r)} fill={color} fillOpacity={active ? 0.75 : 0.5} stroke={color} strokeWidth={1.2 * u} data-testid={`plan-cone-${s.id}`} />
              <line x1={cx} y1={cy} x2={cx + Math.cos(rad) * r} y2={cy + Math.sin(rad) * r} stroke="#171713" strokeOpacity={0.55} strokeWidth={1 * u} strokeDasharray={`${2.5 * u} ${2.5 * u}`} />
            </g>
          );
        })}
        {ordered.map(({ s, n, c, active, dim }) => {
          const color = pinColor(n);
          const dot = (active ? dotPx * 1.2 : dotPx) * u;
          const cx = c.x * PLAN_W;
          const cy = c.y * H;
          return (
            <g key={`d-${s.id}`} onClick={select(s.id)} className="cursor-pointer" style={{ opacity: dim ? 0.25 : 1, transition: "opacity 0.3s" }} data-testid={`plan-pin-${s.id}`}>
              <title>{s.title}</title>
              <circle cx={cx} cy={cy} r={dot + (active ? 2.5 : 1.5) * u} fill={active ? "#ffffff" : "#171713"} />
              <circle cx={cx} cy={cy} r={dot} fill={color} />
              {n && (
                <text x={cx} y={cy} dy="0.36em" textAnchor="middle" fontSize={(small ? 7.5 : 9) * u} fontWeight={700} fill="#171713" style={{ fontFamily: "Arial", pointerEvents: "none" }} data-testid={`plan-pin-number-${s.id}`}>
                  {String(n).padStart(2, "0")}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
