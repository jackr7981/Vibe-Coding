-- Travel Itineraries (one per crew movement order)
CREATE TABLE travel_itineraries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID REFERENCES companies(id) NOT NULL,
  crew_member_id UUID REFERENCES crew_members(id) NOT NULL,
  purpose TEXT, -- 'joining', 'sign_off', 'transfer', 'training', 'medical'
  origin_location TEXT,
  destination_location TEXT,
  destination_vessel_id UUID REFERENCES vessels(id),
  status TEXT DEFAULT 'planned', -- planned, active, completed, cancelled
  planned_start TIMESTAMPTZ,
  planned_end TIMESTAMPTZ,
  actual_start TIMESTAMPTZ,
  actual_end TIMESTAMPTZ,
  notes TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Travel Legs (individual flights/drives within an itinerary)
CREATE TABLE travel_legs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  itinerary_id UUID REFERENCES travel_itineraries(id) ON DELETE CASCADE,
  leg_order INT NOT NULL,
  mode TEXT DEFAULT 'flight', -- flight, road, ferry, train
  -- Flight specific
  airline TEXT,
  flight_number TEXT,
  pnr TEXT,
  booking_reference TEXT,
  ticket_url TEXT, -- Supabase Storage path
  -- Route
  departure_location TEXT,
  departure_airport_code TEXT,
  departure_time TIMESTAMPTZ,
  arrival_location TEXT,
  arrival_airport_code TEXT,
  arrival_time TIMESTAMPTZ,
  -- Status
  status travel_leg_status DEFAULT 'scheduled',
  actual_departure TIMESTAMPTZ,
  actual_arrival TIMESTAMPTZ,
  -- Agent info
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
