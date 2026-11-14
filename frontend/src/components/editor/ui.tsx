import { useState } from "react";
import { Plus } from "lucide-react";

export const btn = "eyebrow inline-flex items-center justify-center gap-2 bg-brass px-5 py-3 text-ink transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40";
export const btnGhost = "eyebrow inline-flex items-center justify-center gap-2 border border-paper/15 px-4 py-2.5 text-paper/80 transition-colors hover:border-brass hover:text-brass disabled:opacity-40";
export const btnDanger = "eyebrow inline-flex items-center justify-center gap-2 border border-red-400/30 px-4 py-2.5 text-red-300 transition-colors hover:bg-red-400/10";
export const inputCls = "w-full border border-paper/15 bg-ink px-3 py-2.5 text-sm text-paper outline-none transition-colors placeholder:text-paper/30 focus:border-brass";

export function Label({ children }: { children: React.ReactNode }) {
  return <p className="eyebrow mb-2.5 text-paper/45">{children}</p>;
}

export function Section({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="border-t border-paper/10 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <p className="eyebrow text-brass">{title}</p>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function UploadButton({ label, multiple, onFiles, testid, busy }: { label: string; multiple?: boolean; onFiles: (f: File[]) => void; testid: string; busy?: string }) {
  return (
    <label className={`${btnGhost} cursor-pointer ${busy ? "pointer-events-none opacity-60" : ""}`} data-testid={testid}>
      {busy || label}
      <input
        type="file"
        accept="image/*"
        multiple={multiple}
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files || []);
          e.target.value = "";
          if (files.length) onFiles(files);
        }}
        data-testid={`${testid}-input`}
      />
    </label>
  );
}

export function InlineAdd({ label, placeholder, onAdd, testid }: { label: string; placeholder: string; onAdd: (v: string) => Promise<void>; testid: string }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="eyebrow inline-flex items-center gap-2 py-1.5 text-[9.5px] text-paper/45 transition-colors hover:text-brass" data-testid={testid}>
        <Plus size={11} /> {label}
      </button>
    );
  }
  return (
    <form
      className="flex gap-2 py-1"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!value.trim()) return;
        await onAdd(value.trim());
        setValue("");
        setOpen(false);
      }}
    >
      <input autoFocus value={value} onChange={(e) => setValue(e.target.value)} onBlur={() => !value && setOpen(false)} placeholder={placeholder} className={`${inputCls} py-1.5`} data-testid={`${testid}-input`} />
      <button className="eyebrow bg-brass px-3 text-[9.5px] text-ink" data-testid={`${testid}-submit`}>OK</button>
    </form>
  );
}
