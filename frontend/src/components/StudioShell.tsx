import { Link, NavLink } from "react-router-dom";
import { UserButton } from "@clerk/react";
import { useMe } from "@/context/MeContext";

export function Brand({ to = "/" }: { to?: string }) {
  return (
    <Link to={to} className="eyebrow text-[12px] tracking-[0.42em] text-paper transition-colors hover:text-brass" data-testid="brand-link">
      INERRE
    </Link>
  );
}

const navCls = ({ isActive }: { isActive: boolean }) =>
  `eyebrow transition-colors ${isActive ? "text-brass" : "text-paper/55 hover:text-paper"}`;

export function StudioShell({ children, title }: { children: React.ReactNode; title?: string }) {
  const { me } = useMe();
  const staff = me && ["admin", "designer"].includes(me.role);
  return (
    <div className="min-h-screen bg-ink text-paper">
      <header className="sticky top-0 z-40 border-b border-paper/10 bg-ink/85 backdrop-blur-xl">
        <div className="flex h-16 items-center gap-8 px-5 md:px-10">
          <Brand />
          <nav className="flex flex-1 items-center gap-6 overflow-x-auto no-scrollbar">
            {staff && <NavLink to="/studio" end className={navCls} data-testid="nav-studio">Studio</NavLink>}
            <NavLink to="/projects" className={navCls} data-testid="nav-client-projects">{staff ? "Tampilan Klien" : "Proyek Saya"}</NavLink>
            {me?.role === "admin" && <NavLink to="/admin" className={navCls} data-testid="nav-admin">Tim & Klien</NavLink>}
          </nav>
          <span className="eyebrow hidden text-paper/40 md:inline" data-testid="current-role">{me?.role}</span>
          <UserButton />
        </div>
      </header>
      <main className="px-5 pb-24 pt-10 md:px-10 md:pt-14">
        {title && <h1 className="display mb-10 text-4xl text-paper sm:text-5xl fade-up">{title}</h1>}
        {children}
      </main>
    </div>
  );
}
