import { X, MapPin, Ship, Phone, Flag } from "lucide-react";
import { useCrewStore } from "../../stores/crewStore";
import { useDashboardStore } from "../../stores/dashboardStore";
import { STATUS_COLORS, STATUS_LABELS } from "../../lib/mapbox";
import { CrewTimeline } from "./CrewTimeline";

export function CrewDetail() {
  const { selectedCrewId, setSelectedCrew } = useDashboardStore();
  const crew = useCrewStore((s) => s.crew.find((c) => c.id === selectedCrewId));

  if (!crew) return null;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <div className="p-4 border-b border-gray-800 flex items-center justify-between">
        <h3 className="text-sm font-medium text-white">{crew.full_name}</h3>
        <button
          onClick={() => setSelectedCrew(null)}
          className="text-gray-500 hover:text-white"
        >
          <X size={16} />
        </button>
      </div>

      <div className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <span
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: STATUS_COLORS[crew.current_status] }}
          />
          <span className="text-sm text-white">
            {STATUS_LABELS[crew.current_status]}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="flex items-center gap-2 text-gray-400">
            <Flag size={12} />
            <span>{crew.nationality || "N/A"}</span>
          </div>
          <div className="flex items-center gap-2 text-gray-400">
            <Ship size={12} />
            <span>{crew.rank || "N/A"}</span>
          </div>
          <div className="flex items-center gap-2 text-gray-400">
            <MapPin size={12} />
            <span>{crew.current_location_label || "Unknown"}</span>
          </div>
          <div className="flex items-center gap-2 text-gray-400">
            <Phone size={12} />
            <span>{crew.phone || "N/A"}</span>
          </div>
        </div>

        {crew.assigned_vessel && (
          <div className="bg-gray-800 rounded-lg p-3 text-xs">
            <span className="text-gray-500">Assigned to</span>
            <span className="text-blue-400 ml-2">{crew.assigned_vessel.name}</span>
          </div>
        )}
      </div>

      <CrewTimeline crewId={crew.id} />
    </div>
  );
}
