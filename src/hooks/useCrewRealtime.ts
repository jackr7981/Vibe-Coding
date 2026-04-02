import { useEffect } from "react";
import { supabase } from "../lib/supabase";
import { useCrewStore } from "../stores/crewStore";
import type { CrewMember } from "../lib/types";

export function useCrewRealtime() {
  const { setCrew, updateCrewMember } = useCrewStore();

  useEffect(() => {
    const fetchCrew = async () => {
      // Use the view that extracts lat/lng as plain numbers
      const { data, error } = await supabase
        .from("crew_with_coords")
        .select("id, profile_id, company_id, employee_id, full_name, nationality, rank, department, phone, home_country, home_city, current_status, current_location_label, assigned_vessel_id, last_status_update, created_at, lat, lng, vessel_name")
        .order("full_name");

      if (error) {
        console.error("Failed to fetch crew:", error.message);
        return;
      }
      if (data) setCrew(data as CrewMember[]);
    };

    fetchCrew();

    // Realtime listens on the base table, then re-fetches from the view
    const channel = supabase
      .channel("crew-realtime")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "crew_members",
        },
        () => {
          // Re-fetch from view on any crew update
          fetchCrew();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [setCrew, updateCrewMember]);
}
