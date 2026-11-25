import { api } from "@/lib/api";

export interface Img { url: string | null; thumb: string | null }
export interface MatRef { material_id: string; version_no: number; surface: string }
export interface RefImg { file_id: string; role: string; note: string; target?: { x: number; y: number; w: number; h: number } | null; url?: string | null; thumb?: string | null }
export interface Render {
  id: string; project_id: string; room_id: string; angle_id: string; parent_id: string | null; version_no: number;
  kind: string; status: string; error: string; mode: string; model: string; quality: string; size: string; prompt?: string;
  image_roles: string[]; materials: any[]; ambience: any; master_render_id: string | null; revision: string; region: any;
  approval: string; feedback: { text: string; by: string; approval?: string; at: string }[]; adjust: Record<string, number>;
  raw: Img; graded: Img; usage: any; cost_est: number; created_at: string; created_by_name: string; width?: number; height?: number;
  project_name?: string; angle_name?: string; room_name?: string;
}
export interface Angle {
  id: string; project_id: string; room_id: string; name: string; source_file_id: string; aspect: number; instructions: string;
  materials: MatRef[]; references: RefImg[]; protection: Record<string, boolean>; controls: Record<string, any>; source: Img; latest: Render | null;
}
export interface Room { id: string; project_id: string; name: string; instructions: string; ambience_id: string | null; master_render_id: string | null }
export interface RsProject {
  id: string; name: string; code: string; client: string; designer: string; description: string; concept: string; palette: string;
  instructions: string; ambience_id: string | null; master_render_id: string | null; budget_usd: number; rooms: Room[]; angles: Angle[]; master: Render | null;
}

export const ACTIVE = ["queued", "analyzing", "rendering", "processing"];
export const STATUS_LABEL: Record<string, string> = {
  queued: "Antre", analyzing: "Menganalisis", rendering: "Merender", processing: "Memproses", completed: "Selesai", failed: "Gagal",
};
export const APPROVAL_LABEL: Record<string, string> = { pending: "Menunggu", approved: "Disetujui", rejected: "Ditolak" };
export const MAT_STATUS: Record<string, string> = { uncalibrated: "Belum dikalibrasi", testing: "Sedang dikalibrasi", approved: "Disetujui", locked: "Terkunci", draft: "Draft" };
export const REF_ROLES: Record<string, string> = {
  ambience: "Referensi suasana", approved_angle: "Render angle lain (disetujui)", material: "Material / wallpaper", furniture: "Furnitur lepas / lampu", other: "Lainnya",
};

export async function download(path: string, filename: string) {
  const r = await api.get(path, { responseType: "blob" });
  const url = URL.createObjectURL(r.data);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export const fmtDate = (s?: string) => (s ? new Date(s).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" }) : "");
