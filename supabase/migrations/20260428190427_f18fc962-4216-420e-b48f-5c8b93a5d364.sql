
-- Support attachments
CREATE TABLE IF NOT EXISTS public.support_ticket_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL,
  message_id uuid,
  user_id uuid NOT NULL,
  storage_path text NOT NULL,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_support_attachments_ticket ON public.support_ticket_attachments(ticket_id);
CREATE INDEX IF NOT EXISTS idx_support_attachments_message ON public.support_ticket_attachments(message_id);

ALTER TABLE public.support_ticket_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Attachments read own or admin" ON public.support_ticket_attachments;
CREATE POLICY "Attachments read own or admin"
ON public.support_ticket_attachments FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.support_tickets t
    WHERE t.id = support_ticket_attachments.ticket_id
      AND (t.user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
  )
);

DROP POLICY IF EXISTS "Attachments insert own ticket or admin" ON public.support_ticket_attachments;
CREATE POLICY "Attachments insert own ticket or admin"
ON public.support_ticket_attachments FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = support_ticket_attachments.ticket_id
        AND t.user_id = auth.uid()
    )
  )
);

-- Private storage bucket for support attachments
INSERT INTO storage.buckets (id, name, public)
VALUES ('support-attachments', 'support-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: path is "<ticket_id>/<filename>"
DROP POLICY IF EXISTS "Support attachments owner read" ON storage.objects;
CREATE POLICY "Support attachments owner read"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'support-attachments'
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id::text = (storage.foldername(name))[1]
        AND t.user_id = auth.uid()
    )
  )
);

DROP POLICY IF EXISTS "Support attachments owner upload" ON storage.objects;
CREATE POLICY "Support attachments owner upload"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'support-attachments'
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id::text = (storage.foldername(name))[1]
        AND t.user_id = auth.uid()
    )
  )
);
