import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { Search, Plus } from "lucide-react";
import { Header } from "../components/layout/Header";
import type { CrewMember } from "../lib/types";

const STATUS_COLORS: Record<string, string> = {
  home: "#34D399",
  on_board: "#60A5FA",
  in_transit: "#FBBF24",
  at_airport: "#F97316",
  at_port: "#A78BFA",
};

const STATUS_LABELS: Record<string, string> = {
  home: "At Home",
  in_transit: "In Transit",
  on_board: "On Board",
  at_airport: "At Airport",
  at_port: "At Port",
};

export function CrewManagement() {
  const [crew, setCrew] = useState<CrewMember[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      const { data } = await supabase
        .from("crew_with_coords")
        .select("id, employee_id, full_name, nationality, rank, department, current_status, current_location_label, assigned_vessel_id, vessel_name, lat, lng")
        .order("full_name");
      if (data) setCrew(data as CrewMember[]);
      setLoading(false);
    };
    fetchData();
  }, []);

  const filtered = crew.filter(
    (c) =>
      c.full_name.toLowerCase().includes(search.toLowerCase()) ||
      c.employee_id.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      <Header />
      <div className="p-6 overflow-auto flex-1">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-display font-bold text-text-primary">Crew Management</h2>
          <button className="flex items-center gap-2 bg-accent-blue hover:bg-accent-blue/90 text-white px-4 py-2 rounded-lg text-sm shadow-[0_0_15px_rgba(43,108,255,0.4)]">
            <Plus size={16} />
            Add Crew
          </button>
        </div>

        <div className="relative max-w-sm mb-4">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            placeholder="Search crew..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-bg-deepest border border-border-divider rounded-lg pl-9 pr-4 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-blue transition-colors"
          />
        </div>

        <div className="glass-panel rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-divider text-text-muted text-[10px] font-mono uppercase tracking-wider">
                <th className="text-left p-3">Name</th>
                <th className="text-left p-3">ID</th>
                <th className="text-left p-3">Rank</th>
                <th className="text-left p-3">Nationality</th>
                <th className="text-left p-3">Status</th>
                <th className="text-left p-3">Vessel</th>
                <th className="text-left p-3">Location</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="p-4 text-text-muted">
                    Loading...
                  </td>
                </tr>
              ) : (
                filtered.map((c) => (
                  <tr key={c.id} className="border-b border-border-divider/50 hover:bg-bg-elevated/30">
                    <td className="p-3 text-text-primary">{c.full_name}</td>
                    <td className="p-3 text-text-secondary font-mono text-xs">{c.employee_id}</td>
                    <td className="p-3 text-text-secondary">{c.rank}</td>
                    <td className="p-3 text-text-secondary">{c.nationality}</td>
                    <td className="p-3">
                      <span className="flex items-center gap-1.5">
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: STATUS_COLORS[c.current_status] }}
                        />
                        <span className="text-text-primary text-xs">{STATUS_LABELS[c.current_status]}</span>
                      </span>
                    </td>
                    <td className="p-3 text-text-secondary">{c.vessel_name || "-"}</td>
                    <td className="p-3 text-text-muted text-xs">{c.current_location_label || "-"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
