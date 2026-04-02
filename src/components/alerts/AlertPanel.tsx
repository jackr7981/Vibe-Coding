import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, AlertTriangle, AlertCircle, Info, Check } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { formatDistanceToNow } from "date-fns";
import { cn } from "../../lib/utils";

interface Alert {
  id: string;
  category: string;
  severity: "critical" | "warning" | "info";
  status: string;
  title: string;
  description: string;
  crew_member_id: string | null;
  vessel_id: string | null;
  acknowledged_at: string | null;
  resolved_at: string | null;
  created_at: string;
}

const SEVERITY_CONFIG = {
  critical: { icon: AlertTriangle, color: "#EF4444", bg: "bg-[#EF4444]/10", border: "border-[#EF4444]/30" },
  warning: { icon: AlertCircle, color: "#FBBF24", bg: "bg-[#FBBF24]/10", border: "border-[#FBBF24]/30" },
  info: { icon: Info, color: "#60A5FA", bg: "bg-[#60A5FA]/10", border: "border-[#60A5FA]/30" },
};

interface AlertPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AlertPanel({ isOpen, onClose }: AlertPanelProps) {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [filter, setFilter] = useState<"all" | "critical" | "warning" | "info">("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isOpen) return;
    const fetch = async () => {
      const { data } = await supabase
        .from("alerts")
        .select("*")
        .eq("status", "active")
        .order("severity")
        .order("created_at", { ascending: false });
      if (data) setAlerts(data);
      setLoading(false);
    };
    fetch();
  }, [isOpen]);

  const filtered = filter === "all" ? alerts : alerts.filter((a) => a.severity === filter);

  const acknowledge = async (id: string) => {
    await supabase
      .from("alerts")
      .update({ status: "acknowledged", acknowledged_at: new Date().toISOString() })
      .eq("id", id);
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  };

  const resolve = async (id: string) => {
    await supabase
      .from("alerts")
      .update({ status: "resolved", resolved_at: new Date().toISOString() })
      .eq("id", id);
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-bg-deepest/60 backdrop-blur-sm z-40"
            onClick={onClose}
          />
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="fixed right-0 top-0 bottom-0 w-[480px] bg-bg-surface border-l border-border-divider z-50 flex flex-col"
          >
            <div className="h-16 flex items-center justify-between px-6 border-b border-border-divider shrink-0">
              <h2 className="text-lg font-display font-bold text-text-primary">
                Alerts ({alerts.length})
              </h2>
              <button onClick={onClose} className="p-1 text-text-muted hover:text-text-primary">
                <X size={18} />
              </button>
            </div>

            {/* Filter tabs */}
            <div className="flex gap-1 px-4 py-3 border-b border-border-divider shrink-0">
              {(["all", "critical", "warning", "info"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={cn(
                    "px-3 py-1.5 rounded-md text-xs font-mono uppercase tracking-wider transition-colors",
                    filter === f
                      ? "bg-accent-blue/20 text-accent-blue"
                      : "text-text-muted hover:text-text-secondary"
                  )}
                >
                  {f}
                </button>
              ))}
            </div>

            {/* Alert list */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {loading ? (
                <div className="text-sm text-text-muted">Loading...</div>
              ) : filtered.length === 0 ? (
                <div className="text-sm text-text-muted text-center py-8">No active alerts</div>
              ) : (
                filtered.map((alert) => {
                  const config = SEVERITY_CONFIG[alert.severity];
                  const Icon = config.icon;
                  return (
                    <div
                      key={alert.id}
                      className={cn(
                        "rounded-xl border p-4",
                        config.bg,
                        config.border
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <Icon size={16} style={{ color: config.color }} className="mt-0.5 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-text-primary">{alert.title}</div>
                          <div className="text-xs text-text-secondary mt-1">{alert.description}</div>
                          <div className="text-[10px] font-mono text-text-muted mt-2">
                            {formatDistanceToNow(new Date(alert.created_at), { addSuffix: true })}
                            <span className="mx-1">·</span>
                            {alert.category.replace("_", " ")}
                          </div>
                          <div className="flex gap-2 mt-3">
                            <button
                              onClick={() => acknowledge(alert.id)}
                              className="text-[10px] font-mono uppercase tracking-wider px-2.5 py-1 rounded bg-bg-elevated border border-border-divider text-text-secondary hover:text-text-primary transition-colors"
                            >
                              Acknowledge
                            </button>
                            <button
                              onClick={() => resolve(alert.id)}
                              className="text-[10px] font-mono uppercase tracking-wider px-2.5 py-1 rounded bg-accent-blue/20 text-accent-blue hover:bg-accent-blue/30 transition-colors flex items-center gap-1"
                            >
                              <Check size={10} />
                              Resolve
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
