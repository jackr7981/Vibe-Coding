import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data: companies } = await supabase.from("companies").select("id");

  for (const company of companies || []) {
    await scanCompany(supabase, company.id);
  }

  return new Response(JSON.stringify({ success: true, scanned: companies?.length }), {
    headers: { "Content-Type": "application/json" },
  });
});

async function scanCompany(supabase: any, companyId: string) {
  const newAlerts: any[] = [];

  // RULE 1: Transit Timeout — crew in_transit or at_airport for >36 hours
  const { data: stuckCrew } = await supabase
    .from("crew_members")
    .select("id, full_name, current_status, last_status_update, current_location_label")
    .eq("company_id", companyId)
    .in("current_status", ["in_transit", "at_airport"])
    .lt("last_status_update", new Date(Date.now() - 36 * 3600000).toISOString());

  for (const crew of stuckCrew || []) {
    const hours = Math.round((Date.now() - new Date(crew.last_status_update).getTime()) / 3600000);
    newAlerts.push({
      company_id: companyId,
      category: "transit_timeout",
      severity: hours > 54 ? "critical" : "warning",
      title: `${crew.full_name} in transit for ${hours}h`,
      description: `Last reported at ${crew.current_location_label || "unknown"} ${hours} hours ago.`,
      crew_member_id: crew.id,
      metadata: { hours_in_transit: hours },
    });
  }

  // RULE 2: No Update — crew not at home with no update >12 hours
  const { data: silentCrew } = await supabase
    .from("crew_members")
    .select("id, full_name, current_status, last_status_update")
    .eq("company_id", companyId)
    .neq("current_status", "home")
    .lt("last_status_update", new Date(Date.now() - 12 * 3600000).toISOString());

  for (const crew of silentCrew || []) {
    newAlerts.push({
      company_id: companyId,
      category: "no_update",
      severity: "info",
      title: `No update from ${crew.full_name}`,
      description: `Last status: ${crew.current_status}. No update in over 12 hours.`,
      crew_member_id: crew.id,
    });
  }

  // RULE 3: Crew Change Risk — contract ending within 30 days
  const { data: expiringCrew } = await supabase
    .from("crew_members")
    .select("id, full_name, rank, contract_end_date, assigned_vessel_id")
    .eq("company_id", companyId)
    .eq("current_status", "on_board")
    .not("contract_end_date", "is", null)
    .lt("contract_end_date", new Date(Date.now() + 30 * 86400000).toISOString());

  for (const crew of expiringCrew || []) {
    const daysLeft = Math.round((new Date(crew.contract_end_date).getTime() - Date.now()) / 86400000);
    newAlerts.push({
      company_id: companyId,
      category: "crew_change_risk",
      severity: daysLeft <= 14 ? "critical" : "warning",
      title: `Crew change needed: ${crew.rank}`,
      description: `${crew.full_name}'s contract ends in ${daysLeft} days.`,
      crew_member_id: crew.id,
      vessel_id: crew.assigned_vessel_id,
      metadata: { days_remaining: daysLeft },
    });
  }

  // Deduplicate: skip if active alert already exists for same crew + category
  for (const alert of newAlerts) {
    const { data: existing } = await supabase
      .from("alerts")
      .select("id")
      .eq("company_id", companyId)
      .eq("category", alert.category)
      .eq("crew_member_id", alert.crew_member_id)
      .eq("status", "active")
      .limit(1);

    if (!existing?.length) {
      await supabase.from("alerts").insert(alert);
    }
  }
}
