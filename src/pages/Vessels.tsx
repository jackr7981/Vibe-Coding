import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { Ship, Plus, MapPin } from "lucide-react";
import type { Vessel } from "../lib/types";

export function Vessels() {
  const [vessels, setVessels] = useState<Vessel[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from("vessels")
        .select("*")
        .order("name");
      if (data) setVessels(data);
      setLoading(false);
    };
    fetch();
  }, []);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-white">Vessels</h2>
        <button className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm">
          <Plus size={16} />
          Add Vessel
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          <div className="text-gray-500 text-sm">Loading...</div>
        ) : (
          vessels.map((v) => (
            <div
              key={v.id}
              className="bg-gray-900 border border-gray-800 rounded-xl p-4 hover:border-gray-700 transition-colors"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-blue-600/20 rounded-lg flex items-center justify-center">
                  <Ship size={20} className="text-blue-400" />
                </div>
                <div>
                  <div className="text-sm font-medium text-white">{v.name}</div>
                  <div className="text-xs text-gray-500">{v.imo_number || "No IMO"}</div>
                </div>
              </div>
              <div className="space-y-1.5 text-xs text-gray-400">
                <div className="flex justify-between">
                  <span>Type</span>
                  <span className="text-gray-300">{v.vessel_type || "N/A"}</span>
                </div>
                <div className="flex justify-between">
                  <span>Flag</span>
                  <span className="text-gray-300">{v.flag_state || "N/A"}</span>
                </div>
                <div className="flex justify-between">
                  <span>Status</span>
                  <span className="text-green-400">{v.status}</span>
                </div>
                {v.current_port && (
                  <div className="flex items-center gap-1 text-gray-500 mt-2">
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
  );
}
