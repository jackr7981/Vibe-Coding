import { motion, AnimatePresence } from "motion/react";
import type { RefObject } from "react";
import type { MapRef } from "react-map-gl/mapbox";
import { useEventFeed } from "../../hooks/useEventFeed";
import { useCrewStore } from "../../stores/crewStore";
import { useDashboardStore } from "../../stores/dashboardStore";

const STATUS_COLORS: Record<string, string> = {
  home: "#34D399",
  on_board: "#60A5FA",
  in_transit: "#FBBF24",
  at_airport: "#F97316",
  at_port: "#A78BFA",
};

interface Props {
  mapRef: RefObject<MapRef | null>;
}

export function ActivityFeedOverlay({ mapRef }: Props) {
  const { events, loading } = useEventFeed(12);
  const { filteredCrew } = useCrewStore();
  const { setSelectedCrew, selectedCrewId } = useDashboardStore();

  const handleEventClick = (crewMemberId: string) => {
    setSelectedCrew(crewMemberId === selectedCrewId ? null : crewMemberId);
    const crew = filteredCrew.find((c) => c.id === crewMemberId);
    if (crew?.lat != null && crew?.lng != null) {
      mapRef.current?.flyTo({
        center: [crew.lng, crew.lat],
        zoom: 5,
        duration: 1600,
        essential: true,
      });
    }
  };

  return (
    <div className="absolute left-3 top-3 z-10 w-52 flex flex-col pointer-events-none select-none">
      {/* Header */}
      <div
        className="px-3 py-2 rounded-t-lg flex items-center justify-between pointer-events-auto"
        style={{
          background: "rgba(7, 13, 26, 0.82)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          border: "1px solid #162240",
          borderBottom: "none",
        }}
      >
        <span
          className="text-[10px] font-mono font-semibold uppercase tracking-wider"
          style={{ color: "#8899bb" }}
        >
          Live Activity
        </span>
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-[#22c55e] animate-pulse" />
          <span className="text-[9px] font-mono uppercase" style={{ color: "#22c55e" }}>
            Live
          </span>
        </div>
      </div>

      {/* Events list */}
      <div
        className="rounded-b-lg overflow-y-auto pointer-events-auto"
        style={{
          background: "rgba(7, 13, 26, 0.78)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          border: "1px solid #162240",
          maxHeight: "300px",
        }}
      >
        {loading ? (
          <div
            className="px-3 py-3 text-[10px] font-mono"
            style={{ color: "#5a6d8a" }}
          >
            Loading...
          </div>
        ) : events.length === 0 ? (
          <div
            className="px-3 py-3 text-[10px] font-mono"
            style={{ color: "#5a6d8a" }}
          >
            No recent activity
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {events.map((event, i) => {
              const color =
                event.new_status ? STATUS_COLORS[event.new_status] ?? "#888" : "#888";
              const isSelected = event.crew_member_id === selectedCrewId;

              return (
                <motion.button
                  key={event.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -8 }}
                  transition={{ delay: i * 0.035, duration: 0.25 }}
                  onClick={() => handleEventClick(event.crew_member_id)}
                  className="w-full text-left px-3 py-2 flex items-start gap-2 transition-colors"
                  style={{
                    borderBottom: "1px solid #162240",
                    background: isSelected ? "rgba(43,108,255,0.12)" : "transparent",
                    cursor: "pointer",
                  }}
                  onMouseEnter={(e) =>
                    !isSelected &&
                    (e.currentTarget.style.background = "rgba(255,255,255,0.04)")
                  }
                  onMouseLeave={(e) =>
                    !isSelected &&
                    (e.currentTarget.style.background = "transparent")
                  }
                >
                  {/* Status dot */}
                  <div
                    className="mt-1 w-1.5 h-1.5 rounded-full shrink-0"
                    style={{
                      backgroundColor: color,
                      boxShadow: `0 0 6px ${color}80`,
                    }}
                  />

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div
                      className="text-[10px] font-semibold leading-tight truncate"
                      style={{ color: isSelected ? "#93c5fd" : "#e8edf7" }}
                    >
                      {event.crew_members?.full_name || "Unknown"}
                    </div>
                    <div
                      className="text-[9px] font-mono uppercase tracking-wide mt-0.5"
                      style={{ color }}
                    >
                      {event.new_status?.replace(/_/g, " ")}
                    </div>
                    {event.location_label && (
                      <div
                        className="text-[9px] mt-0.5 truncate"
                        style={{ color: "#5a6d8a" }}
                      >
                        {event.location_label}
                      </div>
                    )}
                  </div>

                  {/* Time */}
                  <div
                    className="text-[8px] font-mono shrink-0 mt-0.5"
                    style={{ color: "#3e4f6a" }}
                  >
                    {new Date(event.created_at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                </motion.button>
              );
            })}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
