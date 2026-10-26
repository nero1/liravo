-- ────────────────────────────────────────────────────────────────────────────
-- Migration 018: Web push subscriptions, Expo push token, Telegram OAuth,
--                moderators admin log, and web_push package support
-- ────────────────────────────────────────────────────────────────────────────

-- 1. Web push subscriptions table
CREATE TABLE IF NOT EXISTS public.web_push_subscriptions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  endpoint    text NOT NULL UNIQUE,
  p256dh      text NOT NULL,
  auth        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.web_push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own push subs" ON public.web_push_subscriptions;
CREATE POLICY "Users manage own push subs" ON public.web_push_subscriptions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 2. Add push_token column to users (for Expo push)
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS push_token text;

-- 3. Add telegram_id column to users
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS telegram_id text UNIQUE;

-- 4. Create index on telegram_id for fast OAuth lookups
CREATE INDEX IF NOT EXISTS users_telegram_id_idx ON public.users (telegram_id)
  WHERE telegram_id IS NOT NULL;

-- 5. Durable moderation audit, shared by reports and role management.
CREATE TABLE IF NOT EXISTS public.moderation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  moderator_id uuid REFERENCES users(id) ON DELETE SET NULL,
  target_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  report_id uuid REFERENCES content_reports(id) ON DELETE SET NULL,
  action text NOT NULL,
  reason text,
  notes text,
  entity_type text,
  entity_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.moderation_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read moderation log" ON public.moderation_log FOR SELECT USING (
  EXISTS (SELECT 1 FROM users WHERE id=auth.uid() AND (is_admin OR is_moderator))
);
CREATE POLICY "Staff append moderation log" ON public.moderation_log FOR INSERT WITH CHECK (
  moderator_id=auth.uid() AND EXISTS (SELECT 1 FROM users WHERE id=auth.uid() AND (is_admin OR is_moderator))
);
