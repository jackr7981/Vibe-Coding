import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const authHeader = req.headers.get("Authorization")!;
  const {
    data: { user },
  } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("company_id")
    .eq("id", user.id)
    .single();

  const companyId = profile!.company_id;

  const [statusCounts, recentEvents, activeTrips, vesselCounts] = await Promise.all([
    supabase.rpc("get_status_counts", { p_company_id: companyId }),
    supabase
      .from("status_events")
      .select("*, crew_members(full_name, rank)")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("travel_itineraries")
      .select("*, crew_members(full_name, rank), travel_legs(*)")
      .eq("company_id", companyId)
      .eq("status", "active")
      .limit(50),
    supabase.rpc("get_vessel_crew_counts", { p_company_id: companyId }),
  ]);

  return new Response(
    JSON.stringify({
      statusCounts: statusCounts.data,
      recentEvents: recentEvents.data,
      activeTrips: activeTrips.data,
      vesselCounts: vesselCounts.data,
    }),
    { headers: { "Content-Type": "application/json" } }
  );
});
