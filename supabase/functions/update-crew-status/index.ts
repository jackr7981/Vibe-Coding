import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

interface StatusUpdate {
  crew_member_id: string;
  new_status: string;
  location_lat?: number;
  location_lng?: number;
  location_label?: string;
  travel_leg_id?: string;
  notes?: string;
  source?: string;
}

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

  const body: StatusUpdate = await req.json();

  // Get current crew state
  const { data: crew } = await supabase
    .from("crew_members")
    .select("id, current_status, company_id")
    .eq("id", body.crew_member_id)
    .single();

  if (!crew) return new Response("Crew not found", { status: 404 });

  // Build location point
  const locationPoint =
    body.location_lat && body.location_lng
      ? `POINT(${body.location_lng} ${body.location_lat})`
      : null;

  // Update crew member
  const updatePayload: Record<string, unknown> = {
    current_status: body.new_status,
    current_location_label: body.location_label || null,
    last_status_update: new Date().toISOString(),
  };
  if (locationPoint) updatePayload.current_location = locationPoint;

  await supabase.from("crew_members").update(updatePayload).eq("id", body.crew_member_id);

  // Create event log
  await supabase.from("status_events").insert({
    company_id: crew.company_id,
    crew_member_id: body.crew_member_id,
    event_type: "status_change",
    previous_status: crew.current_status,
    new_status: body.new_status,
    location: locationPoint,
    location_label: body.location_label,
    travel_leg_id: body.travel_leg_id,
    reported_by: user.id,
    source: body.source || "manual",
    notes: body.notes,
  });

  // Notify crew managers
  const { data: managers } = await supabase
    .from("profiles")
    .select("id")
    .eq("company_id", crew.company_id)
    .in("role", ["crew_manager", "admin"]);

  if (managers?.length) {
    const notifications = managers.map((m) => ({
      company_id: crew.company_id,
      recipient_id: m.id,
      title: "Crew status update",
      body: `Crew member is now ${body.new_status}`,
      type: "info",
      related_crew_id: body.crew_member_id,
    }));
    await supabase.from("notifications").insert(notifications);
  }

  return new Response(JSON.stringify({ success: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
