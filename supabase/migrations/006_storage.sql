-- Storage buckets for tickets and avatars
INSERT INTO storage.buckets (id, name, public) VALUES
  ('tickets', 'tickets', false),
  ('avatars', 'avatars', true);

-- Tickets accessible only to same-company users
CREATE POLICY "tickets_company_access" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'tickets' AND
    (storage.foldername(name))[1] = get_user_company_id()::text
  );

CREATE POLICY "tickets_upload" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'tickets' AND
    (storage.foldername(name))[1] = get_user_company_id()::text
  );
