-- Migration: Add password_hash and telegram_id for DigitalOcean PostgreSQL backend.
-- Safe to apply in Supabase mode — columns stay NULL for OAuth-only users.
-- Required before switching DATABASE_PROVIDER=digitalocean.

ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_telegram_id
  ON users(telegram_id)
  WHERE telegram_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_email_login
  ON users(email)
  WHERE password_hash IS NOT NULL;
