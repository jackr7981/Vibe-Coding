import { useEffect } from "react";
import { supabase } from "../lib/supabase";
import { useCrewStore } from "../stores/crewStore";
import type { CrewMember } from "../lib/types";

export function useCrewRealtime() {
  const { setCrew, updateCrewMember } = useCrewStore();

  useEffect(() => {
    const fetchCrew = async () => {
      const { data } = await supabase
        .from("crew_members")
        .select(`
          *,
          assigned_vessel:vessels(id, name),
          active_itinerary:travel_itineraries(
            id, purpose, status,
            travel_legs(*)
          )
        `)
        .order("full_name");
      if (data) setCrew(data as CrewMember[]);
    };

    fetchCrew();

    const channel = supabase
      .channel("crew-realtime")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "crew_members",
        },
        (payload) => {
          updateCrewMember(payload.new as CrewMember);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [setCrew, updateCrewMember]);
}
