import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import type { StatusEvent } from "../lib/types";

export function useEventFeed(limit = 20) {
  const [events, setEvents] = useState<StatusEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchEvents = async () => {
      const { data } = await supabase
        .from("status_events")
        .select("*, crew_members(full_name, rank)")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (data) setEvents(data as StatusEvent[]);
      setLoading(false);
    };

    fetchEvents();

    const channel = supabase
      .channel("events-realtime")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "status_events",
        },
        async (payload) => {
          // Fetch the full event with joins
          const { data } = await supabase
            .from("status_events")
            .select("*, crew_members(full_name, rank)")
            .eq("id", (payload.new as StatusEvent).id)
            .single();
          if (data) {
            setEvents((prev) => [data as StatusEvent, ...prev].slice(0, limit));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [limit]);

  return { events, loading };
}
