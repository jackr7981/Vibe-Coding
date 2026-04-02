import { motion } from "motion/react";
import { useEventFeed } from "../../hooks/useEventFeed";


const STATUS_COLORS: Record<string, string> = {
  home: "#34D399",
  on_board: "#60A5FA",
  in_transit: "#FBBF24",
  at_airport: "#F97316",
  at_port: "#A78BFA",
};

export function ActivityFeed() {
  const { events, loading } = useEventFeed();

  return (
    <div className="h-64 glass-panel rounded-xl flex flex-col overflow-hidden shrink-0">
      <div className="p-3 border-b border-border-divider shrink-0 flex items-center justify-between">
        <h3 className="text-xs font-mono font-semibold uppercase tracking-wider text-text-primary">
          Live Activity
        </h3>
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
          <span className="text-[10px] font-mono text-success uppercase">
            Live
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1">
        {loading ? (
          <div className="p-4 text-xs text-text-muted">Loading...</div>
        ) : events.length === 0 ? (
          <div className="p-4 text-xs text-text-muted">No recent activity</div>
        ) : (
          events.map((event, i) => {
            const color = event.new_status ? STATUS_COLORS[event.new_status] : "#888";

            return (
              <motion.div
                key={event.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="p-2 rounded-lg text-xs flex items-start gap-3 hover:bg-bg-elevated/30 transition-colors"
              >
                <div className="mt-1 relative shrink-0">
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                </div>

                <div className="flex-1">
                  <div className="text-text-primary leading-relaxed">
                    <span className="font-medium">
                      {event.crew_members?.full_name || "Unknown"}
                    </span>{" "}
                    changed to{" "}
                    <span
                      className="font-mono uppercase tracking-wider text-[10px]"
                      style={{ color }}
                    >
                      {event.new_status?.replace("_", " ")}
                    </span>
                  </div>
                  {event.location_label && (
                    <div className="text-[10px] text-text-muted mt-0.5">
                      {event.location_label}
                    </div>
                  )}
                  <div className="text-[10px] font-mono text-text-muted mt-1">
                    {new Date(event.created_at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                </div>
              </motion.div>
            );
          })
        )}
      </div>

      <div className="p-2 border-t border-border-divider shrink-0 text-center">
        <button className="text-[10px] font-mono text-accent-blue hover:text-accent-blue/80 uppercase tracking-wider transition-colors">
          View All Activity
        </button>
      </div>
    </div>
  );
}
