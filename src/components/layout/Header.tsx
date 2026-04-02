import { Search, Bell, Upload, User } from "lucide-react";
import { useCrewStore } from "../../stores/crewStore";

interface HeaderProps {
  onUploadClick?: () => void;
}

export function Header({ onUploadClick }: HeaderProps) {
  const { setFilters } = useCrewStore();

  return (
    <header className="h-16 border-b border-border-divider bg-bg-surface/80 backdrop-blur-md flex items-center justify-between px-6 shrink-0 z-10">
      <div className="flex-1 max-w-md">
        <div className="relative group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted group-focus-within:text-accent-blue transition-colors" />
          <input
            type="text"
            placeholder="Search crew, vessels, PNR..."
            onChange={(e) => setFilters({ search: e.target.value })}
            className="w-full bg-bg-deepest border border-border-divider rounded-lg pl-10 pr-4 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-blue focus:ring-1 focus:ring-accent-blue/50 transition-all"
          />
        </div>
      </div>

      <div className="flex items-center gap-4">
        {onUploadClick && (
          <button
            onClick={onUploadClick}
            className="glass-button flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-text-primary"
          >
            <Upload className="w-4 h-4 text-accent-blue" />
            Upload Tickets
          </button>
        )}

        <div className="w-px h-6 bg-border-divider mx-2" />

        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-bg-elevated border border-border-divider">
          <div className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-success"></span>
          </div>
          <span className="text-xs font-mono font-medium text-success uppercase tracking-wider">
            Live
          </span>
        </div>

        <button className="relative p-2 text-text-secondary hover:text-text-primary transition-colors">
          <Bell className="w-5 h-5" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-danger rounded-full border-2 border-bg-surface" />
        </button>

        <button className="w-8 h-8 rounded-full bg-bg-elevated border border-border-divider flex items-center justify-center text-text-secondary hover:text-text-primary hover:border-accent-blue transition-all">
          <User className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
}
