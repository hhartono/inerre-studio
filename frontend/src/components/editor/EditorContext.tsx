import { createContext, useContext } from "react";
import type { Draft, Scene } from "@/types";

export type SelKind = "project" | "tour" | "publish" | "floor" | "scene";
export interface Sel {
  kind: SelKind;
  id?: string;
}

export interface EditorCtx {
  data: Draft;
  reload: () => Promise<void>;
  replaceScene: (s: Scene) => void;
  sel: Sel;
  select: (s: Sel) => void;
  isAdmin: boolean;
}

export const EditorContext = createContext<EditorCtx | null>(null);
export const useEditor = () => useContext(EditorContext)!;

export const uid = () => (window.crypto?.randomUUID ? window.crypto.randomUUID().replace(/-/g, "") : Math.random().toString(36).slice(2) + Date.now().toString(36));
