import { useEffect } from "react";
import { supabase } from "../lib/supabase";
import { useDashboardStore } from "../stores/dashboardStore";
import { useAuthStore } from "../stores/authStore";

export function useDashboardStats() {
  const { setStats, setStatsLoading } = useDashboardStore();
  const profile = useAuthStore((s) => s.profile);

  useEffect(() => {
    if (!profile?.company_id) return;

    const fetchStats = async () => {
      setStatsLoading(true);

      const [statusCounts, recentEvents, activeTrips, vesselCounts] = await Promise.all([
        supabase.rpc("get_status_counts", { p_company_id: profile.company_id }),
        supabase
          .from("status_events")
          .select("*, crew_members(full_name, rank)")
          .eq("company_id", profile.company_id)
          .order("created_at", { ascending: false })
          .limit(20),
        supabase
          .from("travel_itineraries")
          .select("*, crew_members(full_name, rank), travel_legs(*)")
          .eq("company_id", profile.company_id)
          .eq("status", "active")
          .limit(50),
        supabase.rpc("get_vessel_crew_counts", { p_company_id: profile.company_id }),
      ]);

      setStats({
        statusCounts: statusCounts.data || [],
        recentEvents: recentEvents.data || [],
        activeTrips: activeTrips.data || [],
        vesselCounts: vesselCounts.data || [],
      });
    };

    fetchStats();
  }, [profile?.company_id, setStats, setStatsLoading]);
}
