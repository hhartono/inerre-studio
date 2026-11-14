import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg, img } from "@/lib/api";
import { useEditor } from "@/components/editor/EditorContext";
import { Label, Section, UploadButton, btnDanger, btnGhost, inputCls } from "@/components/editor/ui";
import { PlanCameraEditor } from "@/components/editor/PlanCameraEditor";
import type { Floor } from "@/types";

function RoomRow({ id, name }: { id: string; name: string }) {
  const { reload } = useEditor();
  const [v, setV] = useState(name);
  const rename = async () => {
    if (v.trim() && v !== name) {
      await api.patch(`/rooms/${id}`, { name: v.trim() }).catch((e) => toast.error(errMsg(e)));
      reload();
    }
  };
  const remove = async () => {
    if (!window.confirm(`Hapus ruangan "${name}" beserta semua scene-nya?`)) return;
    await api.delete(`/rooms/${id}`);
    reload();
  };
  return (
    <div className="flex items-center gap-3" data-testid={`room-row-${id}`}>
      <input className={inputCls} value={v} onChange={(e) => setV(e.target.value)} onBlur={rename} data-testid={`room-name-input-${id}`} />
      <button onClick={remove} className="p-2 text-paper/40 transition-colors hover:text-red-400" data-testid={`room-delete-${id}`}><Trash2 size={15} /></button>
    </div>
  );
}

export function FloorPanel({ floor }: { floor: Floor }) {
  const { data, reload, select } = useEditor();
  const [name, setName] = useState(floor.name);
  const [caption, setCaption] = useState(floor.layout3d_caption || "");
  const [busy, setBusy] = useState("");
  useEffect(() => {
    setName(floor.name);
    setCaption(floor.layout3d_caption || "");
  }, [floor.id, floor.name, floor.layout3d_caption]);

  const patch = async (body: any) => {
    await api.patch(`/floors/${floor.id}`, body).catch((e) => toast.error(errMsg(e)));
    reload();
  };
  const upload = async (kind: "plan" | "layout3d", file: File) => {
    setBusy(kind);
    const fd = new FormData();
    fd.append("file", file);
    try {
      await api.post(`/floors/${floor.id}/image/${kind}`, fd);
      toast.success(kind === "plan" ? "Denah diunggah" : "Layout 3D diunggah");
      await reload();
    } catch (e) {
      toast.error(errMsg(e));
    }
    setBusy("");
  };
  const remove = async () => {
    if (!window.confirm(`Hapus lantai "${floor.name}" beserta semua ruangan dan scene?`)) return;
    await api.delete(`/floors/${floor.id}`);
    select({ kind: "project" });
    reload();
  };
  const rooms = data.rooms.filter((r) => r.floor_id === floor.id);

  return (
    <div data-testid="floor-panel">
      <p className="eyebrow mb-3 text-brass">Lantai</p>
      <div className="mb-10 flex flex-wrap items-center gap-4">
        <input className={`${inputCls} display max-w-md text-2xl`} value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && name !== floor.name && patch({ name: name.trim() })} data-testid="floor-name-input" />
        <button onClick={remove} className={btnDanger} data-testid="floor-delete-btn">Hapus lantai</button>
      </div>

      <Section title="Denah & kamera" aside={<UploadButton label={floor.plan_url ? "Ganti denah" : "Unggah denah"} busy={busy === "plan" ? "Mengunggah…" : ""} onFiles={([f]) => upload("plan", f)} testid="upload-plan" />}>
        {floor.plan_url ? <PlanCameraEditor key={floor.id} floor={floor} /> : <p className="text-sm text-paper/45">Unggah gambar denah untuk menaruh pin kamera.</p>}
      </Section>

      <Section title="Ruangan">
        <div className="max-w-lg space-y-3">
          {rooms.map((r) => <RoomRow key={r.id} id={r.id} name={r.name} />)}
          {!rooms.length && <p className="text-sm text-paper/45">Tambah ruangan dari panel kiri.</p>}
        </div>
      </Section>

      <Section title="Layout 3D" aside={<UploadButton label={floor.layout3d_url ? "Ganti gambar" : "Unggah gambar"} busy={busy === "layout3d" ? "Mengunggah…" : ""} onFiles={([f]) => upload("layout3d", f)} testid="upload-layout3d" />}>
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          {floor.layout3d_url ? <img src={img(floor.layout3d_url)} alt="" className="w-full bg-surface object-contain" data-testid="layout3d-preview" /> : <div className="eyebrow flex aspect-video items-center justify-center bg-surface text-paper/35">Belum ada gambar</div>}
          <div>
            <Label>Keterangan</Label>
            <textarea rows={6} className={inputCls} value={caption} onChange={(e) => setCaption(e.target.value)} data-testid="layout3d-caption-input" />
            <button onClick={() => patch({ layout3d_caption: caption })} className={`${btnGhost} mt-3`} data-testid="layout3d-caption-save-btn">Simpan keterangan</button>
          </div>
        </div>
      </Section>
    </div>
  );
}
