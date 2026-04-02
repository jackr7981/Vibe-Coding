import { motion } from "motion/react";
import { X, MapPin, Ship, Phone, Flag } from "lucide-react";
import { useCrewStore } from "../../stores/crewStore";
import { useDashboardStore } from "../../stores/dashboardStore";
import { CrewTimeline } from "./CrewTimeline";

const STATUS_COLORS: Record<string, string> = {
  home: "#34D399",
  on_board: "#60A5FA",
  in_transit: "#FBBF24",
  at_airport: "#F97316",
  at_port: "#A78BFA",
};

export function CrewDetail() {
  const { selectedCrewId, setSelectedCrew } = useDashboardStore();
  const crew = useCrewStore((s) => s.crew.find((c) => c.id === selectedCrewId));

  if (!crew) return null;

  const color = STATUS_COLORS[crew.current_status];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="absolute bottom-4 left-4 right-4 glass-panel rounded-xl p-4 z-20 shadow-2xl border-t border-border-divider/50"
      style={{ backdropFilter: "blur(24px)" }}
    >
      <button
        onClick={() => setSelectedCrew(null)}
        className="absolute top-3 right-3 p-1 text-text-muted hover:text-text-primary transition-colors"
      >
        <X className="w-4 h-4" />
      </button>

      <div className="flex gap-6">
        <div className="w-1/3 border-r border-border-divider pr-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-full bg-bg-elevated border border-border-divider flex items-center justify-center text-lg font-display font-bold text-text-primary">
              {crew.full_name
                .split(" ")
                .map((n) => n[0])
                .join("")}
            </div>
            <div>
              <h2 className="text-lg font-bold text-text-primary leading-tight">
                {crew.full_name}
              </h2>
              <div className="text-xs text-text-secondary">
                {crew.rank} {crew.nationality && `\u00b7 ${crew.nationality}`}
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <div className="text-[10px] font-mono text-text-muted uppercase tracking-wider mb-1">
                Employee ID
              </div>
              <div className="text-sm font-mono text-text-primary">
                {crew.employee_id}
              </div>
            </div>

            <div>
              <div className="text-[10px] font-mono text-text-muted uppercase tracking-wider mb-1">
                Current Status
              </div>
              <div className="inline-flex items-center gap-2 px-2 py-1 rounded bg-bg-elevated border border-border-divider">
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}` }}
                />
                <span
                  className="text-xs font-mono uppercase tracking-wider"
                  style={{ color }}
                >
                  {crew.current_status.replace("_", " ")}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-bg-deepest rounded-lg border border-border-divider p-3">
              <div className="flex items-center gap-2 mb-2">
                <MapPin className="w-4 h-4 text-text-muted" />
                <span className="text-[10px] font-mono text-text-muted uppercase tracking-wider">
                  Location
                </span>
              </div>
              <div className="text-sm font-medium text-text-primary">
                {crew.current_location_label || "Unknown"}
              </div>
            </div>

            <div className="bg-bg-deepest rounded-lg border border-border-divider p-3">
              <div className="flex items-center gap-2 mb-2">
                <Ship className="w-4 h-4 text-text-muted" />
                <span className="text-[10px] font-mono text-text-muted uppercase tracking-wider">
                  Assignment
                </span>
              </div>
              <div className="text-sm font-medium text-text-primary">
                {crew.assigned_vessel ? crew.assigned_vessel.name : "Unassigned"}
              </div>
            </div>

            <div className="bg-bg-deepest rounded-lg border border-border-divider p-3">
              <div className="flex items-center gap-2 mb-2">
                <Flag className="w-4 h-4 text-text-muted" />
                <span className="text-[10px] font-mono text-text-muted uppercase tracking-wider">
                  Nationality
                </span>
              </div>
              <div className="text-sm font-medium text-text-primary">
                {crew.nationality || "N/A"}
              </div>
            </div>

            <div className="bg-bg-deepest rounded-lg border border-border-divider p-3">
              <div className="flex items-center gap-2 mb-2">
                <Phone className="w-4 h-4 text-text-muted" />
                <span className="text-[10px] font-mono text-text-muted uppercase tracking-wider">
                  Phone
                </span>
              </div>
              <div className="text-sm font-medium text-text-primary">
                {crew.phone || "N/A"}
              </div>
            </div>
          </div>

          <div className="mt-3">
            <CrewTimeline crewId={crew.id} />
          </div>
        </div>
      </div>
    </motion.div>
  );
}
