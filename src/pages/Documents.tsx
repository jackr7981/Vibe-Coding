import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { Header } from "../components/layout/Header";
import { FileText, Search } from "lucide-react";
import { format, differenceInDays } from "date-fns";
import { cn } from "../lib/utils";

interface DocRecord {
  id: string;
  crew_member_id: string;
  document_type: string;
  document_name: string;
  document_number: string | null;
  expiry_date: string | null;
  is_verified: boolean;
  crew_members: { full_name: string; rank: string | null }[] | null;
}

interface ExpirySummary {
  expired: number;
  expiring_30d: number;
  expiring_90d: number;
  valid: number;
}

export function Documents() {
  const [docs, setDocs] = useState<DocRecord[]>([]);
  const [summary, setSummary] = useState<ExpirySummary>({ expired: 0, expiring_30d: 0, expiring_90d: 0, valid: 0 });
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      const [docsRes, summaryRes] = await Promise.all([
        supabase
          .from("crew_documents")
          .select("id, crew_member_id, document_type, document_name, document_number, expiry_date, is_verified, crew_members(full_name, rank)")
          .order("expiry_date", { ascending: true })
          .limit(200),
        supabase.from("document_expiry_summary").select("*").limit(1).single(),
      ]);

      if (docsRes.data) setDocs(docsRes.data as DocRecord[]);
      if (summaryRes.data) setSummary(summaryRes.data);
      setLoading(false);
    };
    fetchData();
  }, []);

  const filtered = docs.filter((d) =>
    !search ||
    d.document_name.toLowerCase().includes(search.toLowerCase()) ||
    d.crew_members?.[0]?.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    d.document_type.toLowerCase().includes(search.toLowerCase())
  );

  const getExpiryStyle = (expiryDate: string | null) => {
    if (!expiryDate) return { text: "N/A", color: "text-text-muted" };
    const days = differenceInDays(new Date(expiryDate), new Date());
    if (days < 0) return { text: `${Math.abs(days)}d expired`, color: "text-danger" };
    if (days < 30) return { text: `${days}d left`, color: "text-danger" };
    if (days < 90) return { text: `${days}d left`, color: "text-[#FBBF24]" };
    return { text: `${days}d left`, color: "text-[#34D399]" };
  };

  return (
    <>
      <Header />
      <div className="p-6 overflow-auto flex-1">
        <h2 className="text-xl font-display font-bold text-text-primary mb-6">Document Compliance</h2>

        {/* Summary cards */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="glass-panel rounded-xl p-4 border-l-2 border-l-danger">
            <div className="text-2xl font-display font-bold text-danger">{summary.expired}</div>
            <div className="text-xs font-mono text-text-muted uppercase tracking-wider mt-1">Expired</div>
          </div>
          <div className="glass-panel rounded-xl p-4 border-l-2 border-l-[#F97316]">
            <div className="text-2xl font-display font-bold text-[#F97316]">{summary.expiring_30d}</div>
            <div className="text-xs font-mono text-text-muted uppercase tracking-wider mt-1">Expiring &lt;30d</div>
          </div>
          <div className="glass-panel rounded-xl p-4 border-l-2 border-l-[#FBBF24]">
            <div className="text-2xl font-display font-bold text-[#FBBF24]">{summary.expiring_90d}</div>
            <div className="text-xs font-mono text-text-muted uppercase tracking-wider mt-1">Expiring &lt;90d</div>
          </div>
          <div className="glass-panel rounded-xl p-4 border-l-2 border-l-[#34D399]">
            <div className="text-2xl font-display font-bold text-[#34D399]">{summary.valid}</div>
            <div className="text-xs font-mono text-text-muted uppercase tracking-wider mt-1">Valid</div>
          </div>
        </div>

        {/* Search */}
        <div className="relative max-w-sm mb-4">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            placeholder="Search documents..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-bg-deepest border border-border-divider rounded-lg pl-9 pr-4 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-blue transition-colors"
          />
        </div>

        {/* Table */}
        <div className="glass-panel rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-divider text-text-muted text-[10px] font-mono uppercase tracking-wider">
                <th className="text-left p-3">Crew</th>
                <th className="text-left p-3">Rank</th>
                <th className="text-left p-3">Document</th>
                <th className="text-left p-3">Number</th>
                <th className="text-left p-3">Expiry</th>
                <th className="text-left p-3">Status</th>
                <th className="text-left p-3">Verified</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="p-4 text-text-muted">Loading...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="p-4 text-text-muted text-center">No documents found</td></tr>
              ) : (
                filtered.map((d) => {
                  const expiry = getExpiryStyle(d.expiry_date);
                  return (
                    <tr key={d.id} className="border-b border-border-divider/50 hover:bg-bg-elevated/30">
                      <td className="p-3 text-text-primary">{d.crew_members?.[0]?.full_name || "-"}</td>
                      <td className="p-3 text-text-secondary text-xs">{d.crew_members?.[0]?.rank || "-"}</td>
                      <td className="p-3 text-text-primary flex items-center gap-2">
                        <FileText size={12} className="text-text-muted" />
                        {d.document_name}
                      </td>
                      <td className="p-3 text-text-secondary font-mono text-xs">{d.document_number || "-"}</td>
                      <td className="p-3 text-text-secondary text-xs font-mono">
                        {d.expiry_date ? format(new Date(d.expiry_date), "MMM dd, yyyy") : "-"}
                      </td>
                      <td className={cn("p-3 text-xs font-mono font-semibold", expiry.color)}>
                        {expiry.text}
                      </td>
                      <td className="p-3">
                        {d.is_verified ? (
                          <span className="text-[#34D399] text-xs">Verified</span>
                        ) : (
                          <span className="text-text-muted text-xs">Pending</span>
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
    </>
  );
}
