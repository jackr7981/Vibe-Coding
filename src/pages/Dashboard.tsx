import { useCrewRealtime } from "../hooks/useCrewRealtime";
import { useDashboardStats } from "../hooks/useDashboardStats";
import { GlobeMap } from "../components/map/GlobeMap";
import { StatCards } from "../components/stats/StatCards";
import { VesselBreakdown } from "../components/stats/VesselBreakdown";
import { CrewList } from "../components/crew/CrewList";
import { CrewDetail } from "../components/crew/CrewDetail";
import { ActivityFeed } from "../components/feed/ActivityFeed";
import { useDashboardStore } from "../stores/dashboardStore";

export function Dashboard() {
  useCrewRealtime();
  useDashboardStats();

  const selectedCrewId = useDashboardStore((s) => s.selectedCrewId);

  return (
    <div className="h-full flex flex-col">
      {/* Stats bar */}
      <div className="p-4 pb-0">
        <StatCards />
      </div>

      {/* Main content: Map + sidebar */}
      <div className="flex-1 flex p-4 gap-4 min-h-0">
        {/* Globe map */}
        <div className="flex-1 bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <GlobeMap />
        </div>

        {/* Right sidebar */}
        <div className="w-80 flex flex-col gap-4 overflow-y-auto">
          {selectedCrewId ? (
            <CrewDetail />
          ) : (
            <>
              <CrewList />
              <VesselBreakdown />
              <ActivityFeed />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
