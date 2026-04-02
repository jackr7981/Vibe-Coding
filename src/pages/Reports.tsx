import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { Header } from "../components/layout/Header";
import {
  PieChart, Pie, Cell, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";

interface StatusData { status: string; count: number }
interface VesselData { vessel_name: string; crew_count: number }

const STATUS_COLORS: Record<string, string> = {
  home: "#34D399",
  on_board: "#60A5FA",
  in_transit: "#FBBF24",
  at_airport: "#F97316",
  at_port: "#A78BFA",
};

const STATUS_LABELS: Record<string, string> = {
  home: "At Home",
  on_board: "On Board",
  in_transit: "In Transit",
  at_airport: "At Airport",
  at_port: "At Port",
};

export function Reports() {
  const [statusData, setStatusData] = useState<StatusData[]>([]);
  const [vesselData, setVesselData] = useState<VesselData[]>([]);
  const [totalCrew, setTotalCrew] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      const { data: company } = await supabase.from("companies").select("id").limit(1).single();
      if (!company) { setLoading(false); return; }

      const [statusRes, vesselRes] = await Promise.all([
        supabase.rpc("get_status_counts", { p_company_id: company.id }),
        supabase.rpc("get_vessel_crew_counts", { p_company_id: company.id }),
      ]);

      if (statusRes.data) {
        const d = statusRes.data.map((s: any) => ({ status: s.status, count: Number(s.count) }));
        setStatusData(d);
        setTotalCrew(d.reduce((sum: number, s: StatusData) => sum + s.count, 0));
      }
      if (vesselRes.data) {
        setVesselData(vesselRes.data.map((v: any) => ({ vessel_name: v.vessel_name, crew_count: Number(v.crew_count) })));
      }
      setLoading(false);
    };
    fetchData();
  }, []);

  return (
    <>
      <Header />
      <div className="p-6 overflow-auto flex-1">
        <h2 className="text-xl font-display font-bold text-text-primary mb-6">Reports & Analytics</h2>

        {loading ? (
          <div className="text-text-muted text-sm">Loading...</div>
        ) : (
          <>
            {/* Top metrics */}
            <div className="grid grid-cols-4 gap-4 mb-6">
              <div className="glass-panel rounded-xl p-4">
                <div className="text-2xl font-display font-bold text-text-primary">{totalCrew}</div>
                <div className="text-xs font-mono text-text-muted uppercase tracking-wider mt-1">Total Crew</div>
              </div>
              <div className="glass-panel rounded-xl p-4">
                <div className="text-2xl font-display font-bold text-accent-blue">
                  {statusData.find((s) => s.status === "on_board")?.count || 0}
                </div>
                <div className="text-xs font-mono text-text-muted uppercase tracking-wider mt-1">On Board</div>
              </div>
              <div className="glass-panel rounded-xl p-4">
                <div className="text-2xl font-display font-bold text-[#FBBF24]">
                  {(statusData.find((s) => s.status === "in_transit")?.count || 0) +
                   (statusData.find((s) => s.status === "at_airport")?.count || 0)}
                </div>
                <div className="text-xs font-mono text-text-muted uppercase tracking-wider mt-1">Traveling</div>
              </div>
              <div className="glass-panel rounded-xl p-4">
                <div className="text-2xl font-display font-bold text-[#34D399]">
                  {vesselData.length}
                </div>
                <div className="text-xs font-mono text-text-muted uppercase tracking-wider mt-1">Active Vessels</div>
              </div>
            </div>

            {/* Charts */}
            <div className="grid grid-cols-2 gap-6">
              {/* Status distribution donut */}
              <div className="glass-panel rounded-xl p-6">
                <h3 className="text-sm font-display font-bold text-text-primary mb-4">Crew Status Distribution</h3>
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={statusData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      dataKey="count"
                      nameKey="status"
                      strokeWidth={0}
                    >
                      {statusData.map((entry) => (
                        <Cell key={entry.status} fill={STATUS_COLORS[entry.status] || "#888"} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ background: "#0a1120", border: "1px solid #162240", borderRadius: "8px" }}
                      labelStyle={{ color: "#e2e8f4" }}
                      itemStyle={{ color: "#7a8ba8" }}
                      formatter={(value: any, name: any) => [value, STATUS_LABELS[name as string] || name]}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-wrap gap-3 mt-2 justify-center">
                  {statusData.map((s) => (
                    <div key={s.status} className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: STATUS_COLORS[s.status] }} />
                      <span className="text-[10px] font-mono text-text-secondary">{STATUS_LABELS[s.status] || s.status}: {s.count}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Vessel crew counts bar chart */}
              <div className="glass-panel rounded-xl p-6">
                <h3 className="text-sm font-display font-bold text-text-primary mb-4">Crew per Vessel</h3>
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={vesselData} layout="vertical" margin={{ left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#162240" />
                    <XAxis type="number" tick={{ fill: "#7a8ba8", fontSize: 11 }} />
                    <YAxis
                      type="category"
                      dataKey="vessel_name"
                      width={140}
                      tick={{ fill: "#e2e8f4", fontSize: 11 }}
                    />
                    <Tooltip
                      contentStyle={{ background: "#0a1120", border: "1px solid #162240", borderRadius: "8px" }}
                      labelStyle={{ color: "#e2e8f4" }}
                      itemStyle={{ color: "#7a8ba8" }}
                    />
                    <Bar dataKey="crew_count" fill="#2b6cff" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
