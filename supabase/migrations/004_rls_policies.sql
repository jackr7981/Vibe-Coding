-- Enable RLS on all tables
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE vessels ENABLE ROW LEVEL SECURITY;
ALTER TABLE crew_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE travel_itineraries ENABLE ROW LEVEL SECURITY;
ALTER TABLE travel_legs ENABLE ROW LEVEL SECURITY;
ALTER TABLE status_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Helper function: get user's company
CREATE OR REPLACE FUNCTION get_user_company_id()
RETURNS UUID AS $$
  SELECT company_id FROM profiles WHERE id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- Profiles: users see only their company
CREATE POLICY "profiles_company" ON profiles
  FOR ALL USING (company_id = get_user_company_id());

-- Crew: company-scoped access
CREATE POLICY "crew_company" ON crew_members
  FOR ALL USING (company_id = get_user_company_id());

-- Crew members can update only their own status via mobile app
CREATE POLICY "crew_self_update" ON crew_members
  FOR UPDATE USING (profile_id = auth.uid())
  WITH CHECK (profile_id = auth.uid());

-- Vessels: company-scoped
CREATE POLICY "vessels_company" ON vessels
  FOR ALL USING (company_id = get_user_company_id());

-- Travel itineraries: company-scoped
CREATE POLICY "itineraries_company" ON travel_itineraries
  FOR ALL USING (company_id = get_user_company_id());

-- Travel legs: through itinerary company scope
CREATE POLICY "legs_company" ON travel_legs
  FOR ALL USING (
    itinerary_id IN (
      SELECT id FROM travel_itineraries WHERE company_id = get_user_company_id()
    )
  );

-- Events: company-scoped
CREATE POLICY "events_company" ON status_events
  FOR ALL USING (company_id = get_user_company_id());

-- Notifications: only recipient sees their own
CREATE POLICY "notifications_own" ON notifications
  FOR ALL USING (recipient_id = auth.uid());
