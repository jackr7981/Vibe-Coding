-- ============================================================
-- CrewTracker — Feature Expansion SQL
-- Run AFTER SETUP.sql in Supabase Dashboard > SQL Editor
-- ============================================================

-- ========================
-- 1. Alert System
-- ========================

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

ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read_alerts" ON alerts FOR SELECT USING (true);
CREATE POLICY "public_write_alerts" ON alerts FOR UPDATE USING (true);

-- ========================
-- 2. Crew Contracts & Change Plans
-- ========================

ALTER TABLE crew_members ADD COLUMN IF NOT EXISTS contract_start_date DATE;
ALTER TABLE crew_members ADD COLUMN IF NOT EXISTS contract_end_date DATE;
ALTER TABLE crew_members ADD COLUMN IF NOT EXISTS contract_duration_months INT;

CREATE TABLE crew_change_plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID REFERENCES companies(id) NOT NULL,
  vessel_id UUID REFERENCES vessels(id) NOT NULL,
  signoff_crew_id UUID REFERENCES crew_members(id) NOT NULL,
  signoff_rank TEXT NOT NULL,
  signoff_date DATE NOT NULL,
  relief_crew_id UUID REFERENCES crew_members(id),
  relief_status TEXT DEFAULT 'unassigned',
  change_port TEXT,
  status TEXT DEFAULT 'planned',
  notes TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE crew_change_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read_crew_changes" ON crew_change_plans FOR SELECT USING (true);

-- Refresh view to include contract dates
CREATE OR REPLACE VIEW crew_with_coords AS
SELECT
  cm.*,
  ST_Y(cm.current_location::geometry) AS lat,
  ST_X(cm.current_location::geometry) AS lng,
  v.name AS vessel_name
FROM crew_members cm
LEFT JOIN vessels v ON v.id = cm.assigned_vessel_id;

-- ========================
-- 3. Document Compliance
-- ========================

CREATE TYPE document_type AS ENUM (
  'passport', 'cdc', 'medical_fitness', 'stcw_basic',
  'stcw_advanced', 'gmdss', 'flag_endorsement', 'visa',
  'yellow_fever', 'drug_alcohol_test', 'security_awareness',
  'proficiency_survival', 'advanced_firefighting',
  'medical_first_aid', 'tanker_familiarization',
  'lng_tanker', 'igs_tanker', 'other'
);

CREATE TABLE crew_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID REFERENCES companies(id) NOT NULL,
  crew_member_id UUID REFERENCES crew_members(id) NOT NULL,
  document_type document_type NOT NULL,
  document_name TEXT NOT NULL,
  document_number TEXT,
  issuing_authority TEXT,
  issue_date DATE,
  expiry_date DATE,
  file_path TEXT,
  file_name TEXT,
  is_verified BOOLEAN DEFAULT FALSE,
  verified_by UUID REFERENCES profiles(id),
  verified_at TIMESTAMPTZ,
  notes TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_docs_crew ON crew_documents(crew_member_id, document_type);
CREATE INDEX idx_docs_expiry ON crew_documents(company_id, expiry_date) WHERE expiry_date IS NOT NULL;

ALTER TABLE crew_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read_docs" ON crew_documents FOR SELECT USING (true);

CREATE OR REPLACE VIEW document_expiry_summary AS
SELECT
  company_id,
  COUNT(*) FILTER (WHERE expiry_date < NOW()) as expired,
  COUNT(*) FILTER (WHERE expiry_date BETWEEN NOW() AND NOW() + INTERVAL '30 days') as expiring_30d,
  COUNT(*) FILTER (WHERE expiry_date BETWEEN NOW() + INTERVAL '30 days' AND NOW() + INTERVAL '90 days') as expiring_90d,
  COUNT(*) FILTER (WHERE expiry_date > NOW() + INTERVAL '90 days') as valid
FROM crew_documents
WHERE expiry_date IS NOT NULL
GROUP BY company_id;

-- ========================
-- 4. Communication Log
-- ========================

CREATE TABLE crew_notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID REFERENCES companies(id) NOT NULL,
  crew_member_id UUID REFERENCES crew_members(id) NOT NULL,
  itinerary_id UUID REFERENCES travel_itineraries(id),
  author_name TEXT NOT NULL DEFAULT 'System',
  author_role TEXT,
  content TEXT NOT NULL,
  attachments JSONB DEFAULT '[]',
  is_internal BOOLEAN DEFAULT FALSE,
  is_pinned BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notes_crew ON crew_notes(crew_member_id, created_at DESC);
