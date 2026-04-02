import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { STATUS_COLORS, STATUS_LABELS } from "../lib/mapbox";
import { Search, Plus } from "lucide-react";
import type { CrewMember } from "../lib/types";

export function CrewManagement() {
  const [crew, setCrew] = useState<CrewMember[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from("crew_members")
        .select("*, assigned_vessel:vessels(id, name)")
        .order("full_name");
      if (data) setCrew(data as CrewMember[]);
      setLoading(false);
    };
    fetch();
  }, []);

  const filtered = crew.filter(
    (c) =>
      c.full_name.toLowerCase().includes(search.toLowerCase()) ||
      c.employee_id.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-white">Crew Management</h2>
        <button className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm">
          <Plus size={16} />
          Add Crew
        </button>
      </div>

      <div className="relative max-w-sm mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
        <input
          type="text"
          placeholder="Search crew..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-gray-900 border border-gray-800 rounded-lg pl-9 pr-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
        />
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-gray-500 text-xs">
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
                <td colSpan={7} className="p-4 text-gray-500">
                  Loading...
                </td>
              </tr>
            ) : (
              filtered.map((c) => (
                <tr key={c.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                  <td className="p-3 text-white">{c.full_name}</td>
                  <td className="p-3 text-gray-400 font-mono text-xs">{c.employee_id}</td>
                  <td className="p-3 text-gray-400">{c.rank}</td>
                  <td className="p-3 text-gray-400">{c.nationality}</td>
                  <td className="p-3">
                    <span className="flex items-center gap-1.5">
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: STATUS_COLORS[c.current_status] }}
                      />
                      <span className="text-gray-300">{STATUS_LABELS[c.current_status]}</span>
                    </span>
                  </td>
                  <td className="p-3 text-gray-400">{c.assigned_vessel?.name || "-"}</td>
                  <td className="p-3 text-gray-500 text-xs">{c.current_location_label || "-"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
