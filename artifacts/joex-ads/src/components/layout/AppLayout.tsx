import { ReactNode, useEffect, useState } from "react";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { DebugPanel } from "@/components/DebugPanel";
import { useAuthStore } from "@/store/authStore";
import { useLocation } from "wouter";

export function AppLayout({ children }: { children: ReactNode }) {
  const { token, isValidated } = useAuthStore();
  const [location, setLocation] = useLocation();
  const [debugOpen, setDebugOpen] = useState(false);

  useEffect(() => {
    if (!token && location !== "/") {
      setLocation("/");
    }
  }, [token, location, setLocation]);

  if (!token) return null;

  return (
    <div className="h-screen w-full flex overflow-hidden bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden relative">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-secondary/10 via-background to-background pointer-events-none" />
        <Topbar onToggleDebug={() => setDebugOpen((v) => !v)} debugOpen={debugOpen} />
        <main className="flex-1 overflow-y-auto p-6 relative z-0">
          {children}
        </main>
      </div>
      {debugOpen && <DebugPanel onClose={() => setDebugOpen(false)} />}
    </div>
  );
}
