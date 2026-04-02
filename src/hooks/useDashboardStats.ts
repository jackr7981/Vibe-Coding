import { useEffect } from "react";
import { supabase } from "../lib/supabase";
import { useDashboardStore } from "../stores/dashboardStore";

export function useDashboardStats() {
  const { setStats, setStatsLoading } = useDashboardStore();

  useEffect(() => {
    const fetchStats = async () => {
      setStatsLoading(true);

      // Get the first company (demo mode — no auth required)
      const { data: company } = await supabase
        .from("companies")
        .select("id")
        .limit(1)
        .single();

      if (!company) {
        setStatsLoading(false);
        return;
      }

      const companyId = company.id;

      const [statusCounts, recentEvents, activeTrips, vesselCounts] = await Promise.all([
        supabase.rpc("get_status_counts", { p_company_id: companyId }),
        supabase
          .from("status_events")
          .select("*, crew_members(full_name, rank)")
          .eq("company_id", companyId)
          .order("created_at", { ascending: false })
          .limit(20),
        supabase
          .from("travel_itineraries")
          .select("*, crew_members(full_name, rank), travel_legs(*)")
          .eq("company_id", companyId)
          .eq("status", "active")
          .limit(50),
        supabase.rpc("get_vessel_crew_counts", { p_company_id: companyId }),
      ]);

      setStats({
        statusCounts: statusCounts.data || [],
        recentEvents: recentEvents.data || [],
        activeTrips: activeTrips.data || [],
        vesselCounts: vesselCounts.data || [],
      });
    };

    fetchStats();
  }, [setStats, setStatsLoading]);
}
