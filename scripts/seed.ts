import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || "https://bwcaybvzswyotbwhwkbr.supabase.co",
  process.env.SUPABASE_SERVICE_ROLE_KEY || ""
);

const NATIONALITIES = [
  { country: "Bangladesh", cities: ["Dhaka", "Chittagong", "Sylhet", "Khulna"] },
  { country: "India", cities: ["Mumbai", "Chennai", "Kolkata", "Visakhapatnam"] },
  { country: "Philippines", cities: ["Manila", "Cebu", "Davao", "Iloilo"] },
  { country: "Indonesia", cities: ["Jakarta", "Surabaya", "Medan", "Semarang"] },
  { country: "Ukraine", cities: ["Odessa", "Kherson", "Mykolaiv", "Mariupol"] },
];

const RANKS = [
  "Master", "Chief Officer", "2nd Officer", "3rd Officer",
  "Chief Engineer", "2nd Engineer", "3rd Engineer", "4th Engineer",
  "Bosun", "AB Seaman", "OS Seaman", "Fitter",
  "Oiler", "Wiper", "Cook", "Steward",
  "Electrician", "Motorman", "Cadet",
];

const DEPARTMENTS = ["Deck", "Engine", "Catering", "Deck", "Engine"];

const VESSELS = [
  { name: "MV Pacific Explorer", imo: "9876543", type: "Bulk Carrier", flag: "Panama", port: "Singapore", lat: 1.26, lng: 103.85 },
  { name: "MV Atlantic Pioneer", imo: "9876544", type: "Container Ship", flag: "Liberia", port: "Rotterdam", lat: 51.92, lng: 4.48 },
  { name: "MV Indian Ocean Star", imo: "9876545", type: "Oil Tanker", flag: "Marshall Islands", port: "Fujairah", lat: 25.12, lng: 56.35 },
  { name: "MV Arabian Gulf", imo: "9876546", type: "LNG Carrier", flag: "Bahamas", port: "Ras Laffan", lat: 25.93, lng: 51.53 },
  { name: "MV South China Breeze", imo: "9876547", type: "Chemical Tanker", flag: "Hong Kong", port: "Kaohsiung", lat: 22.61, lng: 120.29 },
  { name: "MV North Sea Titan", imo: "9876548", type: "FPSO", flag: "Norway", port: "Stavanger", lat: 58.97, lng: 5.73 },
  { name: "MV Mediterranean Sun", imo: "9876549", type: "RoRo", flag: "Malta", port: "Piraeus", lat: 37.94, lng: 23.64 },
  { name: "MV Bengal Tiger", imo: "9876550", type: "General Cargo", flag: "Singapore", port: "Chittagong", lat: 22.33, lng: 91.8 },
];

const AIRPORTS = [
  { code: "DXB", city: "Dubai", lat: 25.25, lng: 55.36 },
  { code: "SIN", city: "Singapore", lat: 1.36, lng: 103.99 },
  { code: "DOH", city: "Doha", lat: 25.27, lng: 51.61 },
  { code: "IST", city: "Istanbul", lat: 41.28, lng: 28.74 },
  { code: "MNL", city: "Manila", lat: 14.51, lng: 121.02 },
  { code: "DAC", city: "Dhaka", lat: 23.84, lng: 90.4 },
  { code: "CGP", city: "Chittagong", lat: 22.25, lng: 91.81 },
  { code: "BOM", city: "Mumbai", lat: 19.09, lng: 72.87 },
];

const HOME_LOCATIONS: Record<string, { lat: number; lng: number }> = {
  Dhaka: { lat: 23.81, lng: 90.41 },
  Chittagong: { lat: 22.36, lng: 91.78 },
  Sylhet: { lat: 24.9, lng: 91.87 },
  Khulna: { lat: 22.82, lng: 89.55 },
  Mumbai: { lat: 19.08, lng: 72.88 },
  Chennai: { lat: 13.08, lng: 80.27 },
  Kolkata: { lat: 22.57, lng: 88.36 },
  Visakhapatnam: { lat: 17.69, lng: 83.22 },
  Manila: { lat: 14.6, lng: 120.98 },
  Cebu: { lat: 10.31, lng: 123.89 },
  Davao: { lat: 7.07, lng: 125.61 },
  Iloilo: { lat: 10.7, lng: 122.56 },
  Jakarta: { lat: -6.21, lng: 106.85 },
  Surabaya: { lat: -7.25, lng: 112.75 },
  Medan: { lat: 3.59, lng: 98.67 },
  Semarang: { lat: -6.97, lng: 110.42 },
  Odessa: { lat: 46.48, lng: 30.74 },
  Kherson: { lat: 46.63, lng: 32.62 },
  Mykolaiv: { lat: 46.97, lng: 31.99 },
  Mariupol: { lat: 47.1, lng: 37.55 },
};

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomName(nationality: string): string {
  const firstNames: Record<string, string[]> = {
    Bangladesh: ["Mohammed", "Abdul", "Rashid", "Kamal", "Rahim", "Sohel", "Tareq", "Nasir", "Jamal", "Faruk"],
    India: ["Rajesh", "Sunil", "Vikram", "Anil", "Prakash", "Deepak", "Sanjay", "Ravi", "Manoj", "Ajay"],
    Philippines: ["Juan", "Jose", "Pedro", "Carlos", "Antonio", "Roberto", "Eduardo", "Fernando", "Francisco", "Miguel"],
    Indonesia: ["Agus", "Budi", "Dedi", "Eko", "Faisal", "Hadi", "Irwan", "Joko", "Kurniawan", "Lukman"],
    Ukraine: ["Oleksandr", "Dmytro", "Andriy", "Sergiy", "Mykola", "Yuriy", "Viktor", "Ivan", "Petro", "Volodymyr"],
  };
  const lastNames: Record<string, string[]> = {
    Bangladesh: ["Hossain", "Rahman", "Islam", "Ahmed", "Khan", "Miah", "Uddin", "Alam", "Chowdhury", "Sarker"],
    India: ["Kumar", "Sharma", "Singh", "Patel", "Das", "Reddy", "Gupta", "Verma", "Nair", "Pillai"],
    Philippines: ["Santos", "Reyes", "Cruz", "Bautista", "Del Rosario", "Garcia", "Ramos", "Mendoza", "Torres", "Flores"],
    Indonesia: ["Suryadi", "Widodo", "Santoso", "Pratama", "Setiawan", "Hidayat", "Nugroho", "Saputra", "Wibowo", "Hartono"],
    Ukraine: ["Kovalenko", "Bondarenko", "Tkachenko", "Shevchenko", "Kravchenko", "Boyko", "Melnyk", "Lysenko", "Marchenko", "Polishchuk"],
  };
  return `${pick(firstNames[nationality])} ${pick(lastNames[nationality])}`;
}

