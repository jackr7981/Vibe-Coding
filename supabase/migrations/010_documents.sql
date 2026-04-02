-- Document Compliance Tracker

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

-- Expiry summary view
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
