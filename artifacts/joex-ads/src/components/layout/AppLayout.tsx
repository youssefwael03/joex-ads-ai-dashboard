import { ReactNode, useEffect, useState } from "react";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { DebugPanel } from "@/components/DebugPanel";
import { useAuthStore } from "@/store/authStore";
import { useLocation } from "wouter";

export function AppLayout({ children }: { children: ReactNode }) {
  const { token } = useAuthStore();
  const [location, setLocation] = useLocation();
  const [debugOpen, setDebugOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth < 1024 : false
  );

  useEffect(() => {
    if (!token && location !== "/") {
      setLocation("/");
    }
  }, [token, location, setLocation]);

  // Auto-close mobile drawer on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [location]);

  if (!token) return null;

  return (
    <div className="h-screen w-full flex overflow-hidden bg-background">
      <Sidebar
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((v) => !v)}
      />

      <div className="flex-1 flex flex-col overflow-hidden relative min-w-0">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-secondary/10 via-background to-background pointer-events-none z-0" />
        <Topbar
          onToggleDebug={() => setDebugOpen((v) => !v)}
          debugOpen={debugOpen}
          onMenuClick={() => setMobileOpen((v) => !v)}
        />
        <main className="flex-1 overflow-y-auto p-3 sm:p-4 lg:p-6 relative z-0">
          {children}
        </main>
      </div>

      {debugOpen && <DebugPanel onClose={() => setDebugOpen(false)} />}
    </div>
  );
}
