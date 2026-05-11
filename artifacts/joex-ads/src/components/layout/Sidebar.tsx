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
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function Sidebar() {
  const [location] = useLocation();

  const navItems = [
    { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
    { href: "/campaigns", icon: Target, label: "Campaigns" },
    { href: "/adsets", icon: Layers, label: "Ad Sets" },
    { href: "/ads", icon: ImageIcon, label: "Ads" },
    { href: "/ai-insights", icon: BrainCircuit, label: "AI Insights" },
    { href: "/ai-assistant", icon: MessageSquareText, label: "AI Assistant", badge: "NEW" },
    { href: "/creatives", icon: Palette, label: "Creatives" },
    { href: "/instagram", icon: Instagram, label: "Instagram" },
    { href: "/leads", icon: Users, label: "Leads" },
    { href: "/catalog", icon: ShoppingBag, label: "Catalog" },
    { href: "/alerts", icon: BellRing, label: "Alerts" },
    { href: "/reports", icon: FileText, label: "Reports" },
  ];

  return (
    <div className="w-64 flex-shrink-0 bg-sidebar border-r border-sidebar-border h-full flex flex-col transition-all duration-300">
      <div className="h-16 flex items-center px-6 border-b border-sidebar-border">
        <h1 className="text-xl font-bold tracking-tight text-primary drop-shadow-[0_0_8px_rgba(252,211,77,0.5)]">
          JOEX
        </h1>
        <span className="ml-2 text-xs font-medium text-sidebar-foreground/60 tracking-wider">ADS</span>
      </div>
      <div className="p-4 flex-1 overflow-y-auto space-y-1">
        {navItems.map((item) => {
          const isActive = location === item.href;
          return (
            <Link key={item.href} href={item.href} className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${isActive ? "bg-sidebar-accent text-sidebar-primary" : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"}`}>
              <item.icon className={`h-4 w-4 shrink-0 ${isActive ? "text-sidebar-primary" : "text-sidebar-foreground/70"}`} />
              <span className="flex-1">{item.label}</span>
              {"badge" in item && item.badge && (
                <Badge className="text-[8px] px-1 py-0 h-3.5 bg-secondary/20 text-secondary border-secondary/30 border font-semibold">
                  {item.badge}
                </Badge>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
