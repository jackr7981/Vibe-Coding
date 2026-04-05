-- ============================================================
-- CrewTracker — Crew Profile Enhancement
-- Run in Supabase Dashboard > SQL Editor
-- Adds: readiness dates, preferences, and extra documents
-- ============================================================

DO $$
DECLARE
  v_company_id UUID := '11111111-1111-1111-1111-111111111111';
BEGIN

  -- ── Readiness dates for crew at home ──────────────────────
  UPDATE crew_members
  SET metadata = metadata || jsonb_build_object(
    'readiness_date', (NOW() + (random() * interval '60 days'))::date::text
  )
  WHERE company_id = v_company_id AND current_status = 'home';

  -- ── Preferences for all crew ──────────────────────────────
  UPDATE crew_members
  SET metadata = metadata || jsonb_build_object(
    'preferences', (ARRAY[
      'Prefers tanker vessels',
      'No cold climate postings',
      'Family priority port rotation',
      'Bulk carrier experienced',
      'VLCC/ULCC certified',
      'Prefers short rotations (3 months)',
      'Available for extended 9-month contracts',
      'No LNG/chemical assignments'
    ])[floor(random()*8)::int+1]
  )
  WHERE company_id = v_company_id;

  -- ── Medical fitness certificates ──────────────────────────
  INSERT INTO crew_documents (company_id, crew_member_id, document_type, document_name, document_number, issuing_authority, issue_date, expiry_date, is_verified)
  SELECT
    cm.company_id, cm.id,
    'medical_fitness'::document_type,
    'ENG1 Medical Certificate',
    'MED' || lpad(floor(random()*99999)::text, 5, '0'),
    'Approved Medical Practitioner',
    (NOW() - (random() * interval '1 year'))::date,
    CASE
      WHEN random() < 0.07 THEN (NOW() - (random() * interval '30 days'))::date
      WHEN random() < 0.18 THEN (NOW() + (random() * interval '90 days'))::date
      ELSE (NOW() + interval '1 year' + (random() * interval '1 year'))::date
    END,
    random() > 0.1
  FROM crew_members cm WHERE cm.company_id = v_company_id;

  -- ── GMDSS ─────────────────────────────────────────────────
  INSERT INTO crew_documents (company_id, crew_member_id, document_type, document_name, document_number, issuing_authority, issue_date, expiry_date, is_verified)
  SELECT
    cm.company_id, cm.id,
    'gmdss'::document_type,
    'GMDSS General Operator Certificate',
    'GMDSS-' || lpad(floor(random()*99999)::text, 5, '0'),
    'National Maritime Authority',
    (NOW() - (random() * interval '3 years'))::date,
    CASE
      WHEN random() < 0.05 THEN (NOW() - (random() * interval '20 days'))::date
      WHEN random() < 0.15 THEN (NOW() + (random() * interval '90 days'))::date
      ELSE (NOW() + interval '2 years' + (random() * interval '3 years'))::date
    END,
    random() > 0.2
  FROM crew_members cm WHERE cm.company_id = v_company_id
  -- Only for deck/radio officers (approximate via random)
  AND random() > 0.4;

  -- ── Visas ─────────────────────────────────────────────────
  INSERT INTO crew_documents (company_id, crew_member_id, document_type, document_name, document_number, issuing_authority, issue_date, expiry_date, is_verified)
  SELECT
    cm.company_id, cm.id,
    'visa'::document_type,
    (ARRAY['US C1/D Visa', 'Schengen Visa', 'UK Seaman Visa', 'Singapore Multiple Entry Visa'])[floor(random()*4)::int+1],
    (ARRAY['US-', 'SCH-', 'UK-', 'SG-'])[floor(random()*4)::int+1] || lpad(floor(random()*999999)::text, 6, '0'),
    (ARRAY['US Embassy', 'EU Consulate', 'British High Commission', 'ICA Singapore'])[floor(random()*4)::int+1],
    (NOW() - (random() * interval '2 years'))::date,
    CASE
      WHEN random() < 0.08 THEN (NOW() - (random() * interval '45 days'))::date
      WHEN random() < 0.20 THEN (NOW() + (random() * interval '90 days'))::date
      ELSE (NOW() + interval '1 year' + (random() * interval '4 years'))::date
    END,
    random() > 0.15
  FROM crew_members cm WHERE cm.company_id = v_company_id
  AND random() > 0.3;

  -- ── Proficiency Survival Craft ────────────────────────────
  INSERT INTO crew_documents (company_id, crew_member_id, document_type, document_name, document_number, issuing_authority, issue_date, expiry_date, is_verified)
  SELECT
    cm.company_id, cm.id,
    'proficiency_survival'::document_type,
    'Proficiency in Survival Craft',
    'PSC-' || lpad(floor(random()*99999)::text, 5, '0'),
    'Maritime Training Centre',
    (NOW() - (random() * interval '4 years'))::date,
    CASE
      WHEN random() < 0.06 THEN (NOW() - (random() * interval '40 days'))::date
      WHEN random() < 0.18 THEN (NOW() + (random() * interval '90 days'))::date
      ELSE (NOW() + interval '2 years' + (random() * interval '3 years'))::date
    END,
    random() > 0.2
  FROM crew_members cm WHERE cm.company_id = v_company_id;

  -- ── Advanced Firefighting ─────────────────────────────────
  INSERT INTO crew_documents (company_id, crew_member_id, document_type, document_name, document_number, issuing_authority, issue_date, expiry_date, is_verified)
  SELECT
    cm.company_id, cm.id,
    'advanced_firefighting'::document_type,
    'Advanced Fire Fighting',
    'AFF-' || lpad(floor(random()*99999)::text, 5, '0'),
    'Maritime Safety Training Institute',
    (NOW() - (random() * interval '3 years'))::date,
    CASE
      WHEN random() < 0.06 THEN (NOW() - (random() * interval '30 days'))::date
      WHEN random() < 0.15 THEN (NOW() + (random() * interval '90 days'))::date
      ELSE (NOW() + interval '2 years' + (random() * interval '3 years'))::date
    END,
    random() > 0.2
  FROM crew_members cm WHERE cm.company_id = v_company_id;

  -- ── Yellow Fever ──────────────────────────────────────────
  INSERT INTO crew_documents (company_id, crew_member_id, document_type, document_name, document_number, issuing_authority, issue_date, expiry_date, is_verified)
  SELECT
    cm.company_id, cm.id,
    'yellow_fever'::document_type,
    'Yellow Fever Vaccination',
    'YF-' || lpad(floor(random()*99999)::text, 5, '0'),
    'Approved Vaccination Centre',
    (NOW() - (random() * interval '5 years'))::date,
    -- Yellow fever vaccines are valid for life (10+ years)
    (NOW() + interval '5 years' + (random() * interval '5 years'))::date,
    random() > 0.1
  FROM crew_members cm WHERE cm.company_id = v_company_id
  AND random() > 0.35;

  RAISE NOTICE 'Crew profile enhancement complete.';
END $$;
