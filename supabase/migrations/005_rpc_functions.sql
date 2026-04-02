-- Dashboard analytics RPC functions

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
