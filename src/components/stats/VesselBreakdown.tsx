import { Ship } from "lucide-react";
import { useDashboardStore } from "../../stores/dashboardStore";

export function VesselBreakdown() {
  const stats = useDashboardStore((s) => s.stats);

  if (!stats?.vesselCounts?.length) return null;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <h3 className="text-sm font-medium text-gray-400 mb-3 flex items-center gap-2">
        <Ship size={14} />
        Vessel Crew Counts
      </h3>
      <div className="space-y-2">
        {stats.vesselCounts.map((v) => (
          <div key={v.vessel_id} className="flex items-center justify-between">
            <span className="text-sm text-white truncate">{v.vessel_name}</span>
            <span className="text-sm text-blue-400 font-mono">{v.crew_count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
