import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { STATUS_LABELS } from "../../lib/mapbox";
import { formatDistanceToNow } from "date-fns";
import type { StatusEvent } from "../../lib/types";

export function CrewTimeline({ crewId }: { crewId: string }) {
  const [events, setEvents] = useState<StatusEvent[]>([]);

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from("status_events")
        .select("*")
        .eq("crew_member_id", crewId)
        .order("created_at", { ascending: false })
        .limit(10);
      if (data) setEvents(data);
    };
    fetch();
  }, [crewId]);

  if (!events.length) return null;

  return (
    <div className="border-t border-gray-800 p-4">
      <h4 className="text-xs font-medium text-gray-500 mb-3">Recent Activity</h4>
      <div className="space-y-3">
        {events.map((e) => (
          <div key={e.id} className="flex gap-3 text-xs">
            <div className="w-1.5 h-1.5 rounded-full bg-gray-600 mt-1.5 flex-shrink-0" />
            <div>
              <div className="text-gray-300">
                {e.previous_status && STATUS_LABELS[e.previous_status]} {" -> "}
                {e.new_status && STATUS_LABELS[e.new_status]}
              </div>
              {e.location_label && (
                <div className="text-gray-500">{e.location_label}</div>
              )}
              <div className="text-gray-600">
                {formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
