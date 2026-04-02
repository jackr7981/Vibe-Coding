import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { Route, Plus, Plane } from "lucide-react";
import { format } from "date-fns";
import { Header } from "../components/layout/Header";
import type { TravelItinerary } from "../lib/types";

const STATUS_BADGE: Record<string, string> = {
  planned: "bg-bg-elevated text-text-secondary border-border-divider",
  active: "bg-accent-blue/20 text-accent-blue border-accent-blue/30",
  completed: "bg-[#34D399]/20 text-[#34D399] border-[#34D399]/30",
  cancelled: "bg-danger/20 text-danger border-danger/30",
};

export function Itineraries() {
  const [itineraries, setItineraries] = useState<TravelItinerary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      const { data } = await supabase
        .from("travel_itineraries")
        .select("*, crew_member:crew_members(full_name, rank), travel_legs(*)")
        .order("created_at", { ascending: false })
        .limit(50);
      if (data) setItineraries(data as TravelItinerary[]);
      setLoading(false);
    };
    fetchData();
  }, []);

  return (
    <>
      <Header />
      <div className="p-6 overflow-auto flex-1">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-display font-bold text-text-primary">Travel Itineraries</h2>
          <button className="flex items-center gap-2 bg-accent-blue hover:bg-accent-blue/90 text-white px-4 py-2 rounded-lg text-sm shadow-[0_0_15px_rgba(43,108,255,0.4)]">
            <Plus size={16} />
            New Itinerary
          </button>
        </div>

        <div className="space-y-3">
          {loading ? (
            <div className="text-text-muted text-sm">Loading...</div>
          ) : itineraries.length === 0 ? (
            <div className="glass-panel rounded-xl p-8 text-center text-text-muted">
              No travel itineraries yet
            </div>
          ) : (
            itineraries.map((it) => (
              <div
                key={it.id}
                className="glass-panel rounded-xl p-4 hover:bg-bg-elevated/80 transition-colors"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <Route size={16} className="text-text-muted" />
                    <div>
                      <span className="text-sm text-text-primary">
                        {it.crew_member?.full_name || "Unknown"}
                      </span>
                      <span className="text-xs text-text-muted ml-2">
                        {it.purpose || "General"}
                      </span>
                    </div>
                  </div>
                  <span
                    className={`text-xs px-2 py-1 rounded-full border ${STATUS_BADGE[it.status] || STATUS_BADGE.planned}`}
                  >
                    {it.status}
                  </span>
                </div>

                <div className="flex items-center gap-4 text-xs text-text-secondary">
                  <span>{it.origin_location || "Origin"}</span>
                  <span className="text-text-muted">{"→"}</span>
                  <span>{it.destination_location || "Destination"}</span>
                  {it.planned_start && (
                    <span className="ml-auto text-text-muted font-mono">
                      {format(new Date(it.planned_start), "MMM d, yyyy")}
                    </span>
                  )}
                </div>

                {it.travel_legs && it.travel_legs.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-border-divider space-y-2">
                    {it.travel_legs.map((leg) => (
                      <div key={leg.id} className="flex items-center gap-3 text-xs">
                        <Plane size={12} className="text-text-muted" />
                        <span className="text-text-secondary">
                          {leg.flight_number || leg.mode}
                        </span>
                        <span className="text-text-muted">
                          {leg.departure_airport_code} {"→"} {leg.arrival_airport_code}
                        </span>
                        {leg.departure_time && (
                          <span className="text-text-muted ml-auto font-mono">
                            {format(new Date(leg.departure_time), "MMM d HH:mm")}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
