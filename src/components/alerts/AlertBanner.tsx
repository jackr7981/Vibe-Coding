import { useEffect, useState } from "react";
import { AlertTriangle, ChevronRight } from "lucide-react";
import { supabase } from "../../lib/supabase";

interface AlertRow {
  id: string;
  severity: string;
}

interface AlertBannerProps {
  onOpenPanel: () => void;
}

export function AlertBanner({ onOpenPanel }: AlertBannerProps) {
  const [criticalCount, setCriticalCount] = useState(0);
  const [warningCount, setWarningCount] = useState(0);

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from("alerts")
        .select("id, severity")
        .eq("status", "active");

      if (data) {
        setCriticalCount(data.filter((a: AlertRow) => a.severity === "critical").length);
        setWarningCount(data.filter((a: AlertRow) => a.severity === "warning").length);
      }
    };
    fetch();

    const channel = supabase
      .channel("alerts-banner")
      .on("postgres_changes", { event: "*", schema: "public", table: "alerts" }, () => fetch())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  if (criticalCount === 0 && warningCount === 0) return null;

  return (
    <button
      onClick={onOpenPanel}
      className="w-full flex items-center gap-3 px-4 py-2.5 border-l-4 transition-colors shrink-0"
      style={{
        backgroundColor: criticalCount > 0 ? "rgba(239,68,68,0.08)" : "rgba(251,191,36,0.08)",
        borderLeftColor: criticalCount > 0 ? "#EF4444" : "#FBBF24",
      }}
    >
      <AlertTriangle
        size={16}
        className={criticalCount > 0 ? "text-danger" : "text-[#FBBF24]"}
      />
      <span className="text-sm text-text-primary flex-1 text-left">
        {criticalCount > 0 && (
          <span className="text-danger font-semibold">{criticalCount} Critical</span>
        )}
        {criticalCount > 0 && warningCount > 0 && <span className="text-text-muted"> · </span>}
        {warningCount > 0 && (
          <span className="text-[#FBBF24] font-semibold">{warningCount} Warning</span>
        )}
        <span className="text-text-muted"> alerts active</span>
      </span>
      <ChevronRight size={14} className="text-text-muted" />
    </button>
  );
}