async function seed() {
  console.log("Seeding CrewTracker demo data...");

  // 1. Create company
  const { data: company } = await supabase
    .from("companies")
    .insert({
      name: "Excelerate Technical Management",
      slug: "excelerate-tm",
    })
    .select()
    .single();

  if (!company) {
    console.error("Failed to create company");
    return;
  }

  console.log(`Created company: ${company.name}`);

  // 2. Create vessels
  const vesselInserts = VESSELS.map((v) => ({
    company_id: company.id,
    name: v.name,
    imo_number: v.imo,
    vessel_type: v.type,
    flag_state: v.flag,
    current_port: v.port,
    current_location: `POINT(${v.lng} ${v.lat})`,
    status: "active",
  }));

  const { data: vessels } = await supabase.from("vessels").insert(vesselInserts).select();
  console.log(`Created ${vessels?.length} vessels`);

  // 3. Create 1000 crew members
  const crewInserts = [];
  const statusDistribution = {
    home: 620,
    on_board: 280,
    in_transit: 70,
    at_airport: 30,
  };

  let crewCount = 0;
  for (const [status, count] of Object.entries(statusDistribution)) {
    for (let i = 0; i < count; i++) {
      const nat = pick(NATIONALITIES);
      const city = pick(nat.cities);
      const homeCoords = HOME_LOCATIONS[city];
      const rank = pick(RANKS);
      const dept = rank.includes("Engineer") || rank.includes("Oiler") || rank.includes("Wiper") || rank.includes("Fitter") || rank.includes("Electrician") || rank.includes("Motorman")
        ? "Engine"
        : rank.includes("Cook") || rank.includes("Steward")
          ? "Catering"
          : "Deck";

      let currentLocation: string | null = null;
      let locationLabel: string | null = null;
      let vesselId: string | null = null;

      if (status === "home" && homeCoords) {
        const jitterLat = homeCoords.lat + (Math.random() - 0.5) * 0.5;
        const jitterLng = homeCoords.lng + (Math.random() - 0.5) * 0.5;
        currentLocation = `POINT(${jitterLng} ${jitterLat})`;
        locationLabel = `${city}, ${nat.country}`;
      } else if (status === "on_board" && vessels) {
        const vessel = pick(vessels);
        vesselId = vessel.id;
        const vCoords = VESSELS.find((v) => v.name === vessel.name)!;
        currentLocation = `POINT(${vCoords.lng + (Math.random() - 0.5) * 2} ${vCoords.lat + (Math.random() - 0.5) * 2})`;
        locationLabel = `On board ${vessel.name}`;
      } else if (status === "in_transit" || status === "at_airport") {
        const airport = pick(AIRPORTS);
        currentLocation = `POINT(${airport.lng + (Math.random() - 0.5) * 0.1} ${airport.lat + (Math.random() - 0.5) * 0.1})`;
        locationLabel = `${airport.city} (${airport.code})`;
      }

      crewCount++;
      crewInserts.push({
        company_id: company.id,
        employee_id: `ETM-${String(crewCount).padStart(4, "0")}`,
        full_name: randomName(nat.country),
        nationality: nat.country,
        rank,
        department: dept,
        home_country: nat.country,
        home_city: city,
        home_location: homeCoords ? `POINT(${homeCoords.lng} ${homeCoords.lat})` : null,
        current_status: status,
        current_location: currentLocation,
        current_location_label: locationLabel,
        assigned_vessel_id: vesselId,
      });
    }
  }

  // Insert in batches of 100
  for (let i = 0; i < crewInserts.length; i += 100) {
    const batch = crewInserts.slice(i, i + 100);
    const { error } = await supabase.from("crew_members").insert(batch);
    if (error) console.error(`Batch ${i / 100} failed:`, error.message);
    else console.log(`Inserted crew batch ${i / 100 + 1}/${Math.ceil(crewInserts.length / 100)}`);
  }

  // 4. Create status events
  const { data: allCrew } = await supabase
    .from("crew_members")
    .select("id, company_id, current_status")
    .eq("company_id", company.id)
    .limit(200);

  if (allCrew) {
    const events = allCrew.slice(0, 200).map((c) => ({
      company_id: c.company_id,
      crew_member_id: c.id,
      event_type: "status_change" as const,
      new_status: c.current_status,
      source: pick(["manual", "mobile_app", "agent", "system"]),
      notes: pick(["Routine update", "Status confirmed", "Auto-detected", null]),
      created_at: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(),
    }));

    const { error } = await supabase.from("status_events").insert(events);
    if (error) console.error("Events insert failed:", error.message);
    else console.log(`Created ${events.length} status events`);
  }

  console.log("Seed complete!");
}

seed().catch(console.error);
