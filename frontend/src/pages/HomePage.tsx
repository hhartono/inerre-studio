import { Link, Navigate } from "react-router-dom";
import { SignOutButton } from "@clerk/react";
import { useMe } from "@/context/MeContext";
import { Splash } from "@/components/RequireRole";

function Landing() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-ink" data-testid="landing-page">
      <img src="/hero-interior.jpg" alt="" className="absolute inset-0 h-full w-full object-cover opacity-40" />
      <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/70 to-ink/20" />
      <div className="relative flex min-h-screen flex-col justify-between px-6 py-8 md:px-16 md:py-14">
        <span className="eyebrow text-[12px] tracking-[0.42em]">INERRE</span>
        <div className="max-w-2xl fade-up">
          <p className="eyebrow mb-6 text-brass">Presentation System</p>
          <h1 className="display text-4xl leading-[1.05] sm:text-5xl lg:text-6xl">Walkthrough interior, disajikan ruang demi ruang.</h1>
          <p className="mt-6 max-w-md text-sm text-paper/65 md:text-base">
            Masuk untuk menjelajah render, denah, dan layout 3D proyek Anda.
          </p>
          <Link
            to="/sign-in"
            className="eyebrow mt-10 inline-flex items-center gap-4 border border-brass/60 px-7 py-4 text-brass transition-colors duration-300 hover:bg-brass hover:text-ink"
            data-testid="landing-sign-in-btn"
          >
            Masuk
          </Link>
        </div>
        <p className="eyebrow text-paper/35">Akses hanya untuk tim dan klien terdaftar</p>
      </div>
    </div>
  );
}

function Pending({ email }: { email?: string }) {
  return (
    <div className="flex min-h-screen flex-col justify-center bg-ink px-6 md:px-16" data-testid="pending-page">
      <p className="eyebrow mb-6 text-brass">Menunggu akses</p>
      <h1 className="display max-w-xl text-3xl sm:text-4xl">Akun Anda sudah terdaftar, tetapi belum diberi akses.</h1>
      <p className="mt-5 max-w-md text-sm text-paper/60">
        Hubungi tim INERRE agar admin menambahkan {email || "email Anda"} sebagai klien atau anggota tim.
      </p>
      <SignOutButton>
        <button className="eyebrow mt-10 w-fit border border-paper/20 px-6 py-3 transition-colors hover:border-brass hover:text-brass" data-testid="pending-sign-out-btn">
          Keluar
        </button>
      </SignOutButton>
    </div>
  );
}

export default function HomePage() {
  const { me, loading, signedIn } = useMe();
  if (loading) return <Splash />;
  if (!signedIn) return <Landing />;
  if (!me) return <Pending />;
  if (me.role === "admin" || me.role === "designer") return <Navigate to="/studio" replace />;
  if (me.role === "client") return <Navigate to="/projects" replace />;
  return <Pending email={me.email} />;
}
