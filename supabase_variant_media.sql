-- ============================================================
-- Run this in Supabase Dashboard → SQL Editor
-- Project: FarisProton (qagsczjxzshjxmmxvkbq)
-- ============================================================

-- 1. Create variant_media table
CREATE TABLE IF NOT EXISTS public.variant_media (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  model_key      text        NOT NULL,
  variant_key    text        NOT NULL,
  media_type     text        NOT NULL,
  media_url      text        NOT NULL,
  file_name      text        NOT NULL DEFAULT '',
  media_order    integer     NOT NULL DEFAULT 0,
  autoplay       boolean     NOT NULL DEFAULT true,
  loop           boolean     NOT NULL DEFAULT true,
  slide_duration integer     NOT NULL DEFAULT 4000,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- 2. Index for fast lookup
CREATE INDEX IF NOT EXISTS idx_variant_media_lookup
  ON public.variant_media (model_key, variant_key, media_order);

-- 3. Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_variant_media_updated_at ON public.variant_media;
CREATE TRIGGER set_variant_media_updated_at
  BEFORE UPDATE ON public.variant_media
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 4. Enable Row Level Security
ALTER TABLE public.variant_media ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies (open anon access)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='variant_media' AND policyname='anon_select') THEN
    CREATE POLICY "anon_select" ON public.variant_media FOR SELECT TO anon USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='variant_media' AND policyname='anon_insert') THEN
    CREATE POLICY "anon_insert" ON public.variant_media FOR INSERT TO anon WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='variant_media' AND policyname='anon_update') THEN
    CREATE POLICY "anon_update" ON public.variant_media FOR UPDATE TO anon USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='variant_media' AND policyname='anon_delete') THEN
    CREATE POLICY "anon_delete" ON public.variant_media FOR DELETE TO anon USING (true);
  END IF;
END $$;

-- ============================================================
-- 6. Storage bucket: variant-media
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'variant-media',
  'variant-media',
  true,
  52428800,
  ARRAY['image/jpeg','image/png','image/webp','video/mp4']
)
ON CONFLICT (id) DO NOTHING;

-- Storage bucket RLS policies
CREATE POLICY IF NOT EXISTS "variant_media_anon_select"
  ON storage.objects FOR SELECT TO anon
  USING (bucket_id = 'variant-media');

CREATE POLICY IF NOT EXISTS "variant_media_anon_insert"
  ON storage.objects FOR INSERT TO anon
  WITH CHECK (bucket_id = 'variant-media');

CREATE POLICY IF NOT EXISTS "variant_media_anon_delete"
  ON storage.objects FOR DELETE TO anon
  USING (bucket_id = 'variant-media');

-- ============================================================
-- MIGRATION: run these if table already exists (safe to run on fresh table too)
-- ============================================================

-- Add slide_duration (if missing)
ALTER TABLE public.variant_media ADD COLUMN IF NOT EXISTS slide_duration integer NOT NULL DEFAULT 4000;

-- Add title & description (required for 10-slot showroom manager)
ALTER TABLE public.variant_media ADD COLUMN IF NOT EXISTS title text NOT NULL DEFAULT '';
ALTER TABLE public.variant_media ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '';

-- Allow media_order = -1 (used for COVER_REF sentinel row)
-- No change needed — media_order is already integer, negative values are fine.
-- ============================================================
