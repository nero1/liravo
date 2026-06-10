-- ────────────────────────────────────────────────────────────────────────────
-- Migration 017: buddy_read_notes reply threading, seasonal badge columns,
--                reading_goals table, and word_count on submissions
-- ────────────────────────────────────────────────────────────────────────────

-- 1. Add reply_to_id column to buddy_read_notes for threaded discussion
ALTER TABLE public.buddy_read_notes
  ADD COLUMN IF NOT EXISTS reply_to_id uuid REFERENCES public.buddy_read_notes(id) ON DELETE SET NULL;

-- 2. Create reading_goals table if not exists
CREATE TABLE IF NOT EXISTS public.reading_goals (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  year        int NOT NULL,
  target_books int NOT NULL CHECK (target_books > 0),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, year)
);

ALTER TABLE public.reading_goals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own reading goals" ON public.reading_goals;
CREATE POLICY "Users manage own reading goals" ON public.reading_goals
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 3. Add word_count column to writing_challenge_submissions if not exists
ALTER TABLE public.writing_challenge_submissions
  ADD COLUMN IF NOT EXISTS word_count int GENERATED ALWAYS AS (
    array_length(string_to_array(trim(content), ' '), 1)
  ) STORED;

-- 4. Add word_count column to prompt_submissions if not exists
ALTER TABLE public.prompt_submissions
  ADD COLUMN IF NOT EXISTS word_count int GENERATED ALWAYS AS (
    array_length(string_to_array(trim(content), ' '), 1)
  ) STORED;

-- 5. Seasonal events — ensure badge_id column exists
ALTER TABLE public.seasonal_events
  ADD COLUMN IF NOT EXISTS badge_id text;

-- 6. RLS for buddy_read_notes
ALTER TABLE public.buddy_read_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Participants read notes" ON public.buddy_read_notes;
CREATE POLICY "Participants read notes" ON public.buddy_read_notes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.buddy_read_participants p
      WHERE p.buddy_read_id = buddy_read_notes.buddy_read_id
        AND p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Participants insert notes" ON public.buddy_read_notes;
CREATE POLICY "Participants insert notes" ON public.buddy_read_notes
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.buddy_read_participants p
      WHERE p.buddy_read_id = buddy_read_notes.buddy_read_id
        AND p.user_id = auth.uid()
    )
  );
