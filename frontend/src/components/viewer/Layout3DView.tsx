import { useState } from "react";
import { img } from "@/lib/api";
import type { ViewData } from "@/types";
import { FloorTabs } from "@/components/viewer/DenahView";
import { Watermark } from "@/components/viewer/Watermark";

export function Layout3DView({ data }: { data: ViewData }) {
  const floors = data.floors.filter((f) => f.layout3d_url);
  const [floorId, setFloorId] = useState(floors[0]?.id);
  const floor = floors.find((f) => f.id === floorId) || floors[0];
  if (!floor) return <p className="eyebrow px-5 py-16 text-paper/45 md:px-10" data-testid="layout3d-empty">Layout 3D belum tersedia</p>;
  return (
    <div className="px-5 pb-16 md:px-10" data-testid="layout3d-view">
      <FloorTabs floors={floors} value={floor.id} onChange={setFloorId} testid="layout3d-floor-tabs" />
      <div key={floor.id} className="grid gap-8 pt-8 lg:grid-cols-[1fr_320px] lg:gap-14 lg:pt-12 fade-up">
        <div className="protect relative mx-auto w-fit bg-surface">
          <img src={img(floor.layout3d_url)} alt={floor.name} className="block max-h-[calc(100dvh-220px)] w-auto max-w-full select-none object-contain" draggable={false} onContextMenu={(e) => e.preventDefault()} data-testid="layout3d-image" />
          <Watermark />
        </div>
        <div>
          <p className="eyebrow text-brass">Layout 3D</p>
          <h2 className="display mt-4 text-2xl md:text-3xl">{floor.name}</h2>
          {floor.layout3d_caption && <p className="mt-5 whitespace-pre-line text-sm leading-relaxed text-paper/65" data-testid="layout3d-caption">{floor.layout3d_caption}</p>}
        </div>
      </div>
    </div>
  );
}
