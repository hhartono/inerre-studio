import { img } from "@/lib/api";
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

const PIN_COLORS = ["#e4572e", "#2a9d8f", "#3a86ff", "#e9a100", "#b5179e", "#8ac926", "#1d4e89", "#ff4d8d", "#6a994e", "#a47148"];
export const pinColor = (n?: number) => PIN_COLORS[((n || 1) - 1) % PIN_COLORS.length];

export const mediaSrc = (u?: string | null) => (u ? (u.startsWith("/api/") ? img(u) : u) : "");
