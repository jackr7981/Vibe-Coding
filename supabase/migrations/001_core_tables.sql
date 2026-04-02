-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- ENUM types
CREATE TYPE crew_status AS ENUM ('home', 'in_transit', 'at_airport', 'on_board', 'at_port');
CREATE TYPE user_role AS ENUM ('admin', 'crew_manager', 'operations', 'crew', 'agent');
CREATE TYPE travel_leg_status AS ENUM ('scheduled', 'active', 'completed', 'cancelled', 'delayed');
CREATE TYPE event_type AS ENUM (
  'status_change', 'location_update', 'checkin',
  'flight_departed', 'flight_arrived', 'agent_pickup',
  'agent_dropoff', 'vessel_joined', 'vessel_left'
);

-- Companies (multi-tenant)
CREATE TABLE companies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  logo_url TEXT,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Users / Profiles
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

-- Vessels
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

-- Crew Members
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

-- Spatial and lookup indexes
CREATE INDEX idx_crew_location ON crew_members USING GIST(current_location);
CREATE INDEX idx_crew_status ON crew_members(company_id, current_status);
CREATE INDEX idx_crew_vessel ON crew_members(assigned_vessel_id);
