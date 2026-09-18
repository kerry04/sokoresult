-- 1. Private storage bucket for KYC docs
INSERT INTO storage.buckets (id, name, public)
VALUES ('kyc-documents', 'kyc-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Owner can upload to their own folder
CREATE POLICY "KYC owner upload"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'kyc-documents'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Owner can read their own files
CREATE POLICY "KYC owner read"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'kyc-documents'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Admins can read all KYC files
CREATE POLICY "KYC admin read"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'kyc-documents'
  AND public.has_role(auth.uid(), 'admin')
);

-- 2. KYC submissions table
CREATE TYPE public.kyc_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE public.kyc_id_type AS ENUM ('national_id', 'passport');

CREATE TABLE public.kyc_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  date_of_birth DATE NOT NULL,
  full_name TEXT NOT NULL,
  id_type public.kyc_id_type NOT NULL,
  id_number TEXT NOT NULL,
  id_front_path TEXT NOT NULL,
  id_back_path TEXT,
  selfie_path TEXT,
  status public.kyc_status NOT NULL DEFAULT 'pending',
  reviewer_notes TEXT,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_kyc_user ON public.kyc_submissions(user_id);
CREATE INDEX idx_kyc_status ON public.kyc_submissions(status);

-- 3. Age validation trigger (must be 18+ at submission time)
CREATE OR REPLACE FUNCTION public.validate_kyc_age()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.date_of_birth > (CURRENT_DATE - INTERVAL '18 years') THEN
    RAISE EXCEPTION 'You must be at least 18 years old to verify your account';
  END IF;
  IF NEW.date_of_birth < (CURRENT_DATE - INTERVAL '120 years') THEN
    RAISE EXCEPTION 'Invalid date of birth';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_kyc_age_trigger
BEFORE INSERT OR UPDATE OF date_of_birth ON public.kyc_submissions
FOR EACH ROW EXECUTE FUNCTION public.validate_kyc_age();

-- 4. updated_at trigger
CREATE TRIGGER kyc_set_updated_at
BEFORE UPDATE ON public.kyc_submissions
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5. Auto-bump profile.kyc_tier when approved
CREATE OR REPLACE FUNCTION public.handle_kyc_approval()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'approved' AND (OLD.status IS DISTINCT FROM 'approved') THEN
    UPDATE public.profiles
    SET kyc_tier = GREATEST(kyc_tier, 1),
        updated_at = now()
    WHERE id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER kyc_approval_trigger
AFTER UPDATE OF status ON public.kyc_submissions
FOR EACH ROW EXECUTE FUNCTION public.handle_kyc_approval();

-- 6. RLS
ALTER TABLE public.kyc_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own KYC"
ON public.kyc_submissions FOR SELECT
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users submit own KYC"
ON public.kyc_submissions FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins update KYC"
ON public.kyc_submissions FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'));