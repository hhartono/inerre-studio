import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg } from "@/lib/api";
import { useEditor } from "@/components/editor/EditorContext";
import { Label, Section, UploadButton, btn, btnDanger, inputCls } from "@/components/editor/ui";
import { HotspotEditor } from "@/components/editor/HotspotEditor";
import type { Scene } from "@/types";

export function ScenePanel({ scene }: { scene: Scene }) {
  const { data, replaceScene, reload, select } = useEditor();
  const [form, setForm] = useState({ title: scene.title, area: scene.area, description: scene.description, room_id: scene.room_id });
  const [busy, setBusy] = useState("");
  useEffect(() => {
    setForm({ title: scene.title, area: scene.area, description: scene.description, room_id: scene.room_id });
  }, [scene.id, scene.title, scene.area, scene.description, scene.room_id]);

  const set = (k: string) => (e: any) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const saveInfo = async () => {
    try {
      const { data: s } = await api.patch(`/scenes/${scene.id}`, form);
      replaceScene(s);
      toast.success("Scene disimpan");
      if (s.room_id !== scene.room_id) reload();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };
  const replace = async (file: File) => {
    setBusy("Mengunggah…");
    const fd = new FormData();
    fd.append("file", file);
    try {
      const { data: s } = await api.post(`/scenes/${scene.id}/image`, fd);
      replaceScene(s);
      toast.success(s.hotspots_need_check ? "Render diganti. Rasio berbeda, cek hotspot." : "Render diganti");
    } catch (e) {
      toast.error(errMsg(e));
    }
    setBusy("");
  };
  const confirm = async () => {
    const { data: s } = await api.post(`/scenes/${scene.id}/confirm-hotspots`);
    replaceScene(s);
    toast.success("Hotspot dikonfirmasi");
  };
  const remove = async () => {
    if (!window.confirm("Hapus scene ini? Hotspot yang mengarah ke scene ini akan ditandai rusak.")) return;
    await api.delete(`/scenes/${scene.id}`);
    select({ kind: "project" });
    reload();
  };
  const room = data.rooms.find((r) => r.id === scene.room_id);
  const floor = data.floors.find((f) => f.id === scene.floor_id);

  return (
    <div data-testid="scene-panel">
      <p className="eyebrow mb-3 text-brass">{floor?.name} / {room?.name}</p>
      <h2 className="display mb-8 text-3xl">{scene.title || "Tanpa judul"}</h2>

      {scene.hotspots_need_check && (
        <div className="mb-8 flex flex-wrap items-center gap-4 border border-amber-300/40 bg-amber-300/5 p-4" data-testid="needs-check-banner">
          <AlertTriangle size={16} className="text-amber-300" />
          <p className="flex-1 text-sm text-amber-100">Render diganti dengan rasio berbeda. Cek posisi hotspot, lalu konfirmasi. Publikasi diblokir sampai dikonfirmasi.</p>
          <button onClick={confirm} className={btn} data-testid="confirm-hotspots-btn">Hotspot sudah dicek</button>
        </div>
      )}

      <Section title="Hotspot" aside={<UploadButton label="Ganti render" busy={busy} onFiles={([f]) => replace(f)} testid="replace-render" />}>
        <HotspotEditor scene={scene} />
      </Section>

      <Section title="Cerita scene">
        <div className="grid max-w-3xl gap-6 sm:grid-cols-2">
          <div>
            <Label>Judul</Label>
            <input className={inputCls} value={form.title} onChange={set("title")} data-testid="scene-title-input" />
          </div>
          <div>
            <Label>Area</Label>
            <input className={inputCls} value={form.area} onChange={set("area")} data-testid="scene-area-input" />
          </div>
          <div className="sm:col-span-2">
            <Label>Deskripsi</Label>
            <textarea rows={5} className={inputCls} value={form.description} onChange={set("description")} data-testid="scene-description-input" />
          </div>
          <div>
            <Label>Ruangan</Label>
            <select className={inputCls} value={form.room_id} onChange={set("room_id")} data-testid="scene-room-select">
              {data.floors.map((f) => (
                <optgroup key={f.id} label={f.name}>
                  {data.rooms.filter((r) => r.floor_id === f.id).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </optgroup>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-8 flex flex-wrap gap-3">
          <button onClick={saveInfo} className={btn} data-testid="scene-save-btn">Simpan</button>
          <button onClick={remove} className={btnDanger} data-testid="scene-delete-btn">Hapus scene</button>
        </div>
      </Section>
    </div>
  );
}
