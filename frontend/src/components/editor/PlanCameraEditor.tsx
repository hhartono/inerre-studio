import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Slider } from "@/components/ui/slider";
import { api, errMsg, img } from "@/lib/api";
import { PLAN_W, clamp01, conePath, planHeight } from "@/lib/geometry";
import { pinColor } from "@/lib/viewer";
import { useEditor } from "@/components/editor/EditorContext";
import { btnGhost } from "@/components/editor/ui";
import type { Camera, Floor } from "@/types";

export function PlanCameraEditor({ floor }: { floor: Floor }) {
  const { data, replaceScene } = useEditor();
  const scenes = data.scenes.filter((s) => s.floor_id === floor.id);
  const rooms = data.rooms.filter((r) => r.floor_id === floor.id);
  const [selId, setSelId] = useState<string | undefined>(scenes[0]?.id);
  const [live, setLive] = useState<Camera | null>(null);
  const liveRef = useRef<Camera | null>(null);
  const dragging = useRef(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const sel = scenes.find((s) => s.id === selId);
  const H = planHeight(floor.plan_aspect);
  const num = (id: string) => data.tour_order.indexOf(id) + 1;

  useEffect(() => {
    setLive(null);
    liveRef.current = null;
  }, [selId]);

  const update = (c: Camera | null) => {
    liveRef.current = c;
    setLive(c);
  };
  const toPlan = (e: React.PointerEvent) => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: clamp01((e.clientX - r.left) / r.width), y: clamp01((e.clientY - r.top) / r.height) };
  };
  const save = async (cam: Camera | null) => {
    if (!sel) return;
    try {
      const body = cam ? { camera: { ...cam, angle: Math.round(cam.angle * 10) / 10 } } : { clear_camera: true };
      const { data: s } = await api.patch(`/scenes/${sel.id}`, body);
      replaceScene(s);
    } catch (e) {
      toast.error(errMsg(e));
    }
    update(null);
  };

  const onDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!sel) return toast.message("Pilih scene dulu di daftar kiri");
    const p = toPlan(e);
    update({ x: p.x, y: p.y, angle: sel.camera?.angle ?? 0, fov: sel.camera?.fov ?? 60 });
    dragging.current = true;
    svgRef.current?.setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    const c = liveRef.current;
    if (!dragging.current || !c) return;
    const p = toPlan(e);
    const dx = (p.x - c.x) * PLAN_W;
    const dy = (p.y - c.y) * H;
    if (Math.hypot(dx, dy) > 12) update({ ...c, angle: (Math.atan2(dy, dx) * 180) / Math.PI });
  };
  const onUp = () => {
    if (!dragging.current) return;
    dragging.current = false;
    save(liveRef.current);
  };

  const cam = (id: string) => (id === selId && live ? live : scenes.find((s) => s.id === id)?.camera);
  const fov = live?.fov ?? sel?.camera?.fov ?? 60;

  return (
    <div className="grid gap-6 lg:grid-cols-[220px_1fr]" data-testid="plan-camera-editor">
      <div className="max-h-[520px] space-y-5 overflow-y-auto pr-2">
        {rooms.map((r) => (
          <div key={r.id}>
            <p className="eyebrow mb-2 text-paper/40">{r.name}</p>
            {scenes.filter((s) => s.room_id === r.id).map((s) => (
              <button key={s.id} onClick={() => setSelId(s.id)} className={`flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs transition-colors ${s.id === selId ? "bg-surface text-brass" : "text-paper/65 hover:text-paper"}`} data-testid={`camera-scene-${s.id}`}>
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: s.camera ? pinColor(num(s.id)) : "rgba(238,233,223,0.2)" }} />
                <span className="eyebrow w-5 shrink-0 text-[9px] text-paper/40">{String(num(s.id)).padStart(2, "0")}</span>
                <span className="truncate">{s.title || "Tanpa judul"}</span>
              </button>
            ))}
          </div>
        ))}
        {!scenes.length && <p className="text-xs text-paper/40">Unggah render ke ruangan di lantai ini dulu.</p>}
      </div>
      <div>
        <div className="relative w-full select-none bg-surface" style={{ aspectRatio: `${floor.plan_aspect || 1.4}` }}>
          <img src={img(floor.plan_url)} alt="" className="absolute inset-0 h-full w-full object-contain" draggable={false} />
          <svg ref={svgRef} viewBox={`0 0 ${PLAN_W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full cursor-crosshair touch-none" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} data-testid="camera-plan-canvas">
            {scenes.map((s) => {
              const c = cam(s.id);
              if (!c) return null;
              const active = s.id === selId;
              const color = pinColor(num(s.id));
              return (
                <g key={`c-${s.id}`} style={{ opacity: active ? 1 : 0.7 }}>
                  <path d={conePath(c.x * PLAN_W, c.y * H, c.angle, c.fov, active ? 80 : 60)} fill={color} fillOpacity={active ? 0.6 : 0.4} stroke={color} strokeWidth={2} />
                </g>
              );
            })}
            {scenes.map((s) => {
              const c = cam(s.id);
              if (!c) return null;
              const active = s.id === selId;
              const color = pinColor(num(s.id));
              return (
                <g key={s.id} onPointerDown={(e) => { if (!active) { e.stopPropagation(); setSelId(s.id); } }} className="cursor-pointer" data-testid={`camera-pin-${s.id}`}>
                  <circle cx={c.x * PLAN_W} cy={c.y * H} r={active ? 17 : 13} fill={active ? "#ffffff" : "#171713"} />
                  <circle cx={c.x * PLAN_W} cy={c.y * H} r={active ? 14 : 11} fill={color} />
                  <text x={c.x * PLAN_W} y={c.y * H} dy="0.36em" textAnchor="middle" fontSize={active ? 13 : 11} fontWeight={700} fill="#171713" style={{ fontFamily: "Arial", pointerEvents: "none" }}>
                    {String(num(s.id)).padStart(2, "0")}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-6">
          <p className="text-xs text-paper/45">Klik untuk menaruh kamera, seret untuk mengatur arah pandang.</p>
          <div className="flex min-w-[240px] flex-1 items-center gap-4">
            <span className="eyebrow shrink-0 text-paper/45">Lebar {Math.round(fov)}°</span>
            <Slider
              min={15}
              max={150}
              step={1}
              value={[fov]}
              disabled={!sel?.camera && !live}
              onValueChange={([v]) => update({ ...(liveRef.current || sel!.camera!), fov: v })}
              onValueCommit={() => save(liveRef.current)}
              data-testid="camera-fov-slider"
            />
          </div>
          {sel?.camera && <button onClick={() => save(null)} className={btnGhost} data-testid="camera-clear-btn">Hapus kamera</button>}
        </div>
      </div>
    </div>
  );
}
