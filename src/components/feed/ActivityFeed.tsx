import { useEventFeed } from "../../hooks/useEventFeed";
import { STATUS_LABELS } from "../../lib/mapbox";
import { formatDistanceToNow } from "date-fns";
import { Activity } from "lucide-react";

export function ActivityFeed() {
  const { events, loading } = useEventFeed();

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <div className="p-3 border-b border-gray-800 flex items-center gap-2">
        <Activity size={14} className="text-gray-500" />
        <h3 className="text-sm font-medium text-gray-400">Live Activity</h3>
      </div>
      <div className="max-h-[400px] overflow-y-auto">
        {loading ? (
          <div className="p-4 text-sm text-gray-500">Loading events...</div>
        ) : events.length === 0 ? (
          <div className="p-4 text-sm text-gray-500">No recent activity</div>
        ) : (
          events.map((event) => (
            <div
              key={event.id}
              className="px-4 py-3 border-b border-gray-800/50 hover:bg-gray-800/30"
            >
              <div className="text-sm text-white">
                <span className="font-medium">
                  {event.crew_members?.full_name || "Unknown"}
                </span>
                <span className="text-gray-500"> - </span>
                <span className="text-gray-400">
                  {event.new_status && STATUS_LABELS[event.new_status]}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                {event.location_label && <span>{event.location_label}</span>}
                <span>
                  {formatDistanceToNow(new Date(event.created_at), { addSuffix: true })}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
