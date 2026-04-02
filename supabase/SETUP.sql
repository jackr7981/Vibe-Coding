-- ============================================================
-- CrewTracker — Complete Supabase Setup SQL
-- Run this ONCE in Supabase Dashboard > SQL Editor
-- ============================================================

-- ========================
-- 1. Extensions
-- ========================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- ========================
-- 2. ENUM Types
-- ========================
CREATE TYPE crew_status AS ENUM ('home', 'in_transit', 'at_airport', 'on_board', 'at_port');
CREATE TYPE user_role AS ENUM ('admin', 'crew_manager', 'operations', 'crew', 'agent');
CREATE TYPE travel_leg_status AS ENUM ('scheduled', 'active', 'completed', 'cancelled', 'delayed');
CREATE TYPE event_type AS ENUM (
  'status_change', 'location_update', 'checkin',
  'flight_departed', 'flight_arrived', 'agent_pickup',
  'agent_dropoff', 'vessel_joined', 'vessel_left'
);

-- ========================
-- 3. Core Tables
-- ========================

CREATE TABLE companies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  logo_url TEXT,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies(id) NOT NULL,
  role user_role NOT NULL DEFAULT 'crew',
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE vessels (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID REFERENCES companies(id) NOT NULL,
  name TEXT NOT NULL,
  imo_number TEXT,
  vessel_type TEXT,
  flag_state TEXT,
  current_location GEOGRAPHY(POINT, 4326),
  current_port TEXT,
  status TEXT DEFAULT 'active',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE crew_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id UUID REFERENCES profiles(id),
  company_id UUID REFERENCES companies(id) NOT NULL,
  employee_id TEXT NOT NULL,
  full_name TEXT NOT NULL,
  nationality TEXT,
  rank TEXT,
  department TEXT,
  passport_number TEXT,
  cdc_number TEXT,
  phone TEXT,
  emergency_contact JSONB,
  home_location GEOGRAPHY(POINT, 4326),
  home_country TEXT,
  home_city TEXT,
  current_status crew_status DEFAULT 'home',
  current_location GEOGRAPHY(POINT, 4326),
  current_location_label TEXT,
  assigned_vessel_id UUID REFERENCES vessels(id),
  last_status_update TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, employee_id)
);

CREATE INDEX idx_crew_location ON crew_members USING GIST(current_location);
CREATE INDEX idx_crew_status ON crew_members(company_id, current_status);
CREATE INDEX idx_crew_vessel ON crew_members(assigned_vessel_id);

-- ========================
-- 4. Travel Tables
-- ========================

CREATE TABLE travel_itineraries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID REFERENCES companies(id) NOT NULL,
  crew_member_id UUID REFERENCES crew_members(id) NOT NULL,
  purpose TEXT,
  origin_location TEXT,
  destination_location TEXT,
  destination_vessel_id UUID REFERENCES vessels(id),
  status TEXT DEFAULT 'planned',
  planned_start TIMESTAMPTZ,
  planned_end TIMESTAMPTZ,
  actual_start TIMESTAMPTZ,
  actual_end TIMESTAMPTZ,
  notes TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE travel_legs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  itinerary_id UUID REFERENCES travel_itineraries(id) ON DELETE CASCADE,
  leg_order INT NOT NULL,
  mode TEXT DEFAULT 'flight',
  airline TEXT,
  flight_number TEXT,
  pnr TEXT,
  booking_reference TEXT,
  ticket_url TEXT,
  departure_location TEXT,
  departure_airport_code TEXT,
  departure_time TIMESTAMPTZ,
  arrival_location TEXT,
  arrival_airport_code TEXT,
  arrival_time TIMESTAMPTZ,
  status travel_leg_status DEFAULT 'scheduled',
  actual_departure TIMESTAMPTZ,
  actual_arrival TIMESTAMPTZ,
  pickup_agent_id UUID REFERENCES profiles(id),
  dropoff_agent_id UUID REFERENCES profiles(id),
  pickup_confirmed BOOLEAN DEFAULT FALSE,
  dropoff_confirmed BOOLEAN DEFAULT FALSE,
  pickup_time TIMESTAMPTZ,
  dropoff_time TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_legs_itinerary ON travel_legs(itinerary_id, leg_order);
CREATE INDEX idx_legs_pnr ON travel_legs(pnr);

-- ========================
-- 5. Events & Notifications
-- ========================

CREATE TABLE status_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID REFERENCES companies(id) NOT NULL,
  crew_member_id UUID REFERENCES crew_members(id) NOT NULL,
  event_type event_type NOT NULL,
  previous_status crew_status,
  new_status crew_status,
  location GEOGRAPHY(POINT, 4326),
  location_label TEXT,
  travel_leg_id UUID REFERENCES travel_legs(id),
  reported_by UUID REFERENCES profiles(id),
  source TEXT DEFAULT 'manual',
  notes TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_events_crew ON status_events(crew_member_id, created_at DESC);
