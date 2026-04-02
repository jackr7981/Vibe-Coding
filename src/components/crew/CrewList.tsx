import { cn } from "../../lib/utils";
import { useCrewStore } from "../../stores/crewStore";
import { useDashboardStore } from "../../stores/dashboardStore";

const STATUS_BADGE: Record<string, { dot: string; text: string }> = {
  home: { dot: "#34D399", text: "text-emerald-400" },
  on_board: { dot: "#60A5FA", text: "text-blue-400" },
  in_transit: { dot: "#FBBF24", text: "text-amber-400" },
  at_airport: { dot: "#F97316", text: "text-orange-400" },
  at_port: { dot: "#A78BFA", text: "text-violet-400" },
};

const STATUS_LABEL: Record<string, string> = {
  home: "Home",
  on_board: "On Board",
  in_transit: "In Transit",
  at_airport: "Airport",
  at_port: "At Port",
};

export function CrewList() {
  const { filteredCrew } = useCrewStore();
  const { selectedCrewId, setSelectedCrew } = useDashboardStore();

  return (
    <div className="flex-1 rounded-xl flex flex-col overflow-hidden border border-border-divider min-h-0"
      style={{ background: "#0b1425" }}
    >
      {/* Header */}
      <div className="px-3 py-2 border-b border-border-divider shrink-0 flex items-center justify-between">
        <span className="text-[10px] font-mono font-semibold uppercase tracking-wider" style={{ color: "#8899bb" }}>
          Crew Roster
        </span>
        <span className="text-[9px] font-mono" style={{ color: "#3e4f6a" }}>
          {filteredCrew.length}
        </span>
      </div>

      {/* Crew items */}
      <div className="flex-1 overflow-y-auto p-1.5">
        {filteredCrew.slice(0, 50).map((crew) => {
          const isSelected = crew.id === selectedCrewId;
          const badge = STATUS_BADGE[crew.current_status] || STATUS_BADGE.home;

          return (
            <button
              key={crew.id}
              onClick={() => setSelectedCrew(crew.id)}
              className={cn(
                "w-full text-left px-3 py-3 rounded-lg flex items-center gap-3 relative mb-0.5",
                isSelected ? "border border-accent-blue/40" : "border border-transparent hover:border-border-divider"
              )}
              style={{
                background: isSelected ? "#111d35" : "transparent",
              }}
            >
              {/* Active indicator bar */}
              {isSelected && (
                <div className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full bg-accent-blue" />
              )}

              {/* Status dot */}
              <div
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: badge.dot, boxShadow: `0 0 8px ${badge.dot}60` }}
              />

              {/* Name + rank */}
              <div className="flex-1 min-w-0">
                <div className="text-[15px] font-semibold leading-tight truncate" style={{ color: "#f0f4fc" }}>
                  {crew.full_name}
                </div>
                <div className="text-[12px] mt-0.5 truncate" style={{ color: "#8899bb" }}>
                  {crew.rank}
                  {crew.nationality && <span> · {crew.nationality}</span>}
                  {crew.vessel_name && <span style={{ color: "#5a6d8a" }}> · {crew.vessel_name}</span>}
                </div>
              </div>

              {/* Status label */}
              <span className={cn("text-[11px] font-mono font-bold uppercase tracking-wide shrink-0", badge.text)}>
                {STATUS_LABEL[crew.current_status]}
              </span>
            </button>
          );
        })}
      </div>

      {/* Footer */}
      <div className="px-3 py-2.5 border-t border-border-divider shrink-0 text-center">
        <span className="text-[12px] font-mono uppercase tracking-wider" style={{ color: "#6b7fa0" }}>
          Showing {Math.min(filteredCrew.length, 50)} of {filteredCrew.length} crew
        </span>
      </div>
    </div>
  );
}
