import { motion, useSpring, useTransform } from "motion/react";
import { cn } from "../../lib/utils";
import { useEffect } from "react";
import { useDashboardStore } from "../../stores/dashboardStore";
import { useCrewStore } from "../../stores/crewStore";
import type { CrewStatus } from "../../lib/types";

interface StatCardProps {
  label: string;
  value: number;
  total: number;
  statusColor?: string;
  isTotal?: boolean;
  active?: boolean;
  onClick?: () => void;
  delay?: number;
}

function StatCard({
  label,
  value,
  total,
  statusColor,
  isTotal,
  active,
  onClick,
  delay = 0,
}: StatCardProps) {
  const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : "0";

  const springValue = useSpring(0, { stiffness: 50, damping: 15, mass: 1 });

  useEffect(() => {
    springValue.set(value);
  }, [value, springValue]);

  const displayValue = useTransform(springValue, (current) =>
    Math.round(current).toLocaleString()
  );

  return (
    <motion.button
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: "easeOut" }}
      onClick={onClick}
      className={cn(
        "relative w-full text-left p-5 rounded-xl border transition-all duration-300 overflow-hidden group",
        active
          ? "bg-bg-elevated border-opacity-50"
          : "glass-panel hover:bg-bg-elevated/80"
      )}
      style={{
        borderColor: active && statusColor ? statusColor : undefined,
        boxShadow:
          active && statusColor ? `inset 0 0 20px ${statusColor}15` : undefined,
      }}
    >
      {!active && statusColor && (
        <div
          className="absolute inset-0 opacity-0 group-hover:opacity-30 transition-opacity duration-300 pointer-events-none"
          style={{ border: `1px solid ${statusColor}`, borderRadius: "inherit" }}
        />
      )}

      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {!isTotal && statusColor && (
            <div
              className="w-2.5 h-2.5 rounded-full"
              style={{
                backgroundColor: statusColor,
                boxShadow: `0 0 12px ${statusColor}`,
              }}
            />
          )}
          <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
            {label}
          </span>
        </div>
        {isTotal && (
          <div className="w-16 h-4 flex items-end gap-0.5 opacity-50">
            {[4, 7, 3, 8, 5, 9, 6, 10, 8, 12].map((h, i) => (
              <motion.div
                key={i}
                initial={{ height: 0 }}
                animate={{ height: `${(h / 12) * 100}%` }}
                transition={{ duration: 0.5, delay: delay + i * 0.05 }}
                className="flex-1 bg-accent-blue rounded-t-sm"
              />
            ))}
          </div>
        )}
      </div>

      <div className="flex items-baseline gap-3">
        <motion.span className="font-display text-[42px] font-bold leading-none tracking-tight text-text-primary">
          {displayValue}
        </motion.span>
      </div>

      <div className="mt-2 text-xs font-mono text-text-muted">
        {isTotal ? "Total active crew" : `${percentage}% of fleet`}
      </div>
    </motion.button>
  );
}

export function StatCards() {
  const stats = useDashboardStore((s) => s.stats);
  const { setFilters, filters } = useCrewStore();

  const getCount = (status: CrewStatus) =>
    Number(stats?.statusCounts?.find((s) => s.status === status)?.count ?? 0);

  const totalCrew = stats?.statusCounts?.reduce((sum, s) => sum + Number(s.count), 0) ?? 0;

  const statConfig = [
    { label: "At Home", value: getCount("home"), statusColor: "#34D399", id: "home" as const },
    { label: "On Board", value: getCount("on_board"), statusColor: "#60A5FA", id: "on_board" as const },
    { label: "Traveling", value: getCount("in_transit"), statusColor: "#FBBF24", id: "in_transit" as const },
    { label: "Total Fleet", value: totalCrew, isTotal: true, id: "total" as const },
  ];

  return (
    <div className="grid grid-cols-4 gap-4 shrink-0">
      {statConfig.map((stat, i) => (
        <StatCard
          key={stat.label}
          label={stat.label}
          value={stat.value}
          total={totalCrew || 1}
          statusColor={stat.statusColor}
          isTotal={stat.isTotal}
          delay={i * 0.1}
          active={filters.status === stat.id}
          onClick={() =>
            stat.id === "total"
              ? setFilters({ status: "all" })
              : setFilters({ status: filters.status === stat.id ? "all" : stat.id })
          }
        />
      ))}
    </div>
  );
}