CREATE INDEX idx_events_company ON status_events(company_id, created_at DESC);

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID REFERENCES companies(id) NOT NULL,
  recipient_id UUID REFERENCES profiles(id) NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  type TEXT,
  related_crew_id UUID REFERENCES crew_members(id),
  related_itinerary_id UUID REFERENCES travel_itineraries(id),
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ========================
-- 6. RLS — Open Access (Demo Mode)
-- ========================

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE vessels ENABLE ROW LEVEL SECURITY;
ALTER TABLE crew_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE travel_itineraries ENABLE ROW LEVEL SECURITY;
ALTER TABLE travel_legs ENABLE ROW LEVEL SECURITY;
ALTER TABLE status_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Open read access for anon (demo — no login required)
CREATE POLICY "public_read_companies" ON companies FOR SELECT USING (true);
CREATE POLICY "public_read_vessels" ON vessels FOR SELECT USING (true);
CREATE POLICY "public_read_crew" ON crew_members FOR SELECT USING (true);
CREATE POLICY "public_read_itineraries" ON travel_itineraries FOR SELECT USING (true);
CREATE POLICY "public_read_legs" ON travel_legs FOR SELECT USING (true);
CREATE POLICY "public_read_events" ON status_events FOR SELECT USING (true);
CREATE POLICY "public_read_notifications" ON notifications FOR SELECT USING (true);

-- ========================
-- 7. RPC Functions (Dashboard Stats)
-- ========================

CREATE OR REPLACE FUNCTION get_status_counts(p_company_id UUID)
RETURNS TABLE(status crew_status, count BIGINT) AS $$
  SELECT current_status, COUNT(*)
  FROM crew_members
  WHERE company_id = p_company_id
  GROUP BY current_status;
$$ LANGUAGE SQL SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_vessel_crew_counts(p_company_id UUID)
RETURNS TABLE(vessel_id UUID, vessel_name TEXT, crew_count BIGINT) AS $$
  SELECT v.id, v.name, COUNT(cm.id)
  FROM vessels v
  LEFT JOIN crew_members cm ON cm.assigned_vessel_id = v.id AND cm.current_status = 'on_board'
  WHERE v.company_id = p_company_id
  GROUP BY v.id, v.name;
$$ LANGUAGE SQL SECURITY DEFINER;

-- ========================
-- 8. Seed Data (1000 crew, 8 vessels)
-- ========================

-- Company
INSERT INTO companies (id, name, slug) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Excelerate Technical Management', 'excelerate-tm');

-- Vessels
INSERT INTO vessels (company_id, name, imo_number, vessel_type, flag_state, current_port, current_location, status) VALUES
  ('11111111-1111-1111-1111-111111111111', 'MV Pacific Explorer', '9876543', 'Bulk Carrier', 'Panama', 'Singapore', ST_MakePoint(103.85, 1.26)::geography, 'active'),
  ('11111111-1111-1111-1111-111111111111', 'MV Atlantic Pioneer', '9876544', 'Container Ship', 'Liberia', 'Rotterdam', ST_MakePoint(4.48, 51.92)::geography, 'active'),
  ('11111111-1111-1111-1111-111111111111', 'MV Indian Ocean Star', '9876545', 'Oil Tanker', 'Marshall Islands', 'Fujairah', ST_MakePoint(56.35, 25.12)::geography, 'active'),
  ('11111111-1111-1111-1111-111111111111', 'MV Arabian Gulf', '9876546', 'LNG Carrier', 'Bahamas', 'Ras Laffan', ST_MakePoint(51.53, 25.93)::geography, 'active'),
  ('11111111-1111-1111-1111-111111111111', 'MV South China Breeze', '9876547', 'Chemical Tanker', 'Hong Kong', 'Kaohsiung', ST_MakePoint(120.29, 22.61)::geography, 'active'),
  ('11111111-1111-1111-1111-111111111111', 'MV North Sea Titan', '9876548', 'FPSO', 'Norway', 'Stavanger', ST_MakePoint(5.73, 58.97)::geography, 'active'),
  ('11111111-1111-1111-1111-111111111111', 'MV Mediterranean Sun', '9876549', 'RoRo', 'Malta', 'Piraeus', ST_MakePoint(23.64, 37.94)::geography, 'active'),
  ('11111111-1111-1111-1111-111111111111', 'MV Bengal Tiger', '9876550', 'General Cargo', 'Singapore', 'Chittagong', ST_MakePoint(91.8, 22.33)::geography, 'active');

