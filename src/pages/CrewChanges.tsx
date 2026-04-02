import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { Header } from "../components/layout/Header";
import { AlertTriangle, Ship } from "lucide-react";
import { format, differenceInDays } from "date-fns";
import { cn } from "../lib/utils";

interface CrewOnBoard {
  id: string;
  full_name: string;
  rank: string;
  department: string;
  nationality: string;
  contract_start_date: string | null;
  contract_end_date: string | null;
  assigned_vessel_id: string;
  vessel_name: string;
}

interface ChangeStats {
  total_changes_30d: number;
  unassigned_relief: number;
  relief_traveling: number;
  relief_assigned: number;
}


export function CrewChanges() {
  const [crewByVessel, setCrewByVessel] = useState<Record<string, CrewOnBoard[]>>({});
  const [stats, setStats] = useState<ChangeStats>({ total_changes_30d: 0, unassigned_relief: 0, relief_traveling: 0, relief_assigned: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      const { data } = await supabase
        .from("crew_with_coords")
        .select("id, full_name, rank, department, nationality, contract_start_date, contract_end_date, assigned_vessel_id, vessel_name")
        .eq("current_status", "on_board")
        .not("contract_end_date", "is", null)
        .order("contract_end_date");

      if (data) {
        const grouped: Record<string, CrewOnBoard[]> = {};
        let changes30d = 0;
        let unassigned = 0;

        for (const crew of data as CrewOnBoard[]) {
          const vesselKey = crew.vessel_name || "Unassigned";
          if (!grouped[vesselKey]) grouped[vesselKey] = [];
          grouped[vesselKey].push(crew);

          if (crew.contract_end_date) {
            const daysLeft = differenceInDays(new Date(crew.contract_end_date), new Date());
            if (daysLeft <= 30) {
              changes30d++;
              unassigned++; // Simplified — in production would check crew_change_plans
            }
          }
        }

        setCrewByVessel(grouped);
        setStats({
          total_changes_30d: changes30d,
          unassigned_relief: unassigned,
          relief_traveling: 0,
          relief_assigned: 0,
        });
      }
      setLoading(false);
    };
    fetchData();
  }, []);

  return (
    <>
      <Header />
      <div className="p-6 overflow-auto flex-1">
        <h2 className="text-xl font-display font-bold text-text-primary mb-6">Crew Change Planner</h2>

        {/* Summary stats */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="glass-panel rounded-xl p-4">
            <div className="text-2xl font-display font-bold text-text-primary">{stats.total_changes_30d}</div>
            <div className="text-xs font-mono text-text-muted uppercase tracking-wider mt-1">Changes in 30 days</div>
          </div>
          <div className="glass-panel rounded-xl p-4 border-l-2 border-l-danger">
            <div className="text-2xl font-display font-bold text-danger">{stats.unassigned_relief}</div>
            <div className="text-xs font-mono text-text-muted uppercase tracking-wider mt-1">Unassigned relief</div>
          </div>
          <div className="glass-panel rounded-xl p-4 border-l-2 border-l-[#FBBF24]">
            <div className="text-2xl font-display font-bold text-[#FBBF24]">{stats.relief_traveling}</div>
            <div className="text-xs font-mono text-text-muted uppercase tracking-wider mt-1">Relief traveling</div>
          </div>
          <div className="glass-panel rounded-xl p-4 border-l-2 border-l-accent-blue">
            <div className="text-2xl font-display font-bold text-accent-blue">{stats.relief_assigned}</div>
            <div className="text-xs font-mono text-text-muted uppercase tracking-wider mt-1">Relief assigned</div>
          </div>
        </div>

        {/* Timeline by vessel */}
        {loading ? (
          <div className="text-text-muted text-sm">Loading...</div>
        ) : Object.keys(crewByVessel).length === 0 ? (
          <div className="glass-panel rounded-xl p-8 text-center text-text-muted">
            No crew with contract dates on board
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(crewByVessel).map(([vesselName, crew]) => (
              <div key={vesselName} className="glass-panel rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-border-divider flex items-center gap-2">
                  <Ship size={14} className="text-accent-blue" />
                  <span className="text-sm font-display font-bold text-text-primary">{vesselName}</span>
                  <span className="text-[10px] font-mono text-text-muted ml-auto">{crew.length} crew</span>
                </div>
                <div className="divide-y divide-border-divider/50">
                  {crew.map((c) => {
                    const daysLeft = c.contract_end_date
                      ? differenceInDays(new Date(c.contract_end_date), new Date())
                      : null;
                    const barPercent = daysLeft != null ? Math.max(0, Math.min(100, (daysLeft / 180) * 100)) : 0;
                    const barColor =
                      daysLeft == null ? "#3e4f6a" :
                      daysLeft < 0 ? "#EF4444" :
                      daysLeft < 30 ? "#EF4444" :
                      daysLeft < 60 ? "#FBBF24" : "#34D399";

                    return (
                      <div key={c.id} className="px-4 py-3 flex items-center gap-4 hover:bg-bg-elevated/30 transition-colors">
                        <div className="w-24 text-xs text-text-secondary truncate">{c.rank}</div>
                        <div className="w-36 text-sm text-text-primary truncate">{c.full_name}</div>

                        {/* Contract bar */}
                        <div className="flex-1 relative h-5 bg-bg-deepest rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{ width: `${barPercent}%`, backgroundColor: barColor }}
                          />
                          {daysLeft != null && (
                            <span className="absolute inset-0 flex items-center justify-center text-[10px] font-mono text-text-primary">
                              {daysLeft < 0 ? `${Math.abs(daysLeft)}d overdue` : `${daysLeft}d left`}
                            </span>
                          )}
                        </div>

                        <div className="w-24 text-right text-xs text-text-muted font-mono">
                          {c.contract_end_date ? format(new Date(c.contract_end_date), "MMM dd") : "N/A"}
                        </div>

                        <div className="w-28">
                          <span className={cn(
                            "inline-flex items-center gap-1 px-2 py-1 rounded text-[9px] font-mono uppercase tracking-wider border",
                            "text-[#EF4444] bg-[#EF4444]/10 border-[#EF4444]/20"
                          )}>
                            <AlertTriangle size={10} />
                            Unassigned
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
