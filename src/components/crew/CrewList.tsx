import { Search } from "lucide-react";
import { cn } from "../../lib/utils";
import { useCrewStore } from "../../stores/crewStore";
import { useDashboardStore } from "../../stores/dashboardStore";

const STATUS_COLORS: Record<string, string> = {
  home: "text-[#34D399] bg-[#34D399]/10 border-[#34D399]/30",
  on_board: "text-[#60A5FA] bg-[#60A5FA]/10 border-[#60A5FA]/30",
  in_transit: "text-[#FBBF24] bg-[#FBBF24]/10 border-[#FBBF24]/30",
  at_airport: "text-[#F97316] bg-[#F97316]/10 border-[#F97316]/30",
  at_port: "text-[#A78BFA] bg-[#A78BFA]/10 border-[#A78BFA]/30",
};

export function CrewList() {
  const { filteredCrew, setFilters } = useCrewStore();
  const { selectedCrewId, setSelectedCrew } = useDashboardStore();

  return (
    <div className="flex-1 glass-panel rounded-xl flex flex-col overflow-hidden">
      <div className="p-3 border-b border-border-divider shrink-0">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary" />
          <input
            type="text"
            placeholder="Search crew..."
            onChange={(e) => setFilters({ search: e.target.value })}
            className="w-full bg-bg-deepest border border-border-divider rounded-lg pl-10 pr-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-blue transition-colors"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-0.5">
        {filteredCrew.slice(0, 50).map((crew) => {
          const isSelected = crew.id === selectedCrewId;

          return (
            <button
              key={crew.id}
              onClick={() => setSelectedCrew(crew.id)}
              className={cn(
                "w-full text-left px-3 py-3 rounded-lg transition-all duration-200 flex items-center justify-between group relative overflow-hidden",
                isSelected
                  ? "bg-bg-elevated border border-accent-blue/30"
                  : "hover:bg-bg-elevated/50 border border-transparent"
              )}
            >
              {isSelected && (
                <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-accent-blue shadow-[0_0_8px_rgba(43,108,255,0.8)]" />
              )}

              <div className="min-w-0 flex-1">
                <div className="font-semibold text-[15px] text-white leading-snug truncate">
                  {crew.full_name}
                </div>
                <div className="text-xs text-text-secondary mt-0.5 truncate">
                  {crew.rank} {crew.nationality && `\u00b7 ${crew.nationality}`}
                  {crew.vessel_name && (
                    <span className="text-text-muted"> \u00b7 {crew.vessel_name}</span>
                  )}
                </div>
              </div>

              <span
                className={cn(
                  "px-2 py-1 rounded-md text-[10px] font-mono font-semibold uppercase tracking-wider border shrink-0 ml-2",
                  STATUS_COLORS[crew.current_status]
                )}
              >
                {crew.current_status.replace("_", " ")}
              </span>
            </button>
          );
        })}
      </div>

      <div className="p-2.5 border-t border-border-divider shrink-0 text-center">
        <span className="text-xs font-mono text-text-secondary uppercase tracking-wider">
          Showing {Math.min(filteredCrew.length, 50)} of {filteredCrew.length} crew
        </span>
      </div>
    </div>
  );
}