-- Helper function to generate crew in bulk
DO $$
DECLARE
  v_company_id UUID := '11111111-1111-1111-1111-111111111111';
  v_vessel_ids UUID[];
  v_idx INT := 0;
  v_status TEXT;
  v_name TEXT;
  v_nationality TEXT;
  v_city TEXT;
  v_rank TEXT;
  v_dept TEXT;
  v_lat DOUBLE PRECISION;
  v_lng DOUBLE PRECISION;
  v_vessel_id UUID;
  v_location_label TEXT;

  -- Arrays
  countries TEXT[] := ARRAY['Bangladesh','India','Philippines','Indonesia','Ukraine'];
  cities_bd TEXT[] := ARRAY['Dhaka','Chittagong','Sylhet','Khulna'];
  cities_in TEXT[] := ARRAY['Mumbai','Chennai','Kolkata','Visakhapatnam'];
  cities_ph TEXT[] := ARRAY['Manila','Cebu','Davao','Iloilo'];
  cities_id TEXT[] := ARRAY['Jakarta','Surabaya','Medan','Semarang'];
  cities_ua TEXT[] := ARRAY['Odessa','Kherson','Mykolaiv','Mariupol'];

  first_bd TEXT[] := ARRAY['Mohammed','Abdul','Rashid','Kamal','Rahim','Sohel','Tareq','Nasir','Jamal','Faruk'];
  last_bd TEXT[] := ARRAY['Hossain','Rahman','Islam','Ahmed','Khan','Miah','Uddin','Alam','Chowdhury','Sarker'];
  first_in TEXT[] := ARRAY['Rajesh','Sunil','Vikram','Anil','Prakash','Deepak','Sanjay','Ravi','Manoj','Ajay'];
  last_in TEXT[] := ARRAY['Kumar','Sharma','Singh','Patel','Das','Reddy','Gupta','Verma','Nair','Pillai'];
  first_ph TEXT[] := ARRAY['Juan','Jose','Pedro','Carlos','Antonio','Roberto','Eduardo','Fernando','Francisco','Miguel'];
  last_ph TEXT[] := ARRAY['Santos','Reyes','Cruz','Bautista','Garcia','Ramos','Mendoza','Torres','Flores','Aquino'];
  first_id TEXT[] := ARRAY['Agus','Budi','Dedi','Eko','Faisal','Hadi','Irwan','Joko','Kurniawan','Lukman'];
  last_id TEXT[] := ARRAY['Suryadi','Widodo','Santoso','Pratama','Setiawan','Hidayat','Nugroho','Saputra','Wibowo','Hartono'];
  first_ua TEXT[] := ARRAY['Oleksandr','Dmytro','Andriy','Sergiy','Mykola','Yuriy','Viktor','Ivan','Petro','Volodymyr'];
  last_ua TEXT[] := ARRAY['Kovalenko','Bondarenko','Tkachenko','Shevchenko','Kravchenko','Boyko','Melnyk','Lysenko','Marchenko','Polishchuk'];

  ranks TEXT[] := ARRAY['Master','Chief Officer','2nd Officer','3rd Officer','Chief Engineer','2nd Engineer','3rd Engineer','4th Engineer','Bosun','AB Seaman','OS Seaman','Fitter','Oiler','Wiper','Cook','Steward','Electrician','Motorman','Cadet'];

  -- City coords (lat, lng)
  city_lats DOUBLE PRECISION[] := ARRAY[23.81,22.36,24.9,22.82,19.08,13.08,22.57,17.69,14.6,10.31,7.07,10.7,-6.21,-7.25,3.59,-6.97,46.48,46.63,46.97,47.1];
  city_lngs DOUBLE PRECISION[] := ARRAY[90.41,91.78,91.87,89.55,72.88,80.27,88.36,83.22,120.98,123.89,125.61,122.56,106.85,112.75,98.67,110.42,30.74,32.62,31.99,37.55];

  -- Airport coords for in_transit/at_airport
  airport_lats DOUBLE PRECISION[] := ARRAY[25.25,1.36,25.27,41.28,14.51,23.84,22.25,19.09];
  airport_lngs DOUBLE PRECISION[] := ARRAY[55.36,103.99,51.61,28.74,121.02,90.4,91.81,72.87];
  airport_names TEXT[] := ARRAY['Dubai (DXB)','Singapore (SIN)','Doha (DOH)','Istanbul (IST)','Manila (MNL)','Dhaka (DAC)','Chittagong (CGP)','Mumbai (BOM)'];

  v_country_idx INT;
  v_city_idx INT;
  v_first TEXT;
  v_last TEXT;
  v_airport_idx INT;
