import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { formatDistanceToNow } from "date-fns";
import type { StatusEvent } from "../../lib/types";

const STATUS_LABELS: Record<string, string> = {
  home: "At Home",
  in_transit: "In Transit",
  on_board: "On Board",
  at_airport: "At Airport",
  at_port: "At Port",
};

export function CrewTimeline({ crewId }: { crewId: string }) {
  const [events, setEvents] = useState<StatusEvent[]>([]);

  useEffect(() => {
    const fetchEvents = async () => {
      const { data } = await supabase
        .from("status_events")
        .select("id, event_type, previous_status, new_status, location_label, source, created_at")
        .eq("crew_member_id", crewId)
        .order("created_at", { ascending: false })
        .limit(10);
      if (data) setEvents(data as StatusEvent[]);
    };
    fetchEvents();
  }, [crewId]);

  if (!events.length) return null;

  return (
    <div className="border-t border-border-divider pt-3">
      <h4 className="text-[10px] font-mono text-text-muted uppercase tracking-wider mb-3">Recent Activity</h4>
      <div className="space-y-2.5">
        {events.map((e) => (
          <div key={e.id} className="flex gap-3 text-xs">
            <div className="w-1.5 h-1.5 rounded-full bg-text-muted mt-1.5 flex-shrink-0" />
            <div>
              <div className="text-text-primary">
                {e.previous_status && STATUS_LABELS[e.previous_status]}
                {e.previous_status && e.new_status && " → "}
                {e.new_status && STATUS_LABELS[e.new_status]}
              </div>
              {e.location_label && (
                <div className="text-text-muted">{e.location_label}</div>
              )}
              <div className="text-text-muted font-mono text-[10px]">
                {formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
