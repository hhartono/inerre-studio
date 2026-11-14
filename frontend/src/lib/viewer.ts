import type { Floor, Room, Scene, ViewData } from "@/types";

export interface ViewMaps {
  scene: Record<string, Scene>;
  room: Record<string, Room>;
  floor: Record<string, Floor>;
  number: Record<string, number>;
}

export function buildMaps(data: { floors: Floor[]; rooms: Room[]; scenes: Scene[]; tour_order: string[] }): ViewMaps {
  const by = <T extends { id: string }>(xs: T[]) => Object.fromEntries(xs.map((x) => [x.id, x])) as Record<string, T>;
  const number: Record<string, number> = {};
  data.tour_order.forEach((id, i) => {
    number[id] = i + 1;
  });
  return { scene: by(data.scenes), room: by(data.rooms), floor: by(data.floors), number };
}

export const tourScenes = (data: ViewData | null, maps: ViewMaps | null) =>
  data && maps ? data.tour_order.map((id) => maps.scene[id]).filter(Boolean) : [];

const PIN_COLORS = ["#e07a5f", "#81b29a", "#6fa8dc", "#f2cc8f", "#c49bc4", "#e5989b", "#5fb3b3", "#d4a373", "#a3c4f3", "#c6b38b"];
export const pinColor = (n?: number) => PIN_COLORS[((n || 1) - 1) % PIN_COLORS.length];
