-- Status Events (immutable log of all crew movements)
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
  source TEXT DEFAULT 'manual', -- manual, mobile_app, agent, system
  notes TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_events_crew ON status_events(crew_member_id, created_at DESC);
CREATE INDEX idx_events_company ON status_events(company_id, created_at DESC);

-- Notifications
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID REFERENCES companies(id) NOT NULL,
  recipient_id UUID REFERENCES profiles(id) NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  type TEXT, -- alert, info, action_required
  related_crew_id UUID REFERENCES crew_members(id),
  related_itinerary_id UUID REFERENCES travel_itineraries(id),
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
