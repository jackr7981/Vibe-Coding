import { useState } from "react";
import { NavLink } from "react-router-dom";
import { cn } from "../../lib/utils";
import {
  LayoutDashboard,
  Users,
  Ship,
  Map,
  RefreshCw,
  FileText,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Anchor,
} from "lucide-react";

const NAV_ITEMS = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/crew", icon: Users, label: "Crew" },
  { to: "/vessels", icon: Ship, label: "Vessels" },
  { to: "/itineraries", icon: Map, label: "Itineraries" },
  { to: "/crew-changes", icon: RefreshCw, label: "Crew Changes" },
  { to: "/documents", icon: FileText, label: "Documents" },
  { to: "/reports", icon: BarChart3, label: "Reports" },
];

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={cn(
        "h-full bg-bg-surface border-r border-border-divider flex flex-col transition-all duration-300 z-20 relative",
        collapsed ? "w-16" : "w-60"
      )}
    >
      <div className="h-16 flex items-center px-4 border-b border-border-divider shrink-0">
        <div className="flex items-center gap-3 text-accent-blue">
          <Anchor className="w-6 h-6 shrink-0" />
          {!collapsed && (
            <span className="font-display font-bold text-lg tracking-wide text-text-primary whitespace-nowrap">
              CrewTracker
            </span>
          )}
        </div>
      </div>

      <nav className="flex-1 py-4 flex flex-col gap-1 px-2 overflow-y-auto overflow-x-hidden">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 px-2.5 py-2.5 rounded-lg transition-all duration-200 group relative",
                isActive
                  ? "bg-bg-elevated text-accent-blue"
                  : "text-text-secondary hover:bg-bg-elevated/50 hover:text-text-primary"
              )
            }
            title={collapsed ? item.label : undefined}
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-accent-blue rounded-r-full shadow-[0_0_8px_rgba(43,108,255,0.6)]" />
                )}
                <item.icon
                  className={cn(
                    "w-5 h-5 shrink-0",
                    isActive
                      ? "text-accent-blue"
                      : "text-text-muted group-hover:text-text-secondary"
                  )}
                />
                {!collapsed && (
                  <span className="font-medium text-sm whitespace-nowrap">
                    {item.label}
                  </span>
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="p-2 border-t border-border-divider">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-full flex items-center justify-center p-2 rounded-lg text-text-muted hover:bg-bg-elevated hover:text-text-primary transition-colors"
        >
          {collapsed ? (
            <ChevronRight className="w-5 h-5" />
          ) : (
            <ChevronLeft className="w-5 h-5" />
          )}
        </button>
      </div>
    </aside>
  );
}
