import { useState } from "react";
import { AlertTriangle, ListOrdered, Rocket, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg, img } from "@/lib/api";
import { useEditor } from "@/components/editor/EditorContext";
import { InlineAdd, UploadButton } from "@/components/editor/ui";

const rowCls = (active: boolean) =>
  `flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors ${active ? "bg-surface text-brass" : "text-paper/75 hover:bg-surface/60 hover:text-paper"}`;

export function StructureTree() {
  const { data, sel, select, reload } = useEditor();
  const [busy, setBusy] = useState<Record<string, string>>({});
  const pid = data.project.id;

  const addFloor = async (name: string) => {
    const r = await api.post(`/projects/${pid}/floors`, { name }).catch((e) => toast.error(errMsg(e)));
    await reload();
    if (r) select({ kind: "floor", id: r.data.id });
  };
  const addRoom = async (fid: string, name: string) => {
    await api.post(`/floors/${fid}/rooms`, { name }).catch((e) => toast.error(errMsg(e)));
    await reload();
  };
  const upload = async (rid: string, files: File[]) => {
    let failed = 0;
    for (let i = 0; i < files.length; i++) {
      setBusy((b) => ({ ...b, [rid]: `Mengunggah ${i + 1}/${files.length}` }));
      const fd = new FormData();
      fd.append("file", files[i]);
      await api.post(`/rooms/${rid}/scenes`, fd).catch((e) => {
        failed++;
        toast.error(`${files[i].name}: ${errMsg(e)}`);
      });
    }
    setBusy((b) => ({ ...b, [rid]: "" }));
    if (files.length - failed) toast.success(`${files.length - failed} render diunggah`);
    await reload();
  };

  return (
    <nav className="space-y-1 py-4" data-testid="structure-tree">
      <button className={rowCls(sel.kind === "project")} onClick={() => select({ kind: "project" })} data-testid="tree-project-settings"><Settings2 size={14} /> Pengaturan proyek</button>
      <button className={rowCls(sel.kind === "tour")} onClick={() => select({ kind: "tour" })} data-testid="tree-tour-order"><ListOrdered size={14} /> Urutan tur</button>
      <button className={rowCls(sel.kind === "publish")} onClick={() => select({ kind: "publish" })} data-testid="tree-publish"><Rocket size={14} /> Validasi & publikasi</button>

      <div className="px-3 pb-2 pt-8">
        <p className="eyebrow text-paper/40">Lantai & ruangan</p>
      </div>
      {data.floors.map((f) => (
        <div key={f.id} className="pb-3">
          <button className={`${rowCls(sel.kind === "floor" && sel.id === f.id)} eyebrow`} onClick={() => select({ kind: "floor", id: f.id })} data-testid={`tree-floor-${f.id}`}>
            {f.name}
          </button>
          <div className="ml-3 border-l border-paper/10 pl-2">
            {data.rooms.filter((r) => r.floor_id === f.id).map((r) => (
              <div key={r.id} className="py-1.5" data-testid={`tree-room-${r.id}`}>
                <p className="px-3 py-1 text-xs text-paper/50">{r.name}</p>
                {data.scenes.filter((s) => s.room_id === r.id).map((s) => (
                  <button key={s.id} className={rowCls(sel.kind === "scene" && sel.id === s.id)} onClick={() => select({ kind: "scene", id: s.id })} data-testid={`tree-scene-${s.id}`}>
                    <img src={img(s.thumb_url)} alt="" className="h-7 w-10 shrink-0 object-cover" />
                    <span className="min-w-0 flex-1 truncate text-xs">{s.title || "Tanpa judul"}</span>
                    {s.hotspots_need_check && <AlertTriangle size={12} className="shrink-0 text-amber-300" />}
                  </button>
                ))}
                <div className="px-3 pt-1.5">
                  <UploadButton label="+ Render" multiple busy={busy[r.id]} onFiles={(fs) => upload(r.id, fs)} testid={`upload-renders-${r.id}`} />
                </div>
              </div>
            ))}
            <div className="px-3">
              <InlineAdd label="Ruangan" placeholder="Nama ruangan" onAdd={(n) => addRoom(f.id, n)} testid={`add-room-${f.id}`} />
            </div>
          </div>
        </div>
      ))}
      <div className="px-3">
        <InlineAdd label="Lantai" placeholder="Nama lantai" onAdd={addFloor} testid="add-floor" />
      </div>
    </nav>
  );
}
