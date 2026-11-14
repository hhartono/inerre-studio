import { useEffect, useRef, useState } from "react";
import { ArrowLeftRight, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg, img } from "@/lib/api";
import { clamp01 } from "@/lib/geometry";
import { uid, useEditor } from "@/components/editor/EditorContext";
import { inputCls } from "@/components/editor/ui";
import type { Hotspot, Scene } from "@/types";

function TargetSelect({ scene, value, onChange, testid }: { scene: Scene; value: string | null; onChange: (v: string) => void; testid: string }) {
  const { data } = useEditor();
  return (
    <select value={value || ""} onChange={(e) => onChange(e.target.value)} className={`${inputCls} py-2`} data-testid={testid}>
      <option value="">— Pilih scene tujuan —</option>
      {data.rooms.map((r) => {
        const list = data.scenes.filter((s) => s.room_id === r.id && s.id !== scene.id);
        if (!list.length) return null;
        return (
          <optgroup key={r.id} label={r.name}>
            {list.map((s) => <option key={s.id} value={s.id}>{s.title || "Tanpa judul"}</option>)}
          </optgroup>
        );
      })}
    </select>
  );
}

export function HotspotEditor({ scene }: { scene: Scene }) {
  const { data, replaceScene, reload } = useEditor();
  const [list, setList] = useState<Hotspot[]>(scene.hotspots);
  const [activeId, setActiveId] = useState<string | null>(null);
  const listRef = useRef(list);
  const frameRef = useRef<HTMLDivElement>(null);
  const dragId = useRef<string | null>(null);
  const justDragged = useRef(false);
  const ids = new Set(data.scenes.map((s) => s.id));

  useEffect(() => {
    setList(scene.hotspots);
    listRef.current = scene.hotspots;
  }, [scene.id, scene.hotspots]);

  const setLocal = (l: Hotspot[]) => {
    listRef.current = l;
    setList(l);
  };
  const save = async (l: Hotspot[]) => {
    setLocal(l);
    try {
      const { data: s } = await api.patch(`/scenes/${scene.id}`, { hotspots: l });
      replaceScene(s);
    } catch (e) {
      toast.error(errMsg(e));
    }
  };
  const point = (e: React.MouseEvent) => {
    const r = frameRef.current!.getBoundingClientRect();
    return { x: Math.round(clamp01((e.clientX - r.left) / r.width) * 10000) / 10000, y: Math.round(clamp01((e.clientY - r.top) / r.height) * 10000) / 10000 };
  };
  const onFrameClick = (e: React.MouseEvent) => {
    if (justDragged.current) {
      justDragged.current = false;
      return;
    }
    const h: Hotspot = { id: uid(), ...point(e), target_scene_id: null, label: "" };
    save([...listRef.current, h]);
    setActiveId(h.id);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!dragId.current) return;
    const p = point(e);
    justDragged.current = true;
    setLocal(listRef.current.map((h) => (h.id === dragId.current ? { ...h, ...p } : h)));
  };
  const onUp = () => {
    if (dragId.current && justDragged.current) save(listRef.current);
    dragId.current = null;
  };
  const edit = (id: string, patch: Partial<Hotspot>) => save(listRef.current.map((h) => (h.id === id ? { ...h, ...patch } : h)));
  const backlink = async (h: Hotspot) => {
    try {
      const { data: r } = await api.post(`/scenes/${scene.id}/backlink`, { hotspot_id: h.id });
      toast.success(r.created ? "Link balik dibuat di scene tujuan" : "Scene tujuan sudah punya link ke scene ini");
      reload();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  return (
    <div className="grid gap-8 xl:grid-cols-[1fr_340px]" data-testid="hotspot-editor">
      <div>
        <div
          ref={frameRef}
          className="relative w-full cursor-crosshair select-none bg-surface"
          style={{ aspectRatio: `${scene.aspect || 1.5}` }}
          onClick={onFrameClick}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerLeave={onUp}
          data-testid="hotspot-canvas"
        >
          <img src={img(scene.image_url)} alt="" className="absolute inset-0 h-full w-full object-cover" draggable={false} />
          {list.map((h, i) => {
            const broken = !h.target_scene_id || !ids.has(h.target_scene_id);
            return (
              <button
                key={h.id}
                className="absolute z-10 flex -translate-x-1/2 -translate-y-1/2 cursor-grab items-center active:cursor-grabbing"
                style={{ left: `${h.x * 100}%`, top: `${h.y * 100}%` }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  dragId.current = h.id;
                  justDragged.current = false;
                  setActiveId(h.id);
                }}
                onClick={(e) => e.stopPropagation()}
                data-testid={`edit-hotspot-${h.id}`}
              >
                <span className={`flex h-7 w-7 items-center justify-center rounded-full border-2 text-[10px] font-bold shadow-lg transition-transform ${activeId === h.id ? "scale-125" : ""} ${broken ? "border-red-400 bg-red-500/70 text-white" : "border-white bg-ink/70 text-paper"}`}>
                  {i + 1}
                </span>
              </button>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-paper/45">Klik di render untuk menambah hotspot. Seret titik untuk memindahkan.</p>
      </div>

      <div className="space-y-3" data-testid="hotspot-list">
        {list.length === 0 && <p className="text-sm text-paper/45">Belum ada hotspot.</p>}
        {list.map((h, i) => {
          const broken = !h.target_scene_id || !ids.has(h.target_scene_id);
          return (
            <div key={h.id} onClick={() => setActiveId(h.id)} className={`space-y-2.5 border p-3 transition-colors ${activeId === h.id ? "border-brass/60 bg-surface" : "border-paper/10"}`} data-testid={`hotspot-row-${h.id}`}>
              <div className="flex items-center justify-between">
                <span className="eyebrow text-paper/50">Hotspot {i + 1}</span>
                {broken && <span className="eyebrow text-[9px] text-red-300" data-testid={`hotspot-broken-${h.id}`}>{h.target_scene_id ? "Tujuan hilang" : "Belum ada tujuan"}</span>}
              </div>
              <TargetSelect scene={scene} value={h.target_scene_id && ids.has(h.target_scene_id) ? h.target_scene_id : null} onChange={(v) => edit(h.id, { target_scene_id: v || null })} testid={`hotspot-target-${h.id}`} />
              <input key={`${h.id}-${h.label}`} defaultValue={h.label} placeholder="Label, mis. Ke Dapur" className={`${inputCls} py-2`} onBlur={(e) => e.target.value !== h.label && edit(h.id, { label: e.target.value })} data-testid={`hotspot-label-${h.id}`} />
              <div className="flex gap-2">
                <button disabled={broken} onClick={() => backlink(h)} className="eyebrow inline-flex flex-1 items-center justify-center gap-2 border border-paper/15 py-2 text-[9.5px] transition-colors hover:border-brass hover:text-brass disabled:opacity-30" data-testid={`hotspot-backlink-${h.id}`}>
                  <ArrowLeftRight size={12} /> Buat link balik
                </button>
                <button onClick={() => save(listRef.current.filter((x) => x.id !== h.id))} className="border border-paper/15 px-3 text-paper/50 transition-colors hover:border-red-400 hover:text-red-400" data-testid={`hotspot-delete-${h.id}`}>
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
