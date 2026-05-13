import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  Target,
  Layers,
  Image as ImageIcon,
  BrainCircuit,
  Palette,
  Instagram,
  Users,
  ShoppingBag,
  BellRing,
  FileText,
  MessageSquareText,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface SidebarProps {
  mobileOpen: boolean;
  onMobileClose: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

const NAV_ITEMS = [
  { href: "/dashboard",    icon: LayoutDashboard,   label: "Dashboard" },
  { href: "/campaigns",    icon: Target,             label: "Campaigns" },
  { href: "/adsets",       icon: Layers,             label: "Ad Sets" },
  { href: "/ads",          icon: ImageIcon,          label: "Ads" },
  { href: "/ai-insights",  icon: BrainCircuit,       label: "AI Insights" },
  { href: "/ai-assistant", icon: MessageSquareText,  label: "AI Assistant", badge: "NEW" },
  { href: "/creatives",    icon: Palette,            label: "Creatives" },
  { href: "/instagram",    icon: Instagram,          label: "Instagram" },
  { href: "/leads",        icon: Users,              label: "Leads" },
  { href: "/catalog",      icon: ShoppingBag,        label: "Catalog" },
  { href: "/alerts",       icon: BellRing,           label: "Alerts" },
  { href: "/reports",      icon: FileText,           label: "Reports" },
];

function NavContent({
  collapsed,
  location,
  onClose,
}: {
  collapsed: boolean;
  location: string;
  onClose?: () => void;
}) {
  return (
    <>
      <div
        className={`h-14 md:h-16 flex items-center border-b border-sidebar-border flex-shrink-0 ${
          collapsed ? "justify-center px-2" : "px-5 justify-between"
        }`}
      >
        {collapsed ? (
          <h1 className="text-base font-black tracking-tighter text-primary drop-shadow-[0_0_8px_rgba(245,166,35,0.6)]">
            J
          </h1>
        ) : (
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-black tracking-tighter text-primary drop-shadow-[0_0_8px_rgba(245,166,35,0.5)]">
              JOEX
            </h1>
            <span className="text-[10px] font-semibold text-sidebar-foreground/50 tracking-[0.2em] uppercase">
              ADS
            </span>
          </div>
        )}
        {onClose && (
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
            aria-label="Close menu"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {NAV_ITEMS.map((item) => {
          const isActive = location === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              onClick={onClose}
              className={`flex items-center rounded-lg text-sm font-medium transition-all duration-150 group ${
                collapsed ? "justify-center px-2 py-2.5" : "gap-3 px-3 py-2.5"
              } ${
                isActive
                  ? "bg-sidebar-accent text-sidebar-primary shadow-[inset_0_0_0_1px_hsl(var(--sidebar-primary)/0.2)]"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
              }`}
            >
              <item.icon
                className={`h-4 w-4 shrink-0 transition-colors ${
                  isActive ? "text-sidebar-primary" : "text-sidebar-foreground/60 group-hover:text-sidebar-foreground"
                }`}
              />
              {!collapsed && (
                <>
                  <span className="flex-1 truncate">{item.label}</span>
                  {"badge" in item && item.badge && (
                    <Badge className="text-[8px] px-1 py-0 h-3.5 bg-secondary/20 text-secondary border border-secondary/30 font-semibold leading-none">
                      {item.badge}
                    </Badge>
                  )}
                </>
              )}
            </Link>
          );
        })}
      </nav>
    </>
  );
}

export function Sidebar({ mobileOpen, onMobileClose, collapsed, onToggleCollapse }: SidebarProps) {
  const [location] = useLocation();

  return (
    <>
      {/* ── Mobile overlay drawer ──────────────────────────────────────────── */}
      <div
        className={`fixed inset-0 z-50 md:hidden transition-all duration-300 ${
          mobileOpen ? "pointer-events-auto" : "pointer-events-none"
        }`}
      >
        {/* Backdrop */}
        <div
          className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${
            mobileOpen ? "opacity-100" : "opacity-0"
          }`}
          onClick={onMobileClose}
        />
        {/* Drawer panel */}
        <div
          className={`absolute left-0 top-0 h-full w-72 bg-sidebar border-r border-sidebar-border flex flex-col shadow-2xl transition-transform duration-300 ease-out ${
            mobileOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <NavContent collapsed={false} location={location} onClose={onMobileClose} />
        </div>
      </div>

      {/* ── Desktop / tablet sidebar (in-flow) ────────────────────────────── */}
      <div
        className={`hidden md:flex flex-col flex-shrink-0 bg-sidebar border-r border-sidebar-border h-full transition-all duration-300 ease-in-out ${
          collapsed ? "w-16" : "w-64"
        }`}
      >
        <NavContent collapsed={collapsed} location={location} />

        {/* Collapse toggle */}
        <button
          onClick={onToggleCollapse}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="h-9 flex items-center justify-center border-t border-sidebar-border text-sidebar-foreground/40 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors flex-shrink-0"
        >
          {collapsed ? (
            <ChevronRight className="h-3.5 w-3.5" />
          ) : (
            <ChevronLeft className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
    </>
  );
}