BEGIN
  -- Get vessel IDs
  SELECT array_agg(id ORDER BY name) INTO v_vessel_ids FROM vessels WHERE company_id = v_company_id;

  FOR v_idx IN 1..1000 LOOP
    -- Pick random nationality
    v_country_idx := floor(random() * 5)::int + 1;
    v_nationality := countries[v_country_idx];

    -- Pick random city within country (4 cities each, offset by country)
    v_city_idx := (v_country_idx - 1) * 4 + floor(random() * 4)::int + 1;

    -- Pick name
    CASE v_country_idx
      WHEN 1 THEN v_first := first_bd[floor(random()*10)::int+1]; v_last := last_bd[floor(random()*10)::int+1]; v_city := cities_bd[floor(random()*4)::int+1];
      WHEN 2 THEN v_first := first_in[floor(random()*10)::int+1]; v_last := last_in[floor(random()*10)::int+1]; v_city := cities_in[floor(random()*4)::int+1];
      WHEN 3 THEN v_first := first_ph[floor(random()*10)::int+1]; v_last := last_ph[floor(random()*10)::int+1]; v_city := cities_ph[floor(random()*4)::int+1];
      WHEN 4 THEN v_first := first_id[floor(random()*10)::int+1]; v_last := last_id[floor(random()*10)::int+1]; v_city := cities_id[floor(random()*4)::int+1];
      WHEN 5 THEN v_first := first_ua[floor(random()*10)::int+1]; v_last := last_ua[floor(random()*10)::int+1]; v_city := cities_ua[floor(random()*4)::int+1];
    END CASE;
    v_name := v_first || ' ' || v_last;

    -- Pick rank
    v_rank := ranks[floor(random() * 19)::int + 1];

    -- Department
    IF v_rank IN ('Chief Engineer','2nd Engineer','3rd Engineer','4th Engineer','Oiler','Wiper','Fitter','Electrician','Motorman') THEN
      v_dept := 'Engine';
    ELSIF v_rank IN ('Cook','Steward') THEN
      v_dept := 'Catering';
    ELSE
      v_dept := 'Deck';
    END IF;

    -- Status distribution: 620 home, 280 on_board, 70 in_transit, 30 at_airport
    IF v_idx <= 620 THEN
      v_status := 'home';
      v_lat := city_lats[v_city_idx] + (random() - 0.5) * 0.5;
      v_lng := city_lngs[v_city_idx] + (random() - 0.5) * 0.5;
      v_location_label := v_city || ', ' || v_nationality;
      v_vessel_id := NULL;
    ELSIF v_idx <= 900 THEN
      v_status := 'on_board';
      v_vessel_id := v_vessel_ids[floor(random() * 8)::int + 1];
      -- Use vessel location with jitter
      SELECT ST_Y(current_location::geometry), ST_X(current_location::geometry)
        INTO v_lat, v_lng FROM vessels WHERE id = v_vessel_id;
      v_lat := v_lat + (random() - 0.5) * 2;
      v_lng := v_lng + (random() - 0.5) * 2;
      v_location_label := 'On board vessel';
    ELSIF v_idx <= 970 THEN
      v_status := 'in_transit';
      v_airport_idx := floor(random() * 8)::int + 1;
      v_lat := airport_lats[v_airport_idx] + (random() - 0.5) * 0.1;
      v_lng := airport_lngs[v_airport_idx] + (random() - 0.5) * 0.1;
      v_location_label := 'In transit - ' || airport_names[v_airport_idx];
      v_vessel_id := NULL;
    ELSE
      v_status := 'at_airport';
      v_airport_idx := floor(random() * 8)::int + 1;
      v_lat := airport_lats[v_airport_idx] + (random() - 0.5) * 0.05;
      v_lng := airport_lngs[v_airport_idx] + (random() - 0.5) * 0.05;
      v_location_label := airport_names[v_airport_idx];
      v_vessel_id := NULL;
    END IF;

    INSERT INTO crew_members (company_id, employee_id, full_name, nationality, rank, department, home_country, home_city, current_status, current_location, current_location_label, assigned_vessel_id)
    VALUES (v_company_id, 'ETM-' || lpad(v_idx::text, 4, '0'), v_name, v_nationality, v_rank, v_dept, v_nationality, v_city, v_status::crew_status, ST_MakePoint(v_lng, v_lat)::geography, v_location_label, v_vessel_id);
  END LOOP;

  -- Create 200 status events
  INSERT INTO status_events (company_id, crew_member_id, event_type, new_status, source, created_at)
  SELECT
    cm.company_id,
    cm.id,
    'status_change'::event_type,
    cm.current_status,
    (ARRAY['manual','mobile_app','agent','system'])[floor(random()*4)::int+1],
    NOW() - (random() * interval '7 days')
  FROM crew_members cm
  WHERE cm.company_id = v_company_id
  ORDER BY random()
  LIMIT 200;

  RAISE NOTICE 'Seed complete: 1000 crew, 8 vessels, 200 events';
END $$;
