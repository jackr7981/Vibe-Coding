import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { Search, Plus, AlertTriangle, Clock } from "lucide-react";
import { differenceInDays, parseISO } from "date-fns";
import { Header } from "../components/layout/Header";
import { CrewProfilePanel } from "../components/crew/CrewProfilePanel";
import type { CrewMember } from "../lib/types";

const STATUS_COLORS: Record<string, string> = {
  home: "#34D399", on_board: "#60A5FA",
  in_transit: "#FBBF24", at_airport: "#F97316", at_port: "#A78BFA",
};
const STATUS_LABELS: Record<string, string> = {
  home: "At Home", in_transit: "In Transit",
  on_board: "On Board", at_airport: "At Airport", at_port: "At Port",
};


function ContractBadge({ crew }: { crew: CrewMember }) {
  if (!crew.contract_end_date) return null;
  const days = differenceInDays(parseISO(crew.contract_end_date), new Date());
  if (days < 0)
    return (
      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded"
        style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.25)" }}>
        Overdue
      </span>
    );
  if (days <= 30)
    return (
      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded"
        style={{ background: "rgba(249,115,22,0.1)", color: "#f97316", border: "1px solid rgba(249,115,22,0.25)" }}>
        {days}d left
      </span>
    );
  if (days <= 90)
    return (
      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded"
        style={{ background: "rgba(251,191,36,0.1)", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.25)" }}>
        {days}d left
      </span>
    );
  return null;
}