ALTER TABLE crew_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read_notes" ON crew_notes FOR SELECT USING (true);

-- ========================
-- 5. Seed: Contract dates, alerts, documents
-- ========================

-- Add contract dates to existing crew (stagger so ~50 expire within 30 days)
DO $$
DECLARE
  v_company_id UUID := '11111111-1111-1111-1111-111111111111';
BEGIN
  -- On-board crew: contracts ending in 10-180 days
  UPDATE crew_members
  SET
    contract_start_date = (NOW() - (random() * interval '180 days'))::date,
    contract_end_date = (NOW() + (random() * interval '180 days'))::date,
    contract_duration_months = 6
  WHERE company_id = v_company_id AND current_status = 'on_board';

  -- Force ~50 to expire within 30 days (critical)
  UPDATE crew_members
  SET contract_end_date = (NOW() + (random() * interval '30 days'))::date
  WHERE id IN (
    SELECT id FROM crew_members
    WHERE company_id = v_company_id AND current_status = 'on_board'
    ORDER BY random() LIMIT 50
  );

  -- Seed 20 alerts
  INSERT INTO alerts (company_id, category, severity, title, description, crew_member_id, vessel_id)
  SELECT
    v_company_id,
    (ARRAY['transit_timeout','no_update','crew_change_risk','missed_checkin'])[floor(random()*4)::int+1]::alert_category,
    (ARRAY['critical','warning','info'])[floor(random()*3)::int+1]::alert_severity,
    'Alert: ' || cm.full_name,
    'Automated alert for ' || cm.full_name || ' - ' || cm.current_status,
    cm.id,
    cm.assigned_vessel_id
  FROM crew_members cm
  WHERE cm.company_id = v_company_id AND cm.current_status != 'home'
  ORDER BY random() LIMIT 20;

  -- Seed documents (passport + CDC for each crew, ~15% expiring within 90 days)
  INSERT INTO crew_documents (company_id, crew_member_id, document_type, document_name, document_number, issue_date, expiry_date, is_verified)
  SELECT
    cm.company_id,
    cm.id,
    'passport'::document_type,
    'Passport',
    'P' || lpad(floor(random()*9999999)::text, 7, '0'),
    (NOW() - interval '3 years')::date,
    CASE
      WHEN random() < 0.05 THEN (NOW() - (random() * interval '30 days'))::date  -- 5% expired
      WHEN random() < 0.15 THEN (NOW() + (random() * interval '90 days'))::date  -- 10% expiring soon
      ELSE (NOW() + interval '2 years' + (random() * interval '3 years'))::date   -- 85% valid
    END,
    random() > 0.2  -- 80% verified
  FROM crew_members cm
  WHERE cm.company_id = v_company_id;

  INSERT INTO crew_documents (company_id, crew_member_id, document_type, document_name, document_number, issue_date, expiry_date, is_verified)
  SELECT
    cm.company_id,
    cm.id,
    'cdc'::document_type,
    'Continuous Discharge Certificate',
    'CDC' || lpad(floor(random()*999999)::text, 6, '0'),
    (NOW() - interval '2 years')::date,
    CASE
      WHEN random() < 0.05 THEN (NOW() - (random() * interval '30 days'))::date
      WHEN random() < 0.15 THEN (NOW() + (random() * interval '90 days'))::date
      ELSE (NOW() + interval '3 years' + (random() * interval '2 years'))::date
    END,
    random() > 0.3
  FROM crew_members cm
  WHERE cm.company_id = v_company_id;

  INSERT INTO crew_documents (company_id, crew_member_id, document_type, document_name, document_number, issue_date, expiry_date, is_verified)
  SELECT
    cm.company_id,
    cm.id,
    'stcw_basic'::document_type,
    'STCW Basic Safety Training',
    'STCW' || lpad(floor(random()*999999)::text, 6, '0'),
    (NOW() - interval '4 years')::date,
    CASE
      WHEN random() < 0.08 THEN (NOW() - (random() * interval '60 days'))::date
      WHEN random() < 0.20 THEN (NOW() + (random() * interval '90 days'))::date
      ELSE (NOW() + interval '1 year' + (random() * interval '4 years'))::date
    END,
    random() > 0.25
  FROM crew_members cm
  WHERE cm.company_id = v_company_id;

  RAISE NOTICE 'Feature seed complete: contracts, alerts, documents';
END $$;
