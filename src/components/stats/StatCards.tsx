import { Home, Plane, Ship, MapPin } from "lucide-react";
import { useDashboardStore } from "../../stores/dashboardStore";
import { useCrewStore } from "../../stores/crewStore";
import type { CrewStatus } from "../../lib/types";

const statConfig: { key: CrewStatus; label: string; icon: typeof Home; color: string }[] = [
  { key: "home", label: "At Home", icon: Home, color: "text-green-400" },
  { key: "in_transit", label: "In Transit", icon: Plane, color: "text-yellow-400" },
  { key: "on_board", label: "On Board", icon: Ship, color: "text-blue-400" },
  { key: "at_airport", label: "At Airport", icon: MapPin, color: "text-orange-400" },
  { key: "at_port", label: "At Port", icon: MapPin, color: "text-purple-400" },
];

export function StatCards() {
  const stats = useDashboardStore((s) => s.stats);
  const { setFilters } = useCrewStore();

  const getCount = (status: CrewStatus) =>
    stats?.statusCounts?.find((s) => s.status === status)?.count ?? 0;

  const totalCrew = stats?.statusCounts?.reduce((sum, s) => sum + Number(s.count), 0) ?? 0;

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      <button
        onClick={() => setFilters({ status: "all" })}
        className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-left hover:border-gray-600 transition-colors"
      >
        <div className="text-2xl font-bold text-white">{totalCrew}</div>
        <div className="text-xs text-gray-500 mt-1">Total Crew</div>
      </button>
      {statConfig.map(({ key, label, icon: Icon, color }) => (
        <button
          key={key}
          onClick={() => setFilters({ status: key })}
          className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-left hover:border-gray-600 transition-colors"
        >
          <div className="flex items-center justify-between">
            <span className="text-2xl font-bold text-white">{getCount(key)}</span>
            <Icon size={18} className={color} />
          </div>
          <div className="text-xs text-gray-500 mt-1">{label}</div>
        </button>
      ))}
    </div>
  );
}
