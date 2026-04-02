import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { Header } from "../components/layout/Header";
import { Ship, MapPin, Users, Anchor } from "lucide-react";
import { differenceInDays, format } from "date-fns";
import { cn } from "../lib/utils";
import type { Vessel } from "../lib/types";

export function VesselDetail() {
  const { id } = useParams<{ id: string }>();
  const [vessel, setVessel] = useState<Vessel | null>(null);
  const [crew, setCrew] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    const fetchData = async () => {
      const [vesselRes, crewRes] = await Promise.all([
        supabase.from("vessels").select("*").eq("id", id).single(),
        supabase
          .from("crew_with_coords")
          .select("id, full_name, rank, department, nationality, contract_start_date, contract_end_date, current_status, vessel_name")
          .eq("assigned_vessel_id", id)
          .order("department")
          .order("rank"),
      ]);

      if (vesselRes.data) setVessel(vesselRes.data);
      if (crewRes.data) setCrew(crewRes.data as any[]);
      setLoading(false);
    };
    fetchData();
  }, [id]);

  if (loading) return <><Header /><div className="p-6 text-text-muted">Loading...</div></>;
  if (!vessel) return <><Header /><div className="p-6 text-text-muted">Vessel not found</div></>;

  const departments: Record<string, any[]> = {};
  for (const c of crew) {
    const dept = c.department || "Other";
    if (!departments[dept]) departments[dept] = [];
    departments[dept].push(c);
  }

  const getDaysColor = (days: number | null) => {
    if (days == null) return "text-text-muted";
    if (days < 0) return "text-danger";
    if (days < 30) return "text-danger";
    if (days < 60) return "text-[#FBBF24]";
    return "text-[#34D399]";
  };

  return (
    <>
      <Header />
      <div className="p-6 overflow-auto flex-1">
        {/* Vessel header */}
        <div className="glass-panel rounded-xl p-6 mb-6 flex items-center gap-6">
          <div className="w-16 h-16 bg-accent-blue/20 rounded-xl flex items-center justify-center">
            <Ship size={32} className="text-accent-blue" />
          </div>
          <div className="flex-1">
            <h2 className="text-2xl font-display font-bold text-text-primary">{vessel.name}</h2>
            <div className="flex items-center gap-4 mt-1 text-sm text-text-secondary">
              <span>IMO: {vessel.imo_number || "N/A"}</span>
              <span>{vessel.vessel_type}</span>
              <span>Flag: {vessel.flag_state}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 text-text-secondary">
            <MapPin size={16} />
            <span className="text-sm">{vessel.current_port || "At Sea"}</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#34D399]/10 border border-[#34D399]/20">
            <Anchor size={14} className="text-[#34D399]" />
            <span className="text-xs font-mono uppercase text-[#34D399]">{vessel.status}</span>
          </div>
        </div>

        {/* Manning summary */}
        <div className="glass-panel rounded-xl p-4 mb-6 flex items-center gap-6">
          <Users size={20} className="text-accent-blue" />
          <span className="text-sm text-text-primary font-medium">{crew.length} crew on board</span>
          <div className="flex-1" />
          <span className="text-xs font-mono text-text-muted">
            {Object.keys(departments).length} departments
          </span>
        </div>

        {/* Crew manifest by department */}
        {Object.entries(departments).map(([dept, members]) => (
          <div key={dept} className="glass-panel rounded-xl overflow-hidden mb-4">
            <div className="px-4 py-3 border-b border-border-divider flex items-center justify-between">
              <span className="text-sm font-display font-bold text-text-primary uppercase">{dept} Department</span>
              <span className="text-[10px] font-mono text-text-muted">{members.length} crew</span>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-divider text-text-muted text-[10px] font-mono uppercase tracking-wider">
                  <th className="text-left p-3">Rank</th>
                  <th className="text-left p-3">Name</th>
                  <th className="text-left p-3">Nationality</th>
                  <th className="text-left p-3">Joined</th>
                  <th className="text-left p-3">Contract End</th>
                  <th className="text-left p-3">Days Left</th>
                </tr>
              </thead>
              <tbody>
                {members.map((c) => {
                  const daysLeft = c.contract_end_date
                    ? differenceInDays(new Date(c.contract_end_date), new Date())
                    : null;
                  return (
                    <tr key={c.id} className="border-b border-border-divider/50 hover:bg-bg-elevated/30">
                      <td className="p-3 text-text-secondary text-xs">{c.rank}</td>
                      <td className="p-3 text-text-primary">{c.full_name}</td>
                      <td className="p-3 text-text-secondary text-xs">{c.nationality}</td>
                      <td className="p-3 text-text-muted text-xs font-mono">
                        {c.contract_start_date ? format(new Date(c.contract_start_date), "MMM dd") : "-"}
                      </td>
                      <td className="p-3 text-text-muted text-xs font-mono">
                        {c.contract_end_date ? format(new Date(c.contract_end_date), "MMM dd") : "-"}
                      </td>
                      <td className={cn("p-3 text-xs font-mono font-semibold", getDaysColor(daysLeft))}>
                        {daysLeft != null ? (daysLeft < 0 ? `${Math.abs(daysLeft)}d over` : `${daysLeft}d`) : "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </>
  );
}
