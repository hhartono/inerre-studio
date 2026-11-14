import { img } from "@/lib/api";
import { PLAN_W, conePath, planHeight } from "@/lib/geometry";
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

export function PlanView({ floor, scenes, activeId, roomId, compact, numbers, onSelect }: Props) {
  const H = planHeight(floor.plan_aspect);
  const pins = scenes.filter((s) => s.camera);
  const r = compact ? 70 : 85;
  const dot = compact ? 16 : 11;
  if (!floor.plan_url) {
    return <div className="eyebrow flex aspect-[4/3] items-center justify-center bg-surface text-paper/40" data-testid="plan-missing">Denah belum tersedia</div>;
  }
  return (
    <div className="protect relative w-full" style={{ aspectRatio: `${floor.plan_aspect || 1.4}` }} data-testid={`plan-view-${floor.id}`}>
      <img src={img(floor.plan_url)} alt={floor.name} className="absolute inset-0 h-full w-full object-contain" draggable={false} onContextMenu={(e) => e.preventDefault()} />
      <svg viewBox={`0 0 ${PLAN_W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
        {pins.map((s) => {
          const c = s.camera!;
          const cx = c.x * PLAN_W;
          const cy = c.y * H;
          const active = s.id === activeId;
          const dim = roomId && s.room_id !== roomId;
          return (
            <g
              key={s.id}
              onClick={(e) => {
                e.stopPropagation();
                onSelect?.(s.id);
              }}
              className="cursor-pointer"
              style={{ opacity: dim ? 0.25 : 1, transition: "opacity 0.3s" }}
              data-testid={`plan-pin-${s.id}`}
            >
              <title>{s.title}</title>
              <path d={conePath(cx, cy, c.angle, c.fov, active ? r * 1.25 : r)} fill="#c6b38b" fillOpacity={active ? 0.5 : 0.2} stroke="#c6b38b" strokeOpacity={active ? 0.9 : 0.4} strokeWidth={1.5} />
              <circle cx={cx} cy={cy} r={active ? dot * 1.3 : dot} fill={active ? "#c6b38b" : "#171713"} stroke="#c6b38b" strokeWidth={3} />
              {!compact && numbers?.[s.id] && (
                <text x={cx} y={cy - dot - 8} textAnchor="middle" fontSize={18} fill="#171713" stroke="#eee9df" strokeWidth={4} paintOrder="stroke" style={{ fontFamily: "Arial", letterSpacing: 2, fontWeight: 700 }}>
                  {String(numbers[s.id]).padStart(2, "0")}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
