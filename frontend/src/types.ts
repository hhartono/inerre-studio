export type Role = "admin" | "designer" | "client" | "pending";

export interface Hotspot {
  id: string;
  x: number;
  y: number;
  target_scene_id: string | null;
  label: string;
}

export interface Camera {
  x: number;
  y: number;
  angle: number;
  fov: number;
}

export interface Scene {
  id: string;
  project_id: string;
  floor_id: string;
  room_id: string;
  title: string;
  description: string;
  area: string;
  image_file_id: string;
  aspect: number;
  order: number;
  hotspots: Hotspot[];
  camera: Camera | null;
  hotspots_need_check: boolean;
  description_ai?: boolean;
  image_url: string;
  thumb_url: string;
}

export interface Room {
  id: string;
  floor_id: string;
  name: string;
  order: number;
}

export interface Floor {
  id: string;
  name: string;
  order: number;
  plan_file_id: string | null;
  plan_aspect: number | null;
  plan_url: string | null;
  layout3d_file_id: string | null;
  layout3d_url: string | null;
  layout3d_caption: string;
}

export interface Revision {
  number: number;
  published_at: string;
  published_by?: string;
  scene_count?: number;
}

export interface PdfPage {
  url: string;
  aspect: number;
}

export interface ViewData {
  project: { id: string; name: string; code: string };
  mode: "draft" | "published";
  revision: Revision | null;
  music_url: string | null;
  music_title?: string | null;
  pdf_pages: PdfPage[];
  floors: Floor[];
  rooms: Room[];
  scenes: Scene[];
  tour_order: string[];
}

export interface Project {
  id: string;
  name: string;
  code: string;
  client_emails: string[];
  tour_order: string[];
  published_revision: number;
  published_at?: string;
  updated_at: string;
  scene_count?: number;
  cover_url?: string | null;
  music_name?: string | null;
  music_source?: "system" | "upload" | "none";
  music_track?: string | null;
  music_file_id?: string | null;
  pdf?: { name: string; pages: { file_id: string; aspect: number }[] } | null;
}

export interface Draft {
  project: Project;
  floors: Floor[];
  rooms: Room[];
  scenes: Scene[];
  tour_order: string[];
  revisions: Revision[];
  music_url: string | null;
  pdf_pages: PdfPage[];
}

export interface Me {
  user_id: string;
  email: string;
  emails: string[];
  name: string;
  role: Role;
}
