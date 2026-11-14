import { pad } from "@/lib/api";
import { pinColor } from "@/lib/viewer";
import type { ViewMaps } from "@/lib/viewer";
import type { Room, Scene } from "@/types";

interface Props {
  rooms: Room[];
  scenes: Scene[];
  maps: ViewMaps;
  activeId?: string;
  onSelect: (sceneId: string) => void;
  onHoverRoom?: (roomId: string | null) => void;
}

export function AreaList({ rooms, scenes, maps, activeId, onSelect, onHoverRoom }: Props) {
  return (
    <div className="space-y-7" data-testid="area-list">
      {rooms.map((room) => {
        const list = scenes.filter((s) => s.room_id === room.id).sort((a, b) => (maps.number[a.id] || 0) - (maps.number[b.id] || 0));
        if (!list.length) return null;
        return (
          <div key={room.id} onMouseEnter={() => onHoverRoom?.(room.id)} onMouseLeave={() => onHoverRoom?.(null)} data-testid={`area-group-${room.id}`}>
            <p className="eyebrow mb-3 text-brass">{room.name}</p>
            <ul className="space-y-0.5">
              {list.map((s) => (
                <li key={s.id}>
                  <button
                    onClick={() => onSelect(s.id)}
                    className={`flex w-full items-baseline gap-4 py-2 text-left text-sm transition-colors ${s.id === activeId ? "text-paper" : "text-paper/55 hover:text-paper"}`}
                    data-testid={`area-scene-${s.id}`}
                  >
                    <span className="eyebrow w-6 shrink-0 text-paper/35">{pad(maps.number[s.id] || 0)}</span>
                    <span className="h-2 w-2 shrink-0 self-center rounded-full" style={{ background: pinColor(maps.number[s.id]) }} data-testid={`area-scene-color-${s.id}`} />
                    <span className="truncate">{s.title || "Tanpa judul"}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
