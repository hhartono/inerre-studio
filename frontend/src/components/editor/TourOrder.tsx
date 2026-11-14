import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, GripVertical } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg, img, pad } from "@/lib/api";
import { useEditor } from "@/components/editor/EditorContext";
import { btn } from "@/components/editor/ui";

export function TourOrder() {
  const { data, reload } = useEditor();
  const [order, setOrder] = useState<string[]>(data.tour_order);
  const [dirty, setDirty] = useState(false);
  const dragIdx = useRef<number | null>(null);
  const byId = Object.fromEntries(data.scenes.map((s) => [s.id, s]));
  const roomName = Object.fromEntries(data.rooms.map((r) => [r.id, r.name]));

  useEffect(() => {
    setOrder(data.tour_order);
    setDirty(false);
  }, [data.tour_order]);

  const move = (from: number, to: number) => {
    if (to < 0 || to >= order.length || from === to) return;
    const next = [...order];
    const [x] = next.splice(from, 1);
    next.splice(to, 0, x);
    setOrder(next);
    setDirty(true);
  };
  const save = async () => {
    try {
      await api.put(`/projects/${data.project.id}/tour`, { order });
      toast.success("Urutan tur disimpan");
      reload();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  return (
    <div className="max-w-3xl" data-testid="tour-order-panel">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow mb-3 text-brass">Urutan tur autoplay</p>
          <h2 className="display text-3xl">Seret untuk mengurutkan</h2>
        </div>
        <button disabled={!dirty} onClick={save} className={btn} data-testid="tour-save-btn">Simpan urutan</button>
      </div>
      <ol className="space-y-1.5">
        {order.map((id, i) => {
          const s = byId[id];
          if (!s) return null;
          return (
            <li
              key={id}
              draggable
              onDragStart={() => (dragIdx.current = i)}
              onDragOver={(e) => {
                e.preventDefault();
                if (dragIdx.current !== null && dragIdx.current !== i) {
                  move(dragIdx.current, i);
                  dragIdx.current = i;
                }
              }}
              onDragEnd={() => (dragIdx.current = null)}
              className="flex cursor-grab items-center gap-4 border border-paper/10 bg-ink p-2 transition-colors hover:border-paper/25 active:cursor-grabbing"
              data-testid={`tour-item-${id}`}
            >
              <GripVertical size={14} className="shrink-0 text-paper/30" />
              <span className="eyebrow w-7 text-brass">{pad(i + 1)}</span>
              <img src={img(s.thumb_url)} alt="" className="h-10 w-16 object-cover" draggable={false} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{s.title || "Tanpa judul"}</p>
                <p className="text-xs text-paper/40">{roomName[s.room_id]}</p>
              </div>
              <button onClick={() => move(i, i - 1)} className="p-1.5 text-paper/40 hover:text-brass" data-testid={`tour-up-${id}`}><ChevronUp size={15} /></button>
              <button onClick={() => move(i, i + 1)} className="p-1.5 text-paper/40 hover:text-brass" data-testid={`tour-down-${id}`}><ChevronDown size={15} /></button>
            </li>
          );
        })}
      </ol>
      {!order.length && <p className="text-sm text-paper/45">Belum ada scene.</p>}
    </div>
  );
}
