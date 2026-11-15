import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import ClerkAuthProvider from "@/components/auth/ClerkAuthProvider";
import { MeProvider } from "@/context/MeContext";
import { RequireRole } from "@/components/RequireRole";
import HomePage from "@/pages/HomePage";
import AuthPage from "@/pages/AuthPage";
import ClientProjects from "@/pages/ClientProjects";
import StudioProjects from "@/pages/StudioProjects";
import AdminUsers from "@/pages/AdminUsers";
import ViewerPage from "@/pages/ViewerPage";
import EditorPage from "@/pages/EditorPage";
import SharePage from "@/pages/SharePage";

const STAFF = ["admin", "designer"];
const ALL = ["admin", "designer", "client"];

export default function App() {
  return (
    <BrowserRouter>
      <ClerkAuthProvider>
        <MeProvider>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/sign-in/*" element={<AuthPage mode="in" />} />
            <Route path="/sign-up/*" element={<AuthPage mode="up" />} />
            <Route path="/projects" element={<RequireRole roles={ALL}><ClientProjects /></RequireRole>} />
            <Route path="/view/:projectId" element={<RequireRole roles={ALL}><ViewerPage mode="published" /></RequireRole>} />
            <Route path="/preview/:projectId" element={<RequireRole roles={STAFF}><ViewerPage mode="draft" /></RequireRole>} />
            <Route path="/studio" element={<RequireRole roles={STAFF}><StudioProjects /></RequireRole>} />
            <Route path="/studio/:projectId" element={<RequireRole roles={STAFF}><EditorPage /></RequireRole>} />
            <Route path="/admin" element={<RequireRole roles={["admin"]}><AdminUsers /></RequireRole>} />
            <Route path="/s/:token" element={<SharePage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </MeProvider>
        <Toaster theme="dark" position="top-center" toastOptions={{ style: { background: "#20201b", color: "#eee9df", border: "1px solid rgba(238,233,223,0.12)", borderRadius: 2 } }} />
      </ClerkAuthProvider>
    </BrowserRouter>
  );
}
