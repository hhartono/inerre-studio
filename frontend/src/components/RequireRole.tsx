import { Navigate } from "react-router-dom";
import { useMe } from "@/context/MeContext";

export function Splash() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-ink" data-testid="splash-loading">
      <span className="eyebrow animate-pulse text-brass">INERRE</span>
    </div>
  );
}

export function RequireRole({ roles, children }: { roles: string[]; children: React.ReactNode }) {
  const { me, loading, signedIn } = useMe();
  if (loading) return <Splash />;
  if (!signedIn) return <Navigate to="/sign-in" replace />;
  if (!me || !roles.includes(me.role)) return <Navigate to="/" replace />;
  return <>{children}</>;
}
