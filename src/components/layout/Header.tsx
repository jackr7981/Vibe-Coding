import { Bell, User, Sun, Moon } from "lucide-react";
import { useEffect, useState } from "react";
import { useTheme } from "../../hooks/useTheme";

function useClock() {
  const [utc, setUtc] = useState("");
  const [local, setLocal] = useState("");

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setUtc(
        now.toLocaleTimeString("en-GB", {
          timeZone: "UTC",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        })
      );
      setLocal(
        now.toLocaleTimeString("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        })
      );
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return { utc, local };
}

export function Header() {
  const { utc, local } = useClock();
  const { isDark, toggle } = useTheme();

  return (
    <header className="h-14 border-b border-border-divider bg-bg-surface/80 backdrop-blur-md flex items-center justify-between px-5 shrink-0 z-10">
      {/* Left: brand */}
      <div className="flex items-center gap-2.5">
        <div className="w-7 h-7 rounded-lg bg-accent-blue/20 border border-accent-blue/30 flex items-center justify-center">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="#2b6cff" strokeWidth="2" />
            <path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20" stroke="#2b6cff" strokeWidth="1.5" />
          </svg>
        </div>
        <span className="font-display font-bold text-sm text-text-primary tracking-wide">
          CrewTracker
        </span>
      </div>

      {/* Right: clocks + controls */}
      <div className="flex items-center gap-3">
        {/* UTC clock */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border-divider bg-bg-deepest/60">
          <span className="text-[9px] font-mono uppercase tracking-widest text-text-muted">UTC</span>
          <span className="text-[12px] font-mono font-semibold tabular-nums text-text-secondary">
            {utc}
          </span>
        </div>

        {/* Local clock */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border-divider bg-bg-deepest/60">
          <span className="text-[9px] font-mono uppercase tracking-widest text-text-muted">Local</span>
          <span className="text-[12px] font-mono font-semibold tabular-nums text-text-secondary">
            {local}
          </span>
        </div>

        <div className="w-px h-5 bg-border-divider" />

        {/* Live indicator */}
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-bg-elevated border border-border-divider">
          <div className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-success" />
          </div>
          <span className="text-[10px] font-mono font-medium text-success uppercase tracking-wider">
            Live
          </span>
        </div>

        {/* Light / dark toggle */}
        <button
          onClick={toggle}
          className="p-2 rounded-lg border border-border-divider bg-bg-elevated hover:border-accent-blue/50 transition-all"
          title={isDark ? "Switch to light mode" : "Switch to dark mode"}
        >
          {isDark ? (
            <Sun className="w-4 h-4 text-text-secondary hover:text-text-primary" />
          ) : (
            <Moon className="w-4 h-4 text-text-secondary hover:text-text-primary" />
          )}
        </button>

        {/* Bell */}
        <button className="relative p-2 text-text-secondary hover:text-text-primary transition-colors">
          <Bell className="w-4 h-4" />
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-danger rounded-full border border-bg-surface" />
        </button>

        {/* User */}
        <button className="w-7 h-7 rounded-full bg-bg-elevated border border-border-divider flex items-center justify-center text-text-secondary hover:text-text-primary hover:border-accent-blue transition-all">
          <User className="w-3.5 h-3.5" />
        </button>
      </div>
    </header>
  );
}
