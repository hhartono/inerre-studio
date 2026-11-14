import { img } from "@/lib/api";
import { PLAN_W, conePath, planHeight, useElementSize } from "@/lib/geometry";
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

// Pin sizes are set in screen pixels so pins and cones stay readable on any plan width.
export function PlanView({ floor, scenes, activeId, roomId, compact, numbers, onSelect }: Props) {
  const [ref, size] = useElementSize<HTMLDivElement>();
  const H = planHeight(floor.plan_aspect);
  const u = size.width ? PLAN_W / size.width : 2;
  const pins = scenes.filter((s) => s.camera);
  const dotPx = compact ? 9 : 11;
  const conePx = compact ? 46 : 64;
  if (!floor.plan_url) {
    return <div className="eyebrow flex aspect-[4/3] items-center justify-center bg-surface text-paper/40" data-testid="plan-missing">Denah belum tersedia</div>;
  }
  const ordered = [...pins].sort((a, b) => (a.id === activeId ? 1 : b.id === activeId ? -1 : 0));
  return (
    <div ref={ref} className="protect relative w-full" style={{ aspectRatio: `${floor.plan_aspect || 1.4}` }} data-testid={`plan-view-${floor.id}`}>
      <img src={img(floor.plan_url)} alt={floor.name} className="absolute inset-0 h-full w-full object-contain" draggable={false} onContextMenu={(e) => e.preventDefault()} />
      <svg viewBox={`0 0 ${PLAN_W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
        <defs>
          <radialGradient id={`cone-${floor.id}`} r="1" cx="0" cy="0" gradientUnits="userSpaceOnUse" gradientTransform={`scale(${conePx * 1.3 * u})`}>
            <stop offset="0" stopColor="#c6b38b" stopOpacity="0.95" />
            <stop offset="1" stopColor="#c6b38b" stopOpacity="0.15" />
          </radialGradient>
        </defs>
        {ordered.map((s) => {
          const c = s.camera!;
          const cx = c.x * PLAN_W;
          const cy = c.y * H;
          const active = s.id === activeId;
          const dim = roomId && s.room_id !== roomId;
          const dot = (active ? dotPx * 1.25 : dotPx) * u;
          const r = (active ? conePx * 1.3 : conePx) * u;
          const n = numbers?.[s.id];
          const rad = (c.angle * Math.PI) / 180;
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
              <g transform={`translate(${cx} ${cy})`}>
                <path
                  d={conePath(0, 0, c.angle, c.fov, r)}
                  fill={`url(#cone-${floor.id})`}
                  fillOpacity={active ? 0.95 : 0.6}
                  stroke={active ? "#8a7448" : "#a08c62"}
                  strokeWidth={1.6 * u}
                  data-testid={`plan-cone-${s.id}`}
                />
                <line x1={0} y1={0} x2={Math.cos(rad) * r} y2={Math.sin(rad) * r} stroke={active ? "#171713" : "#5a4d33"} strokeWidth={1.4 * u} strokeDasharray={`${3 * u} ${3 * u}`} />
              </g>
              <circle cx={cx} cy={cy} r={dot + 2.5 * u} fill="#eee9df" fillOpacity={0.9} />
              <circle cx={cx} cy={cy} r={dot} fill={active ? "#c6b38b" : "#171713"} stroke="#c6b38b" strokeWidth={1.8 * u} />
              {n && (
                <text
                  x={cx}
                  y={cy}
                  dy="0.35em"
                  textAnchor="middle"
                  fontSize={(compact ? 8.5 : 10.5) * u}
                  fontWeight={700}
                  fill={active ? "#171713" : "#eee9df"}
                  style={{ fontFamily: "Arial", pointerEvents: "none" }}
                  data-testid={`plan-pin-number-${s.id}`}
                >
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
