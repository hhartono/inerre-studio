import { useState } from "react";
import { List, Minus, Plus, RotateCcw } from "lucide-react";
import { TransformComponent, TransformWrapper } from "react-zoom-pan-pinch";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import type { ViewMaps } from "@/lib/viewer";
import type { Scene, ViewData } from "@/types";
import { PlanView } from "@/components/viewer/PlanView";
import { AreaList } from "@/components/viewer/AreaList";

export function FloorTabs({ floors, value, onChange, testid }: { floors: { id: string; name: string }[]; value: string; onChange: (id: string) => void; testid: string }) {
  if (floors.length < 2) return null;
  return (
    <div className="no-scrollbar flex gap-6 overflow-x-auto border-b border-paper/10" data-testid={testid}>
      {floors.map((f) => (
        <button
          key={f.id}
          onClick={() => onChange(f.id)}
          className={`eyebrow -mb-px shrink-0 border-b py-3 transition-colors ${value === f.id ? "border-brass text-brass" : "border-transparent text-paper/50 hover:text-paper"}`}
          data-testid={`${testid}-${f.id}`}
        >
          {f.name}
        </button>
      ))}
    </div>
  );
}

const zoomBtn = "glass inline-flex h-9 w-9 items-center justify-center transition-colors hover:text-brass";

export function DenahView({ data, maps, tour, currentId, onOpen }: { data: ViewData; maps: ViewMaps; tour: Scene[]; currentId?: string; onOpen: (id: string) => void }) {
  const [floorId, setFloorId] = useState(maps.scene[currentId || ""]?.floor_id || data.floors[0]?.id);
  const [roomHover, setRoomHover] = useState<string | null>(null);
  const [sheet, setSheet] = useState(false);
  const floor = maps.floor[floorId];
  const scenes = tour.filter((s) => s.floor_id === floorId);
  const rooms = data.rooms.filter((r) => r.floor_id === floorId);
  if (!floor) return <p className="eyebrow p-10 text-paper/45">Belum ada lantai</p>;

  return (
    <div className="flex flex-col md:h-[calc(100dvh-64px)] md:flex-row" data-testid="denah-view">
      <aside className="hidden w-[320px] shrink-0 overflow-y-auto border-r border-paper/10 px-8 py-10 md:block">
        <p className="eyebrow mb-2 text-paper/45">Daftar area</p>
        <h2 className="display mb-8 text-2xl">{floor.name}</h2>
        <AreaList rooms={rooms} scenes={scenes} maps={maps} activeId={currentId} onSelect={onOpen} onHoverRoom={setRoomHover} />
      </aside>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="px-5 md:px-10">
          <FloorTabs floors={data.floors} value={floorId} onChange={setFloorId} testid="denah-floor-tabs" />
        </div>
        <div className="relative min-h-[60vh] flex-1 overflow-hidden md:min-h-0">
          <TransformWrapper minScale={1} maxScale={5} centerOnInit wheel={{ step: 0.15 }} doubleClick={{ disabled: true }}>
            {({ zoomIn, zoomOut, resetTransform }) => (
              <>
                <TransformComponent wrapperStyle={{ width: "100%", height: "100%" }} contentStyle={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <div className="w-full max-w-[1100px] p-5 md:p-12">
                    <PlanView floor={floor} scenes={scenes} activeId={currentId} roomId={roomHover} numbers={maps.number} onSelect={onOpen} />
                  </div>
                </TransformComponent>
                <div className="absolute bottom-4 right-4 z-10 flex flex-col gap-2">
                  <button onClick={() => zoomIn()} className={zoomBtn} data-testid="denah-zoom-in-btn"><Plus size={14} /></button>
                  <button onClick={() => zoomOut()} className={zoomBtn} data-testid="denah-zoom-out-btn"><Minus size={14} /></button>
                  <button onClick={() => resetTransform()} className={zoomBtn} data-testid="denah-zoom-reset-btn"><RotateCcw size={14} /></button>
                </div>
              </>
            )}
          </TransformWrapper>
          <button onClick={() => setSheet(true)} className="glass eyebrow absolute bottom-4 left-4 z-10 inline-flex items-center gap-2 px-4 py-2.5 md:hidden" data-testid="mobile-area-list-btn">
            <List size={13} /> Daftar area
          </button>
        </div>
      </div>
      <Drawer open={sheet} onOpenChange={setSheet}>
        <DrawerContent className="max-h-[80vh] border-paper/10 bg-surface text-paper" data-testid="mobile-area-sheet">
          <DrawerTitle className="eyebrow px-5 pt-4 text-brass">{floor.name}</DrawerTitle>
          <div className="overflow-y-auto px-5 pb-10 pt-6">
            <AreaList rooms={rooms} scenes={scenes} maps={maps} activeId={currentId} onSelect={(id) => { setSheet(false); onOpen(id); }} />
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
