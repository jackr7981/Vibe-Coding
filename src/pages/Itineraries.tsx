import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { Route, Plus, Plane } from "lucide-react";
import { format } from "date-fns";
import type { TravelItinerary } from "../lib/types";

const STATUS_BADGE: Record<string, string> = {
  planned: "bg-gray-700 text-gray-300",
  active: "bg-blue-600/20 text-blue-400",
  completed: "bg-green-600/20 text-green-400",
  cancelled: "bg-red-600/20 text-red-400",
};

export function Itineraries() {
  const [itineraries, setItineraries] = useState<TravelItinerary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from("travel_itineraries")
        .select("*, crew_member:crew_members(full_name, rank), travel_legs(*)")
        .order("created_at", { ascending: false })
        .limit(50);
      if (data) setItineraries(data as TravelItinerary[]);
      setLoading(false);
    };
    fetch();
  }, []);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-white">Travel Itineraries</h2>
        <button className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm">
          <Plus size={16} />
          New Itinerary
        </button>
      </div>

      <div className="space-y-3">
        {loading ? (
          <div className="text-gray-500 text-sm">Loading...</div>
        ) : (
          itineraries.map((it) => (
            <div
              key={it.id}
              className="bg-gray-900 border border-gray-800 rounded-xl p-4 hover:border-gray-700 transition-colors"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <Route size={16} className="text-gray-500" />
                  <div>
                    <span className="text-sm text-white">
                      {it.crew_member?.full_name || "Unknown"}
                    </span>
                    <span className="text-xs text-gray-500 ml-2">
                      {it.purpose || "General"}
                    </span>
                  </div>
                </div>
                <span
                  className={`text-xs px-2 py-1 rounded-full ${STATUS_BADGE[it.status] || STATUS_BADGE.planned}`}
                >
                  {it.status}
                </span>
              </div>

              <div className="flex items-center gap-4 text-xs text-gray-400">
                <span>{it.origin_location || "Origin"}</span>
                <span className="text-gray-600">{"→"}</span>
                <span>{it.destination_location || "Destination"}</span>
                {it.planned_start && (
                  <span className="ml-auto text-gray-500">
                    {format(new Date(it.planned_start), "MMM d, yyyy")}
                  </span>
                )}
              </div>

              {it.travel_legs && it.travel_legs.length > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-800 space-y-2">
                  {it.travel_legs.map((leg) => (
                    <div key={leg.id} className="flex items-center gap-3 text-xs">
                      <Plane size={12} className="text-gray-600" />
                      <span className="text-gray-400">
                        {leg.flight_number || leg.mode}
                      </span>
                      <span className="text-gray-500">
                        {leg.departure_airport_code} {"→"} {leg.arrival_airport_code}
                      </span>
                      {leg.departure_time && (
                        <span className="text-gray-600 ml-auto">
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
  );
}
