-- Crew Change Planner

ALTER TABLE crew_members ADD COLUMN IF NOT EXISTS contract_start_date DATE;
ALTER TABLE crew_members ADD COLUMN IF NOT EXISTS contract_end_date DATE;
ALTER TABLE crew_members ADD COLUMN IF NOT EXISTS contract_duration_months INT;
ALTER TABLE crew_members ADD COLUMN IF NOT EXISTS relief_crew_id UUID REFERENCES crew_members(id);

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

CREATE INDEX idx_crew_change_vessel ON crew_change_plans(vessel_id, signoff_date);
CREATE INDEX idx_crew_change_company ON crew_change_plans(company_id, status);

ALTER TABLE crew_change_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read_crew_changes" ON crew_change_plans FOR SELECT USING (true);

-- Update the crew_with_coords view to include contract dates
CREATE OR REPLACE VIEW crew_with_coords AS
SELECT
  cm.*,
  ST_Y(cm.current_location::geometry) AS lat,
  ST_X(cm.current_location::geometry) AS lng,
  v.name AS vessel_name
FROM crew_members cm
LEFT JOIN vessels v ON v.id = cm.assigned_vessel_id;
