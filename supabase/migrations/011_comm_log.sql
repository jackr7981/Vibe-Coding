-- Communication / Notes Log

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
