import axios from "axios";

export const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const api = axios.create({ baseURL: `${BACKEND_URL}/api` });

let tokenGetter: (() => Promise<string | null>) | null = null;
export const setTokenGetter = (fn: () => Promise<string | null>) => {
  tokenGetter = fn;
};

api.interceptors.request.use(async (cfg) => {
  const token = tokenGetter ? await tokenGetter() : null;
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

export const img = (u?: string | null) => (u ? `${BACKEND_URL}${u}` : "");

export const errMsg = (e: any): string => {
  const d = e?.response?.data?.detail;
  if (typeof d === "string") return d;
  if (d?.message) return d.message;
  if (Array.isArray(d)) return d.map((x) => x.msg).join(", ");
  return e?.message || "Terjadi kesalahan";
};

export const pad = (n: number) => String(n).padStart(2, "0");

export const STAFF_ROLES = ["admin", "designer"];
