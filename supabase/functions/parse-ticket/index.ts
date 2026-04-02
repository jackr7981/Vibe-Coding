import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { itinerary_id, file_path } = await req.json();

  const { data: fileData, error: fileErr } = await supabase.storage
    .from("tickets")
    .download(file_path);

  if (fileErr)
    return new Response(JSON.stringify({ error: fileErr.message }), { status: 400 });

  const text = await fileData.text();

  // CSV parser: expect columns — airline, flight_number, pnr, dep_airport, arr_airport, dep_time, arr_time
  const lines = text.split("\n").filter((l) => l.trim());
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const rows = lines.slice(1).map((line) => {
    const vals = line.split(",").map((v) => v.trim());
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => (obj[h] = vals[i] || ""));
    return obj;
  });

  const legs = rows.map((row, i) => ({
    itinerary_id,
    leg_order: i + 1,
    mode: "flight",
    airline: row.airline || null,
    flight_number: row.flight_number || null,
    pnr: row.pnr || null,
    departure_airport_code: row.dep_airport || null,
    departure_location: row.dep_airport || null,
    departure_time: row.dep_time || null,
    arrival_airport_code: row.arr_airport || null,
    arrival_location: row.arr_airport || null,
    arrival_time: row.arr_time || null,
    status: "scheduled",
  }));

  const { data, error } = await supabase.from("travel_legs").insert(legs).select();

  if (error)
    return new Response(JSON.stringify({ error: error.message }), { status: 400 });

  return new Response(JSON.stringify({ parsed: data.length, legs: data }), {
    headers: { "Content-Type": "application/json" },
  });
});
