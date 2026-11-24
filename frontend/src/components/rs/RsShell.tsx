import { NavLink } from "react-router-dom";
import { UserButton } from "@clerk/react";
import { Brand } from "@/components/StudioShell";
import { useMe } from "@/context/MeContext";

const NAV: [string, string, boolean?][] = [
  ["/render", "Dashboard", true], ["/render/projects", "Proyek"], ["/render/studio", "Render Studio"], ["/render/materials", "Material Library"],
  ["/render/ambiences", "Ambience Library"], ["/render/history", "Riwayat Render"], ["/render/settings", "Pengaturan"],
];

const navCls = ({ isActive }: { isActive: boolean }) =>
  `eyebrow shrink-0 whitespace-nowrap text-[10px] transition-colors ${isActive ? "text-brass" : "text-paper/50 hover:text-paper"}`;

export function RsShell({ children, title, aside, bare }: { children: React.ReactNode; title?: string; aside?: React.ReactNode; bare?: boolean }) {
  const { me } = useMe();
  return (
    <div className="min-h-screen bg-ink text-paper" data-testid="rs-shell">
      <header className="sticky top-0 z-40 border-b border-paper/10 bg-ink/90 backdrop-blur-xl">
        <div className="flex h-14 items-center gap-5 px-4 md:gap-8 md:px-8">
          <Brand to="/render" />
          <span className="eyebrow hidden text-[9px] text-brass lg:inline">Render Studio</span>
          <nav className="no-scrollbar flex min-w-0 flex-1 items-center gap-5 overflow-x-auto md:gap-6" data-testid="rs-nav">
            {NAV.map(([to, label, end]) => (
              <NavLink key={to} to={to} end={end} className={navCls} data-testid={`rs-nav-${to.split("/")[2] || "dashboard"}`}>{label}</NavLink>
            ))}
            <span className="h-4 w-px shrink-0 bg-paper/15" />
            <NavLink to="/studio" className={navCls} data-testid="rs-nav-presentation">Presentasi</NavLink>
          </nav>
          <span className="eyebrow hidden text-[9px] text-paper/40 md:inline" data-testid="rs-current-role">{me?.role}</span>
          <UserButton />
        </div>
      </header>
      {bare ? children : (
        <main className="px-4 pb-24 pt-8 md:px-8 md:pt-12">
          {title && (
            <div className="mb-10 flex flex-wrap items-end justify-between gap-4 fade-up">
              <h1 className="display text-4xl text-paper sm:text-5xl">{title}</h1>
              {aside}
            </div>
          )}
          {children}
        </main>
      )}
    </div>
  );
}

export function Pill({ children, tone = "muted", testid }: { children: React.ReactNode; tone?: "muted" | "brass" | "green" | "red"; testid?: string }) {
  const cls = { muted: "border-paper/15 text-paper/55", brass: "border-brass/50 text-brass", green: "border-emerald-400/40 text-emerald-300", red: "border-red-400/40 text-red-300" }[tone];
  return <span className={`eyebrow inline-flex items-center border px-2 py-1 text-[8.5px] ${cls}`} data-testid={testid}>{children}</span>;
}

export const statusTone = (s: string) => (s === "completed" ? "green" : s === "failed" ? "red" : "brass");
export const approvalTone = (s: string) => (s === "approved" ? "green" : s === "rejected" ? "red" : "muted");
