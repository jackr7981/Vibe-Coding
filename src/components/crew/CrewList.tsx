import { Search } from "lucide-react";
import { cn } from "../../lib/utils";
import { useCrewStore } from "../../stores/crewStore";
import { useDashboardStore } from "../../stores/dashboardStore";

const STATUS_COLORS: Record<string, string> = {
  home: "text-[#34D399] bg-[#34D399]/10 border-[#34D399]/20",
  on_board: "text-[#60A5FA] bg-[#60A5FA]/10 border-[#60A5FA]/20",
  in_transit: "text-[#FBBF24] bg-[#FBBF24]/10 border-[#FBBF24]/20",
  at_airport: "text-[#F97316] bg-[#F97316]/10 border-[#F97316]/20",
  at_port: "text-[#A78BFA] bg-[#A78BFA]/10 border-[#A78BFA]/20",
};

export function CrewList() {
  const { filteredCrew, setFilters } = useCrewStore();
  const { selectedCrewId, setSelectedCrew } = useDashboardStore();

  return (
    <div className="flex-1 glass-panel rounded-xl flex flex-col overflow-hidden">
      <div className="p-3 border-b border-border-divider shrink-0">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
          <input
            type="text"
            placeholder="Search crew..."
            onChange={(e) => setFilters({ search: e.target.value })}
            className="w-full bg-bg-deepest border border-border-divider rounded-md pl-8 pr-3 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-blue transition-colors"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1">
        {filteredCrew.slice(0, 50).map((crew) => {
          const isSelected = crew.id === selectedCrewId;

          return (
            <button
              key={crew.id}
              onClick={() => setSelectedCrew(crew.id)}
              className={cn(
                "w-full text-left p-2.5 rounded-lg transition-all duration-200 flex items-start justify-between group relative overflow-hidden",
                isSelected
                  ? "bg-bg-elevated border border-accent-blue/30"
                  : "hover:bg-bg-elevated/50 border border-transparent"
              )}
            >
              {isSelected && (
                <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-accent-blue shadow-[0_0_8px_rgba(43,108,255,0.8)]" />
              )}

              <div>
                <div className="font-medium text-sm text-text-primary mb-0.5">
                  {crew.full_name}
                </div>
                <div className="text-[11px] text-text-secondary">
                  {crew.rank} {crew.nationality && `\u00b7 ${crew.nationality}`}
                </div>
              </div>

              <div className="flex flex-col items-end gap-1.5">
                <span
                  className={cn(
                    "px-1.5 py-0.5 rounded text-[9px] font-mono uppercase tracking-wider border",
                    STATUS_COLORS[crew.current_status]
                  )}
                >
                  {crew.current_status.replace("_", " ")}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      <div className="p-2 border-t border-border-divider shrink-0 text-center">
        <span className="text-[10px] font-mono text-text-muted uppercase tracking-wider">
          Showing {Math.min(filteredCrew.length, 50)} of {filteredCrew.length} crew
        </span>
      </div>
    </div>
  );
}
