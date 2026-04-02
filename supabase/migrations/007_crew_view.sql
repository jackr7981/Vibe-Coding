-- Add plain lat/lng columns and create a view for the frontend
-- PostGIS GEOGRAPHY returns as hex WKB via PostgREST, which JS can't read.
-- This view extracts lat/lng as plain DOUBLE PRECISION numbers.

CREATE OR REPLACE VIEW crew_with_coords AS
SELECT
  cm.*,
  ST_Y(cm.current_location::geometry) AS lat,
  ST_X(cm.current_location::geometry) AS lng,
  v.name AS vessel_name
FROM crew_members cm
LEFT JOIN vessels v ON v.id = cm.assigned_vessel_id;
