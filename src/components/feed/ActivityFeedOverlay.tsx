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

  const panelBg = "rgba(4, 9, 20, 0.46)";
  const panelBorder = "rgba(255, 255, 255, 0.07)";
  const blur = "blur(18px)";

  return (
    <div className="absolute left-3 top-3 z-10 w-48 flex flex-col pointer-events-none select-none">
      {/* Header */}
      <div
        className="px-3 py-1.5 rounded-t-xl flex items-center justify-between pointer-events-auto"
        style={{
          background: panelBg,
          backdropFilter: blur,
          WebkitBackdropFilter: blur,
          border: `1px solid ${panelBorder}`,
          borderBottom: "none",
        }}
      >
        <span
          className="text-[9px] font-mono font-semibold uppercase tracking-widest"
          style={{ color: "rgba(180, 200, 230, 0.55)" }}
        >
          Live Activity
        </span>
        <div className="flex items-center gap-1">
          <div className="w-1 h-1 rounded-full bg-[#22c55e] animate-pulse opacity-80" />
          <span className="text-[8px] font-mono uppercase" style={{ color: "rgba(34,197,94,0.7)" }}>
            Live
          </span>
        </div>
      </div>

      {/* Events list */}
      <div
        className="rounded-b-xl overflow-y-auto pointer-events-auto"
        style={{
          background: panelBg,
          backdropFilter: blur,
          WebkitBackdropFilter: blur,
          border: `1px solid ${panelBorder}`,
          maxHeight: "280px",
        }}
      >
        {loading ? (
          <div className="px-3 py-3 text-[9px] font-mono" style={{ color: "rgba(120,140,170,0.5)" }}>
            Loading…
          </div>
        ) : events.length === 0 ? (
          <div className="px-3 py-3 text-[9px] font-mono" style={{ color: "rgba(120,140,170,0.5)" }}>
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
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -6 }}
                  transition={{ delay: i * 0.03, duration: 0.2 }}
                  onClick={() => handleEventClick(event.crew_member_id)}
                  className="w-full text-left px-2.5 py-1.5 flex items-start gap-2 transition-all"
                  style={{
                    borderBottom: "1px solid rgba(255,255,255,0.05)",
                    background: isSelected ? "rgba(43,108,255,0.10)" : "transparent",
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
                    className="mt-[3px] w-1.5 h-1.5 rounded-full shrink-0"
                    style={{
                      backgroundColor: color,
                      boxShadow: `0 0 5px ${color}70`,
                      opacity: 0.85,
                    }}
                  />

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div
                      className="text-[10px] font-medium leading-tight truncate"
                      style={{
                        color: isSelected
                          ? "rgba(147,197,253,0.95)"
                          : "rgba(220, 230, 245, 0.82)",
                      }}
                    >
                      {event.crew_members?.full_name || "Unknown"}
                    </div>
                    <div
                      className="text-[8px] font-mono uppercase tracking-wide mt-0.5"
                      style={{ color: color + "bb" }}
                    >
                      {event.new_status?.replace(/_/g, " ")}
                    </div>
                  </div>

                  {/* Time */}
                  <div
                    className="text-[8px] font-mono shrink-0 mt-0.5"
                    style={{ color: "rgba(100,120,150,0.55)" }}
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
