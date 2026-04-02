-- Alert & Exception Engine

CREATE TYPE alert_severity AS ENUM ('critical', 'warning', 'info');
CREATE TYPE alert_status AS ENUM ('active', 'acknowledged', 'resolved', 'auto_resolved');
CREATE TYPE alert_category AS ENUM (
  'missed_checkin', 'flight_disruption', 'transit_timeout',
  'crew_change_risk', 'document_expiry', 'no_update',
  'unassigned_relief', 'custom'
);

CREATE TABLE alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID REFERENCES companies(id) NOT NULL,
  category alert_category NOT NULL,
  severity alert_severity NOT NULL,
  status alert_status DEFAULT 'active',
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  crew_member_id UUID REFERENCES crew_members(id),
  vessel_id UUID REFERENCES vessels(id),
  itinerary_id UUID REFERENCES travel_itineraries(id),
  travel_leg_id UUID REFERENCES travel_legs(id),
  acknowledged_by UUID REFERENCES profiles(id),
  acknowledged_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES profiles(id),
  resolved_at TIMESTAMPTZ,
  resolution_notes TEXT,
  metadata JSONB DEFAULT '{}',
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_alerts_active ON alerts(company_id, status, severity) WHERE status = 'active';
CREATE INDEX idx_alerts_crew ON alerts(crew_member_id, created_at DESC);

CREATE TABLE alert_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID REFERENCES companies(id) NOT NULL,
  category alert_category NOT NULL,
  enabled BOOLEAN DEFAULT TRUE,
  severity alert_severity DEFAULT 'warning',
  config JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read_alerts" ON alerts FOR SELECT USING (true);
CREATE POLICY "public_read_alert_rules" ON alert_rules FOR SELECT USING (true);
