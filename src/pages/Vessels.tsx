import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { Ship, Plus, MapPin } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Header } from "../components/layout/Header";
import type { Vessel } from "../lib/types";

export function Vessels() {
  const [vessels, setVessels] = useState<Vessel[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchData = async () => {
      const { data } = await supabase
        .from("vessels")
        .select("id, company_id, name, imo_number, vessel_type, flag_state, current_port, status, metadata, created_at")
        .order("name");
      if (data) setVessels(data);
      setLoading(false);
    };
    fetchData();
  }, []);

  return (
    <>
      <Header />
      <div className="p-6 overflow-auto flex-1">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-display font-bold text-text-primary">Vessels</h2>
          <button className="flex items-center gap-2 bg-accent-blue hover:bg-accent-blue/90 text-white px-4 py-2 rounded-lg text-sm shadow-[0_0_15px_rgba(43,108,255,0.4)]">
            <Plus size={16} />
            Add Vessel
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {loading ? (
            <div className="text-text-muted text-sm">Loading...</div>
          ) : (
            vessels.map((v) => (
              <div
                key={v.id}
                onClick={() => navigate(`/vessels/${v.id}`)}
                className="glass-panel rounded-xl p-4 hover:bg-bg-elevated/80 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 bg-accent-blue/20 rounded-lg flex items-center justify-center">
                    <Ship size={20} className="text-accent-blue" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-text-primary">{v.name}</div>
                    <div className="text-xs text-text-muted font-mono">{v.imo_number || "No IMO"}</div>
                  </div>
                </div>
                <div className="space-y-1.5 text-xs text-text-secondary">
                  <div className="flex justify-between">
                    <span>Type</span>
                    <span className="text-text-primary">{v.vessel_type || "N/A"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Flag</span>
                    <span className="text-text-primary">{v.flag_state || "N/A"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Status</span>
                    <span className="text-[#34D399]">{v.status}</span>
                  </div>
                  {v.current_port && (
                    <div className="flex items-center gap-1 text-text-muted mt-2">
                      <MapPin size={12} />
                      <span>{v.current_port}</span>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
