import { SignIn, SignUp } from "@clerk/react";

export default function AuthPage({ mode }: { mode: "in" | "up" }) {
  return (
    <div className="flex min-h-screen bg-ink" data-testid={`auth-page-${mode}`}>
      <div className="relative hidden flex-1 overflow-hidden lg:flex">
        <img src="/hero-interior.jpg" alt="" className="absolute inset-0 h-full w-full object-cover opacity-60" />
        <div className="absolute inset-0 bg-gradient-to-r from-ink/30 to-ink" />
        <div className="relative flex flex-col justify-between p-14">
          <span className="eyebrow text-[12px] tracking-[0.42em]">INERRE</span>
          <p className="display max-w-sm text-3xl leading-tight">Setiap ruang punya ceritanya.</p>
        </div>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-12">
        <span className="eyebrow mb-8 text-[12px] tracking-[0.42em] lg:hidden">INERRE</span>
        {mode === "in" ? (
          <SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" withSignUp />
        ) : (
          <SignUp routing="path" path="/sign-up" signInUrl="/sign-in" />
        )}
      </div>
    </div>
  );
}
