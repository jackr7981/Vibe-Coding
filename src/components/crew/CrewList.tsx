import { useCrewStore } from "../../stores/crewStore";
import { useDashboardStore } from "../../stores/dashboardStore";
import { STATUS_COLORS, STATUS_LABELS } from "../../lib/mapbox";

export function CrewList() {
  const { filteredCrew } = useCrewStore();
  const { selectedCrewId, setSelectedCrew } = useDashboardStore();

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <div className="p-3 border-b border-gray-800">
        <h3 className="text-sm font-medium text-gray-400">
          Crew ({filteredCrew.length})
        </h3>
      </div>
      <div className="max-h-[400px] overflow-y-auto">
        {filteredCrew.map((crew) => (
          <button
            key={crew.id}
            onClick={() => setSelectedCrew(crew.id)}
            className={`w-full text-left px-4 py-3 border-b border-gray-800/50 hover:bg-gray-800/50 transition-colors ${
              selectedCrewId === crew.id ? "bg-blue-600/10 border-l-2 border-l-blue-500" : ""
            }`}
          >
            <div className="flex items-center gap-3">
              <span
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: STATUS_COLORS[crew.current_status] }}
              />
              <div className="min-w-0 flex-1">
                <div className="text-sm text-white truncate">{crew.full_name}</div>
                <div className="text-xs text-gray-500 flex gap-2">
                  <span>{crew.rank}</span>
                  {crew.assigned_vessel && (
                    <>
                      <span>-</span>
                      <span>{crew.assigned_vessel.name}</span>
                    </>
                  )}
                </div>
              </div>
              <span className="text-[10px] text-gray-600 flex-shrink-0">
                {STATUS_LABELS[crew.current_status]}
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