export function CrewManagement() {
  const [crew, setCrew]       = useState<CrewMember[]>([]);
  const [search, setSearch]   = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  useEffect(() => {
    const fetchData = async () => {
      const { data } = await supabase
        .from("crew_with_coords")
        .select("*")
        .order("full_name");
      if (data) setCrew(data as CrewMember[]);
      setLoading(false);
    };
    fetchData();
  }, []);

  const filtered = crew.filter((c) => {
    const matchSearch =
      c.full_name.toLowerCase().includes(search.toLowerCase()) ||
      c.employee_id.toLowerCase().includes(search.toLowerCase()) ||
      (c.rank ?? "").toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || c.current_status === statusFilter;
    return matchSearch && matchStatus;
  });

  // Summary counts
  const counts = {
    all: crew.length,
    home: crew.filter((c) => c.current_status === "home").length,
    on_board: crew.filter((c) => c.current_status === "on_board").length,
    in_transit: crew.filter((c) => c.current_status === "in_transit").length,
  };

  return (
    <>
      <Header />

      <div className="flex flex-col flex-1 overflow-hidden">
        <div className="px-6 pt-5 pb-0 shrink-0">
          {/* Title row */}
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-xl font-display font-bold text-text-primary">Crew Management</h2>
              <p className="text-xs text-text-muted mt-0.5">{crew.length} total crew members</p>
            </div>
            <button className="flex items-center gap-2 bg-accent-blue hover:bg-accent-blue/90 text-white px-4 py-2 rounded-lg text-sm font-medium shadow-[0_0_15px_rgba(43,108,255,0.3)] transition-all">
              <Plus size={15} />
              Add Crew
            </button>
          </div>

          {/* Filter tabs */}
          <div className="flex items-center gap-1 mb-4">
            {(["all", "home", "on_board", "in_transit"] as const).map((s) => {
              const label = s === "all" ? "All" : STATUS_LABELS[s] ?? s;
              const count = counts[s];
              const active = statusFilter === s;
              const color = s === "all" ? undefined : STATUS_COLORS[s];
              return (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                  style={{
                    background: active ? (color ? `${color}18` : "rgba(43,108,255,0.15)") : "transparent",
                    border: `1px solid ${active ? (color ?? "#2b6cff") + "40" : "transparent"}`,
                    color: active ? (color ?? "#60a5fa") : "#7a8ba8",
                  }}
                >
                  {color && (
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                  )}
                  {label}
                  <span className="font-mono text-[10px] opacity-70">{count}</span>
                </button>
              );
            })}

            {/* Search */}
            <div className="relative ml-auto">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                type="text"
                placeholder="Search name, ID, rank…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="bg-bg-deepest border border-border-divider rounded-lg pl-8 pr-4 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-blue transition-colors w-56"
              />
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto px-6 pb-6">
          <div className="glass-panel rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10" style={{ background: "#0a1120" }}>
                <tr className="border-b border-border-divider text-text-muted text-[10px] font-mono uppercase tracking-wider">
                  <th className="text-left px-4 py-3">Name / Rank</th>
                  <th className="text-left px-4 py-3">ID</th>
                  <th className="text-left px-4 py-3">Nationality</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-left px-4 py-3">Vessel</th>
                  <th className="text-left px-4 py-3">Location</th>
                  <th className="text-left px-4 py-3">Contract</th>
                  <th className="text-left px-4 py-3">Docs</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-text-muted text-center text-sm">
                      Loading crew…
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-text-muted text-center text-sm">
                      No crew match your search
                    </td>
                  </tr>
                ) : (
                  filtered.map((c) => {
                    const isSelected = c.id === selectedId;
                    const contractDays = c.contract_end_date
                      ? differenceInDays(parseISO(c.contract_end_date), new Date())
                      : null;
                    const docAlert = contractDays !== null && contractDays <= 0
                      ? "expired"
                      : contractDays !== null && contractDays <= 30
                      ? "critical"
                      : null;

                    return (
                      <tr
                        key={c.id}
                        onClick={() => setSelectedId(c.id === selectedId ? null : c.id)}
                        className="border-b border-border-divider/40 cursor-pointer transition-colors"
                        style={{
                          background: isSelected ? "rgba(43,108,255,0.08)" : undefined,
                        }}
                        onMouseEnter={(e) => !isSelected && (e.currentTarget.style.background = "rgba(255,255,255,0.03)")}
                        onMouseLeave={(e) => !isSelected && (e.currentTarget.style.background = "")}
                      >
                        {/* Name / Rank */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div
                              className="w-8 h-8 rounded-lg flex items-center justify-center text-[11px] font-bold shrink-0"
                              style={{
                                background: `${STATUS_COLORS[c.current_status]}18`,
                                color: STATUS_COLORS[c.current_status],
                                border: `1px solid ${STATUS_COLORS[c.current_status]}30`,
                              }}
                            >
                              {c.full_name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                            </div>
                            <div>
                              <div className="text-sm font-medium text-text-primary">{c.full_name}</div>
                              <div className="text-[10px] text-text-muted">{c.rank ?? "—"}</div>
                            </div>
                          </div>
                        </td>

                        <td className="px-4 py-3 font-mono text-xs text-text-secondary">{c.employee_id}</td>
                        <td className="px-4 py-3 text-xs text-text-secondary">{c.nationality ?? "—"}</td>

                        {/* Status */}
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1.5 text-xs">
                            <span
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{ backgroundColor: STATUS_COLORS[c.current_status] }}
                            />
                            <span style={{ color: STATUS_COLORS[c.current_status] }}>
                              {STATUS_LABELS[c.current_status]}
                            </span>
                          </span>
                        </td>

                        <td className="px-4 py-3 text-xs text-text-secondary truncate max-w-[120px]">
                          {c.vessel_name ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-xs text-text-muted truncate max-w-[140px]">
                          {c.current_location_label ?? "—"}
                        </td>

                        {/* Contract */}
                        <td className="px-4 py-3">
                          <ContractBadge crew={c} />
                          {!c.contract_end_date && (
                            <span className="text-[10px] text-text-muted font-mono">—</span>
                          )}
                        </td>

                        {/* Doc alerts */}
                        <td className="px-4 py-3">
                          {docAlert === "expired" && (
                            <AlertTriangle className="w-4 h-4" style={{ color: "#ef4444" }} />
                          )}
                          {docAlert === "critical" && (
                            <Clock className="w-4 h-4" style={{ color: "#f97316" }} />
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Profile panel */}
      <CrewProfilePanel
        crewId={selectedId}
        onClose={() => setSelectedId(null)}
      />
    </>
  );
}
