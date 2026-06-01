# Liravo — Setup Guide

This document covers everything a developer needs to go from zero to a running Liravo instance.

---

## 1. Project Overview

Liravo is a Next.js 14 (App Router) social book discovery platform. The stack:

- **Frontend**: Next.js 14, TypeScript, Tailwind CSS
- **Database**: Supabase (default), DigitalOcean Managed PostgreSQL, or Railway PostgreSQL — switched via a single `DATABASE_PROVIDER` env var
- **Cache / Sessions**: Redis via ioredis or Upstash — **required in all provider modes**
- **Deployment**: Vercel (Hobby Plan for MVP)
- **AI**: DeepSeek (primary), Gemini (fallback)
- **Payments**: Paystack + Dodopayments

---

## 2. Environment Variables

Copy `.env.local.example` to `.env.local` and fill in the values.

### Provider Selection

| Variable | Description |
|---|---|
| `DATABASE_PROVIDER` | `supabase` (default), `digitalocean`, or `railway` |
| `NEXT_PUBLIC_DATABASE_PROVIDER` | Mirror of `DATABASE_PROVIDER` — required for client components |

Both default to `supabase` if unset.

### Supabase _(Required when `DATABASE_PROVIDER=supabase` or unset)_

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL (from Project Settings → API) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon/public key (Project Settings → API) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key — **never expose to client** |

### DigitalOcean / Railway PostgreSQL _(Required when `DATABASE_PROVIDER=digitalocean` or `=railway`)_

| Variable | Description |
|---|---|
| `DATABASE_URL` | PgBouncer connection URL (transaction mode — see Sections 3b and 5b) |
| `DATABASE_POOL_MAX` | Max connections per serverless instance (default: `5`) |
| `DATABASE_SSL` | Set to `false` only for local dev without SSL; default: `true` |

### Object Storage — S3-compatible _(Required in DigitalOcean and Railway modes; unused in Supabase mode)_

These variables are intentionally named `S3_*` — they are **provider-neutral** and work
with Cloudflare R2, Backblaze B2, DigitalOcean Spaces, AWS S3, or any S3-compatible service.

```bash
# S3-compatible object storage (used when DATABASE_PROVIDER=digitalocean or =railway)
# Provider-neutral: works with R2, B2, DO Spaces, AWS S3, or any compatible provider.

S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com   # Example: Cloudflare R2
S3_KEY=<access-key-id>
S3_SECRET=<secret-access-key>
S3_BUCKET=liravo-avatars
S3_REGION=auto                             # "auto" for R2; "nyc3" for DO Spaces; "us-west-004" for B2
S3_CDN_URL=https://cdn.example.com        # Public CDN/download base URL for the bucket

# Provider-specific examples (uncomment the one you use):

## Cloudflare R2 (recommended — free tier, no egress fees)
# S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
# S3_REGION=auto
# S3_CDN_URL=https://<bucket>.<account-id>.r2.dev   # or your custom domain

## Backblaze B2 (free tier + free egress via Cloudflare)
# S3_ENDPOINT=https://s3.us-west-004.backblazeb2.com
# S3_REGION=us-west-004
# S3_CDN_URL=https://f004.backblazeb2.com/file/<bucket>

## DigitalOcean Spaces ($5/month minimum, no free tier)
# S3_ENDPOINT=https://nyc3.digitaloceanspaces.com
# S3_REGION=nyc3
# S3_CDN_URL=https://<bucket>.nyc3.cdn.digitaloceanspaces.com

## AWS S3 (5 GB free for 12 months; egress charged after)
# S3_ENDPOINT=https://s3.us-east-1.amazonaws.com
# S3_REGION=us-east-1
# S3_CDN_URL=https://<bucket>.s3.us-east-1.amazonaws.com
```

### Redis _(Required in **both** Supabase and DO modes — used for sessions and rate limiting)_

| Variable | Description |
|---|---|
| `REDIS_PROVIDER` | `upstash` or `ioredis` |
| `UPSTASH_REDIS_REST_URL` | Upstash REST URL (if using Upstash) |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash token (if using Upstash) |
| `REDIS_URL` | Redis connection string (if using ioredis, e.g. `redis://localhost:6379`) |

### Auth

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Google OAuth Client ID _(Supabase mode only)_ |
| `GOOGLE_CLIENT_SECRET` | Google OAuth Client Secret _(Supabase mode only)_ |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token from BotFather _(Supabase mode only)_ |

### AI

| Variable | Description |
|---|---|
| `AI_PRIMARY_PROVIDER` | `deepseek` or `gemini` |
| `DEEPSEEK_API_KEY` | DeepSeek API key |
| `GEMINI_API_KEY` | Google Gemini API key |

### Google Books

| Variable | Description |
|---|---|
| `GOOGLE_BOOKS_API_KEY` | Google Books API key (optional but recommended) |

### Payments

| Variable | Description |
|---|---|
| `PAYSTACK_SECRET_KEY` | Paystack secret key |
| `PAYSTACK_PUBLIC_KEY` | Paystack public key |
| `DODOPAYMENTS_SECRET_KEY` | Dodopayments secret key |
| `DODOPAYMENTS_WEBHOOK_SECRET` | Dodopayments webhook secret |
| `PAYMENT_WEBHOOK_SECRET` | Shared secret for all payment webhooks |

### Cron

| Variable | Description |
|---|---|
| `CRON_SECRET` | Random secret string used to authenticate cron job requests |

### Email

| Variable | Description |
|---|---|
| `RESEND_API_KEY` | Resend.com API key for transactional emails |

### Amazon Associates

| Variable | Description |
|---|---|
| `AMAZON_ASSOCIATE_TAG_US` | e.g. `liravo-20` |
| `AMAZON_ASSOCIATE_TAG_UK` | e.g. `liravo-uk-21` |
| `AMAZON_ASSOCIATE_TAG_CA` | e.g. `liravo-ca-21` |
| `AMAZON_ASSOCIATE_TAG_AU` | e.g. `liravo-au-22` |

### App

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_APP_URL` | Public URL, e.g. `https://liravo.org` |

---

## 3. Database Provider Configuration

### Provider Comparison

| Feature | Supabase | DigitalOcean | Railway |
|---|---|---|---|
| Database | PostgreSQL via Supabase SDK | PostgreSQL via postgres.js (direct) | PostgreSQL via postgres.js (direct) |
| Auth | Supabase Auth (JWT) | bcrypt + Redis JWT sessions | bcrypt + Redis JWT sessions |
| Storage | Supabase Storage | S3-compatible (R2, B2, DO Spaces, AWS) | S3-compatible (R2, B2, DO Spaces, AWS) |
| Realtime | Supabase Realtime WebSocket | SSE polling | SSE polling |
| OAuth | Google + Telegram | Not supported | Not supported |
| Connection pooling | Built-in | Built-in PgBouncer (port 25061) | PgBouncer service from Railway template |
| Cost notes | Free tier available; scales by usage | Pay for DB cluster + object storage separately | Pay for Railway services + object storage |
| RLS | PostgreSQL RLS — all tables covered, default deny, `auth.uid()` policies | Application-level ownership checks in every API route. Use `withUserContext` for optional DB-level session variable. See Section 3c. | Same as DigitalOcean |

### Object Storage Provider Comparison

When `DATABASE_PROVIDER=digitalocean` or `DATABASE_PROVIDER=railway`, Liravo uses the S3 API
for object storage. Any S3-compatible provider works — no code changes required, only env vars.

| Provider | Free tier | Egress fees | Notes |
|---|---|---|---|
| **Cloudflare R2** | 10 GB + 1M writes + 10M reads/month | **None** | Recommended default. Fully S3-compatible. CDN included. |
| **Backblaze B2** | 10 GB storage | Free via Cloudflare | Pair with Cloudflare for zero egress. Very cost-effective. |
| **DigitalOcean Spaces** | None ($5/month min) | $0.01/GB | Convenient if already on DO; no free tier. |
| **AWS S3** | 5 GB for 12 months | $0.09/GB (US East) | Charged after free tier; egress can add up at scale. |

**Recommendation**: Cloudflare R2 is the recommended default for most projects — the free tier
is generous, egress is free, and it is fully S3-compatible so switching later requires only env var changes.

### S3_* Env Var Block — Per-Provider Examples

```bash
# ── Cloudflare R2 (recommended) ──────────────────────────────────────────────
S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
S3_KEY=<R2-access-key-id>
S3_SECRET=<R2-secret>
S3_BUCKET=liravo-avatars
S3_REGION=auto
S3_CDN_URL=https://<bucket>.<account-id>.r2.dev   # or custom domain

# ── Backblaze B2 ─────────────────────────────────────────────────────────────
S3_ENDPOINT=https://s3.us-west-004.backblazeb2.com   # use your actual region
S3_KEY=<B2-application-key-id>
S3_SECRET=<B2-application-key>
S3_BUCKET=liravo-avatars
S3_REGION=us-west-004
S3_CDN_URL=https://f004.backblazeb2.com/file/liravo-avatars

# ── DigitalOcean Spaces ───────────────────────────────────────────────────────
S3_ENDPOINT=https://nyc3.digitaloceanspaces.com
S3_KEY=<DO-Spaces-access-key>
S3_SECRET=<DO-Spaces-secret>
S3_BUCKET=liravo-avatars
S3_REGION=nyc3
S3_CDN_URL=https://liravo-avatars.nyc3.cdn.digitaloceanspaces.com

# ── AWS S3 ────────────────────────────────────────────────────────────────────
S3_ENDPOINT=https://s3.us-east-1.amazonaws.com
S3_KEY=<AWS-access-key-id>
S3_SECRET=<AWS-secret-access-key>
S3_BUCKET=liravo-avatars
S3_REGION=us-east-1
S3_CDN_URL=https://liravo-avatars.s3.us-east-1.amazonaws.com
```

### Section 3c — Row Level Security (RLS) Model Per Provider

Understanding how data isolation works in each mode is important before deploying.

#### Supabase mode

RLS is enforced at the **database layer** by PostgreSQL itself. Every table has RLS enabled with `default deny`. The migrations define explicit allow policies keyed on `auth.uid()` (the Supabase-injected function that returns the authenticated user's UUID from the JWT). No authenticated user can read or write another user's private data, even if a bug in application code accidentally omits a filter — the database itself will reject the query.

Two system tables are intentionally **default deny with no user policies**:
- `outbox_events` — internal event queue; only the service_role can access it.

Service role (`SUPABASE_SERVICE_ROLE_KEY`) bypasses RLS automatically. It is used only in server-side API routes and cron jobs — never exposed to the client.

**Coverage summary** (after migration 012): 50+ tables have complete RLS policies. See `supabase/migrations/012_rls_enforcement.sql` for the full list.

#### DigitalOcean / Railway mode

PostgreSQL RLS is **not enforced** in these modes because:
1. `auth.uid()` is a Supabase-specific function that reads from a Supabase JWT; it returns `null` in a direct PostgreSQL connection.
2. The app typically connects with a privileged database role that bypasses RLS at the PostgreSQL level.

Access control is enforced at the **application layer**: every API route calls `getCurrentUser()` and then scopes all queries with `.eq('user_id', user.id)` (or the equivalent ownership column) before executing. If a route omits a filter, all rows for that table would be visible to that user.

**`withUserContext` (optional hardening):** `src/lib/db/pg.ts` exports `withUserContext(userId, fn)`. Wrapping route handler queries in this function groups them in a single PostgreSQL transaction and sets `SET LOCAL app.current_user_id = '<userId>'`. This provides a foundation for future database-level enforcement (by adding PostgreSQL RLS policies that check `current_setting('app.current_user_id', true)::uuid`) without requiring code changes to existing queries. Example usage:

```typescript
import { withUserContext } from '@/lib/db/unified-client';

// Inside a DO/Railway route handler:
const user = await getCurrentUser(supabase);
if (!user) return unauthorized();

const data = await withUserContext(user.id, async () => {
  const { data } = await supabase.from('shelves').select('*').eq('user_id', user.id);
  return data;
});
```

**Hardening DO/Railway to database-level enforcement (advanced):** Create a dedicated low-privilege application database role with `BYPASSRLS` revoked:
```sql
CREATE ROLE liravo_app WITH LOGIN PASSWORD '...';
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO liravo_app;
REVOKE BYPASSRLS ON SCHEMA public FROM liravo_app; -- or simply don't grant it
```
Then add RLS policies that use `current_setting('app.current_user_id', true)::uuid` instead of `auth.uid()`. With `withUserContext` already setting this variable in every request, the database will enforce isolation automatically.

---

### Section 3b — DATABASE_URL and PgBouncer (Most Commonly Missed Step)

Both DigitalOcean and Railway use PgBouncer in **transaction pooling mode**. The app must
connect to PgBouncer, not the raw Postgres port. The direct Postgres URL is only used for migrations.

**DigitalOcean**: DigitalOcean shows the direct URL (port 25432) by default. You must create a pool manually:

1. Go to **Databases** → your cluster → **Connection Pools** tab
2. Click **Create Pool** → choose **Transaction** mode
3. Copy the connection string (port **25061**) → set as `DATABASE_URL`

The direct connection (port 25432) is used only for running migrations via `psql`.

**Railway**: Deploy the **"PgBouncer + PostgreSQL + pgAdmin"** template from the Railway template gallery.
This creates three services in your project:
- `postgres` — the raw database (use this URL only for migrations)
- `pgbouncer` — the connection pooler in transaction mode (use this as `DATABASE_URL`)
- `pgadmin` — optional management UI

Set `DATABASE_URL` to the PgBouncer service's internal URL. The Postgres service URL is used only for
running migrations (optionally document it as `DATABASE_DIRECT_URL` for your own reference).

### Connection Pooling Explanation

- `prepare: false` is **required** in postgres.js because PgBouncer Transaction mode does not
  support prepared statements. Omitting this will cause cryptic query failures at runtime.
- `DATABASE_POOL_MAX` controls the maximum connections **per serverless function instance**.
  The default of 5 is correct for serverless; PgBouncer handles the actual server-side pooling.
- For persistent servers (not serverless), you can raise this to 10–20.
- Keep the pool low for serverless — each function instance creates its own pool, and Vercel
  can spin up many instances simultaneously.

---

## 4. Supabase Setup

1. Create a new Supabase project at [supabase.com](https://supabase.com).
2. In Project Settings → API, copy the URL and keys into `.env.local`.
3. In the SQL Editor, run the migration files in order (see Section 17 for the full list).
4. In Authentication → Providers, enable:
   - **Google**: add your Google OAuth credentials (see Section 6).
   - **Telegram**: add your Telegram bot token (see Section 7).
5. In Storage, create a bucket named `avatars` with public read access.
6. RLS is automatically configured by the migration files. Default deny on every table. Explicit allow policies cover all 50+ user-facing tables. Two system tables (`outbox_events`, `financial_audit_log`) intentionally have no user-facing policies — they are service-role-only. See Section 3c for the full model.

---

## 5. DigitalOcean PostgreSQL Setup

1. Create a new Managed PostgreSQL cluster in the DigitalOcean console.
2. In Connection Pools → Create Pool:
   - Mode: **Transaction** (not Session)
   - Copy the connection string (port **25061**) → set as `DATABASE_URL`
3. Run migrations via the direct connection (port 25432 — see Section 17):
   ```bash
   psql "postgresql://user:pass@host:25432/dbname?sslmode=require" -f supabase/migrations/001_initial_schema.sql
   # ... repeat for all migrations in order
   ```
4. Set `DATABASE_PROVIDER=digitalocean` and `NEXT_PUBLIC_DATABASE_PROVIDER=digitalocean`.
5. Configure S3-compatible storage (see Section 2 above).
6. Redis is required — configure it as per Section 6 (below).

---

## 5b. Railway PostgreSQL Setup

1. In your Railway project, click **New** → **Template** → search for **"PgBouncer + PostgreSQL + pgAdmin"** and deploy it.
   This creates three services: `postgres`, `pgbouncer`, and `pgadmin`.
2. In the `pgbouncer` service → **Variables**, confirm `POOL_MODE=transaction` (it should be the default).
3. Copy the `pgbouncer` service's connection URL → set as `DATABASE_URL` in your app's env vars.
4. Copy the `postgres` service's connection URL — use this **only for migrations** (not for the app).
5. Run migrations via the direct Postgres URL:
   ```bash
   psql "postgresql://postgres:pass@postgres.railway.internal:5432/railway" \
     -f supabase/migrations/001_initial_schema.sql
   # ... repeat for all migrations in order
   ```
6. Set `DATABASE_PROVIDER=railway` and `NEXT_PUBLIC_DATABASE_PROVIDER=railway`.
7. Configure S3-compatible storage (see Section 2 above) — Cloudflare R2 is recommended.
8. Redis is required — configure it as per Section 6 (below). You can add a Redis service directly in Railway.

---

## 6. Redis Setup

Redis is **required in all three provider modes**. It is used for:
- Rate limiting (all modes)
- Feature flag caching (all modes)
- Feed caching (all modes)
- Session storage (DigitalOcean and Railway modes only)

### Option A: Upstash (recommended for Vercel)

1. Create a free account at [upstash.com](https://upstash.com).
2. Create a Redis database.
3. Copy the REST URL and token into your env vars.
4. Set `REDIS_PROVIDER=upstash`.

### Option B: ioredis (self-hosted)

1. Deploy Redis on [Railway](https://railway.app) or [Render](https://render.com).
2. Copy the Redis connection string.
3. Set `REDIS_PROVIDER=ioredis` and `REDIS_URL=redis://...`.

---

## 7. Google OAuth Setup _(Supabase mode only)_

1. Go to [Google Cloud Console](https://console.cloud.google.com).
2. Create a new project or select existing.
3. Enable **Google People API** and **Google OAuth 2.0**.
4. In APIs & Services → Credentials → Create Credentials → OAuth client ID.
5. Application type: **Web application**.
6. Authorised redirect URIs: `https://your-project.supabase.co/auth/v1/callback`.
7. Copy Client ID and Client Secret into Supabase Auth → Google provider.
8. Set `NEXT_PUBLIC_GOOGLE_CLIENT_ID` in your env.

---

## 8. Telegram OAuth Setup _(Supabase mode only)_

1. Open Telegram and message [@BotFather](https://t.me/BotFather).
2. Send `/newbot`, follow prompts to name your bot.
3. Copy the bot token.
4. In Supabase Auth → Telegram provider, paste the token.
5. Set `TELEGRAM_BOT_TOKEN` in your env.

---

## 9. Amazon Associates Setup

1. Apply at [affiliate-program.amazon.com](https://affiliate-program.amazon.com) (US) and the regional equivalent for each market.
2. The **3-qualifying-sale requirement**: Amazon requires 3 qualifying sales within 180 days for full PA API access. Until then, use the static affiliate link fallback (Amazon search URL + tag). The affiliate store registry handles this automatically.
3. Once PA API access is approved, update the `affiliate_stores` table with dynamic link templates.
4. For each country, note your affiliate tag and set the environment variables.

---

## 10. Paystack Setup

1. Create an account at [paystack.com](https://paystack.com).
2. In Settings → API Keys & Webhooks, copy your secret and public keys.
   - Set `PAYSTACK_SECRET_KEY` (starts with `sk_live_...`)
   - Set `PAYSTACK_PUBLIC_KEY` (starts with `pk_live_...`)
3. Configure a webhook URL: `https://liravo.org/api/subscriptions/webhook`
   - Set header: `x-payment-provider: paystack`
   - Set header: `x-webhook-secret: <PAYMENT_WEBHOOK_SECRET value>`
4. Copy the webhook secret and set `PAYMENT_WEBHOOK_SECRET` in your env.
5. Test with Paystack's webhook simulator in the dashboard.

### Paystack events handled

| Event | Action |
|---|---|
| `subscription.activated` | Sets `is_premium: true` on user, updates subscription to `active` |
| `subscription.cancelled` | Sets `is_premium: false`, updates subscription to `cancelled` |

---

## 11. Dodopayments Setup

1. Create an account at [dodopayments.com](https://dodopayments.com).
2. In Dashboard → API Keys, copy the secret key. Set `DODOPAYMENTS_SECRET_KEY`.
3. Set up a webhook endpoint: `https://liravo.org/api/subscriptions/webhook`
   - Set header: `x-payment-provider: dodopayments`
   - Set header: `x-webhook-secret: <PAYMENT_WEBHOOK_SECRET value>`
4. Copy the webhook signing secret. Set `DODOPAYMENTS_WEBHOOK_SECRET` (for signature verification).
5. The same `PAYMENT_WEBHOOK_SECRET` is used across both providers for the shared header check.

### Dodopayments events handled

| Event | Action |
|---|---|
| `subscription.activated` | Sets `is_premium: true` on user |
| `subscription.cancelled` | Sets `is_premium: false` |
| `payment.completed` (promoted listings webhook) | Activates promoted listing for 30 days |

---

## 12. Vercel Deployment

1. Fork or push the repository to GitHub.
2. Import the project on [Vercel](https://vercel.com).
3. In the Vercel project settings, add all environment variables from `.env.local.example`.
4. Connect your custom domain `liravo.org` in Vercel → Domains.
5. Supabase redirect URI for OAuth must be updated to the production domain _(Supabase mode only)_.

---

## 13. Cron Job Setup (cron-job.org)

Vercel Hobby Plan allows only 1 cron trigger per day. Sub-daily jobs use [cron-job.org](https://cron-job.org) to call protected Next.js API routes.

**All cron endpoints require the `x-cron-secret` header matching `CRON_SECRET`.**

| Job | Endpoint | Schedule | Purpose |
|---|---|---|---|
| Feed pre-compute | `/api/cron/feed` | Every 5 min | Refresh active user feeds |
| Leaderboard refresh | `/api/cron/leaderboards` | Every hour | Update leaderboard data |
| Streak check | `/api/cron/streaks` | Daily (midnight UTC) | Process streak freezes |
| Shelf recommendations | `/api/cron/shelf-recommendations` | Nightly 02:00 UTC | AI shelf recommendations for users |
| Leaderboard snapshot | `/api/cron/leaderboard-snapshot` | Weekly Sunday 03:00 | Save weekly leaderboard snapshot |
| Prompt generation | `/api/cron/generate-prompts` | Weekly Sunday 02:00 | AI-generate 7 days of writing prompts |
| AI writing plans | `/api/cron/ai-writing-plans` | Weekly Monday 04:00 | Personalised AI writing plans for premium users |
| Affiliate health | `/api/cron/affiliate-health` | Nightly 03:00 UTC | Validate top 500 book links, flag zero-click books |
| Taste profiles | `/api/cron/taste-profiles` | Daily 05:00 UTC | Refresh AI taste profiles >30 days old (max 50/run) |
| Email digest | `/api/cron/email-digest` | Weekly Friday 09:00 | Send weekly reading digest to opted-in users |

---

## 14. Production Checklist

### All deployments

- [ ] All environment variables set in Vercel
- [ ] Redis configured and reachable
- [ ] `CRON_SECRET` generated and set
- [ ] Payment webhook secrets configured
- [ ] `NEXT_PUBLIC_APP_URL` set to production domain

### Supabase mode additional checklist

- [ ] Supabase project created
- [ ] All migrations run in SQL Editor (in order — see Section 17)
- [ ] Auth providers (Google, Telegram) configured in Supabase dashboard
- [ ] `avatars` storage bucket created with public read access
- [ ] OAuth redirect URI updated to production domain
- [ ] Verify RLS is active: `SELECT tablename FROM pg_tables WHERE schemaname='public' AND rowsecurity=false;` — should return zero rows

### DigitalOcean mode additional checklist

- [ ] Separate production PostgreSQL cluster (do not share staging and production)
- [ ] Connection Pool created in **Transaction** mode (port 25061)
- [ ] Automated backups enabled in DO console (Databases → your cluster → Backups)
- [ ] All migrations run via psql on the **direct** port (25432) — see Section 15
- [ ] S3-compatible storage bucket created with public read access
- [ ] CDN enabled on the storage bucket
- [ ] `S3_*` env vars set and verified
- [ ] `DATABASE_PROVIDER=digitalocean` and `NEXT_PUBLIC_DATABASE_PROVIDER=digitalocean` set
- [ ] (Optional hardening) Dedicated low-privilege app DB role created (see Section 3c) so PostgreSQL-level RLS is enforced in addition to application-layer checks

### Railway mode additional checklist

- [ ] PgBouncer + PostgreSQL + pgAdmin template deployed in Railway project
- [ ] `pgbouncer` service `POOL_MODE` confirmed as `transaction`
- [ ] All migrations run via the **Postgres service URL** (not PgBouncer) — see Section 15
- [ ] Redis service added to Railway project (or Upstash configured externally)
- [ ] S3-compatible storage bucket created with public read access (Cloudflare R2 recommended)
- [ ] CDN enabled on the storage bucket
- [ ] `S3_*` env vars set and verified
- [ ] `DATABASE_URL` set to the **PgBouncer** service URL (not the Postgres service URL)
- [ ] `DATABASE_PROVIDER=railway` and `NEXT_PUBLIC_DATABASE_PROVIDER=railway` set
- [ ] (Optional hardening) Dedicated low-privilege app DB role created (see Section 3c) so PostgreSQL-level RLS is enforced in addition to application-layer checks

---

## 15. Database Migrations

Run migrations in the following order. **How** you run them depends on your provider:

- **Supabase**: Open the Supabase SQL Editor (Dashboard → SQL Editor) and paste each file's content in order.
- **DigitalOcean**: Use the **direct** connection (port 25432) — **not** the PgBouncer URL. PgBouncer Transaction mode does not support DDL reliably.
- **Railway**: Use the **Postgres service** connection URL — **not** the PgBouncer service URL. Same reason as above.

```bash
# DigitalOcean — direct connection (port 25432)
DIRECT_URL="postgresql://user:pass@host:25432/dbname?sslmode=require"

# Railway — Postgres service URL (not PgBouncer)
DIRECT_URL="postgresql://postgres:pass@postgres.railway.internal:5432/railway"

# Run all migrations in order (same command for both DO and Railway):
psql "$DIRECT_URL" -f supabase/migrations/001_initial_schema.sql
psql "$DIRECT_URL" -f supabase/migrations/002_additional_stores.sql
psql "$DIRECT_URL" -f supabase/migrations/003_atomic_fixes.sql
psql "$DIRECT_URL" -f supabase/migrations/004_webhook_and_financial_integrity.sql
psql "$DIRECT_URL" -f supabase/migrations/005_outbox_events.sql
psql "$DIRECT_URL" -f supabase/migrations/006_outbox_retry_schedule.sql
psql "$DIRECT_URL" -f supabase/migrations/007_outbox_claim_rpc.sql
psql "$DIRECT_URL" -f supabase/migrations/008_missing_tables.sql
psql "$DIRECT_URL" -f supabase/migrations/009_themes_and_email_tokens.sql
psql "$DIRECT_URL" -f supabase/migrations/010_payout_methods_and_audiobook.sql
psql "$DIRECT_URL" -f supabase/migrations/011_password_hash_for_do.sql
psql "$DIRECT_URL" -f supabase/migrations/012_rls_enforcement.sql
```

### Migration order

| File | Purpose |
|---|---|
| `001_initial_schema.sql` | Core tables (users, books, shelves, reviews, auth) |
| `002_additional_stores.sql` | Affiliate stores expansion |
| `003_atomic_fixes.sql` | Schema fixes & constraints |
| `004_webhook_and_financial_integrity.sql` | Webhook tables & financial audit |
| `005_outbox_events.sql` | Event outbox pattern |
| `006_outbox_retry_schedule.sql` | Outbox retry schedule |
| `007_outbox_claim_rpc.sql` | RPC for outbox claim |
| `008_missing_tables.sql` | Additional tables |
| `009_themes_and_email_tokens.sql` | Theme management & email tokens |
| `010_payout_methods_and_audiobook.sql` | Payout methods & audiobook flag |
| `011_password_hash_for_do.sql` | `password_hash` column — required for DigitalOcean and Railway modes |
| `012_rls_enforcement.sql` | RLS policies for all tables that were missing them; enables RLS on `financial_audit_log` and `outbox_events` |

> **Note**: Migration 011 is safe to apply in Supabase mode too — the column stays NULL for
> OAuth-only users and has no effect on Supabase Auth.

> **Note**: Migration 012 contains `auth.uid()` calls and is Supabase-specific. When running
> migrations on DigitalOcean or Railway mode, this migration can be skipped or applied
> selectively — the `auth.uid()` policies have no effect in direct PostgreSQL mode (the
> function is undefined and policies are bypassed by the privileged connecting role). Access
> control in those modes is handled by application-layer ownership checks. See Section 3c.

---

## 16. Database Seeding

Seeding populates the platform with books, reading lists, writing prompts, writing challenges,
and the `@liravo_editors` system account. All seed operations are **idempotent** — safe to run
multiple times without duplicating data.

### What gets seeded

| Domain | Count | Idempotency |
|--------|-------|-------------|
| Liravo Editors account | 1 | Skip if username exists |
| Books | ~100 titles | Upsert on `isbn_13` |
| Reviews | ~30 (top books) | Skip if `(user_id, book_id)` exists |
| Quotes | ~45 (top books) | Skip if `(user_id, book_id, content)` exists |
| Writing prompts | 63 days | Skip if `prompt_date` already has a prompt |
| Writing challenges | 6 (4 weekly + 2 monthly) | Skip if `title` exists |
| Reading lists | 20 curated lists | Skip if `(user_id, title)` exists |

> Feature flags and affiliate stores are seeded by the database migrations (migration 001) and
> do not need to be re-seeded manually.

---

### Step 1 — Bootstrap the first admin user

The `is_admin` flag defaults to `false` for every new account. You must flip it directly in
the database after signing up for the first time.

**Supabase mode**: Sign up via the app, then open the Supabase Table Editor, find your user
row in the `users` table, and set `is_admin` to `true`.

**DigitalOcean mode**: Sign up via the email + password form on the home page (`/`), then run:

```bash
# Use the direct connection (port 25432), NOT the PgBouncer URL
psql "postgresql://user:pass@host:25432/dbname?sslmode=require" -c \
  "UPDATE users SET is_admin = true WHERE email = 'your@email.com';"
```

**Railway mode**: Sign up via the email + password form on the home page (`/`), then run:

```bash
# Use the Postgres service URL (not PgBouncer)
psql "postgresql://postgres:pass@postgres.railway.internal:5432/railway" -c \
  "UPDATE users SET is_admin = true WHERE email = 'your@email.com';"
```

---

### Step 2 — Seed via CLI (recommended for initial setup)

The CLI seed script runs directly against the database and does not require the app server
to be running. It requires Supabase credentials only.

```bash
# Load env vars first (choose one method):
export $(grep -v '^#' .env.local | xargs)
# or: source .env.local

# Run the full seed:
npm run seed

# Dry run — prints what would be inserted without writing anything:
npm run seed:dry

# Seed only a specific domain:
npx tsx scripts/seed.ts --only=editors-account
npx tsx scripts/seed.ts --only=books
npx tsx scripts/seed.ts --only=reviews-quotes
npx tsx scripts/seed.ts --only=prompts
npx tsx scripts/seed.ts --only=challenges
npx tsx scripts/seed.ts --only=reading-lists
```

**Required env vars for CLI seed:**
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

> **DigitalOcean / Railway mode**: The CLI seed script connects via the Supabase SDK and requires Supabase credentials.
> If you're not running Supabase at all, use the **Admin UI seed** (Step 3 below) instead — it works in all three modes.

The seed script prints a verification summary on completion:

```
Verification:
  [PASS] liravo_editors account — found
  [PASS] Books — 100 rows (min 90)
  [PASS] Writing prompts — 63 rows (min 55)
  [PASS] Writing challenges — 6 rows (min 5)
  [PASS] Reading lists — 20 rows (min 15)
  [PASS] Reviews — 30 rows (min 25)
  [PASS] Quotes — 45 rows (min 30)
```

---

### Step 3 — Seed via Admin UI (for deployed environments)

Once your account has `is_admin = true`, log in and navigate to **`/admin/seed`**. Run the
numbered actions in order — each depends on the previous:

| Step | Action | What it creates |
|------|--------|-----------------|
| 1 | **Create Liravo Editors Account** | The `@liravo_editors` system account |
| 2 | **Seed Books** | ~100 curated books across all genres |
| 3 | **Seed Reading Lists** | 20 SEO-optimised reading lists |
| 4 | **Seed Writing Prompts (63 days, static)** | 63 days of pre-written daily prompts |
| 5 | **Seed Writing Challenges** | 4 weekly + 2 monthly challenges |
| — | **Generate AI Writing Prompts** | 7 more days of AI-generated prompts (optional) |

---

### Manual SQL verification

Run these queries after seeding to confirm everything is in place:

```sql
SELECT COUNT(*) FROM books;                    -- expect >= 100
SELECT COUNT(*) FROM writing_prompts;          -- expect >= 60
SELECT COUNT(*) FROM writing_challenges;       -- expect >= 6
SELECT COUNT(*) FROM reading_lists;            -- expect >= 20
SELECT COUNT(*) FROM reviews;                  -- expect >= 25
SELECT COUNT(*) FROM quotes;                   -- expect >= 30
SELECT id, username FROM users WHERE username = 'liravo_editors';
```

---

### Invite codes (DigitalOcean / Railway mode)

After you have an admin user ID, seed initial invite codes via the direct Postgres connection
(not the PgBouncer URL):

```bash
# DigitalOcean (port 25432)
psql "postgresql://user:pass@host:25432/dbname?sslmode=require" -c \
  "INSERT INTO invite_codes (code, created_by) VALUES ('INVITE123', '<admin-user-id>');"

# Railway (Postgres service URL)
psql "postgresql://postgres:pass@postgres.railway.internal:5432/railway" -c \
  "INSERT INTO invite_codes (code, created_by) VALUES ('INVITE123', '<admin-user-id>');"
```

---

## 17. Limitations

### DigitalOcean and Railway mode limitations

Both direct-PostgreSQL modes (DigitalOcean and Railway) share these limitations:

- **No OAuth**: Google and Telegram login buttons are automatically hidden. Users sign in
  with email + password only.
- **No Supabase Realtime**: Live updates use SSE polling instead of Supabase's WebSocket
  connection. Updates appear within ~5–30 seconds rather than instantly.
- **No database-level RLS by default**: `auth.uid()` is a Supabase function and returns
  `null` in a direct PostgreSQL connection, so Supabase RLS policies do not enforce access
  control in these modes. Data isolation is enforced by application-layer ownership checks in
  every API route. To add database-level enforcement, create a low-privilege app role and use
  `withUserContext` — see Section 3c.
- **Migrating from Supabase**: If you switch an existing Supabase deployment to DigitalOcean
  or Railway, users who signed in via OAuth will have no `password_hash`. Their first
  email+password login will return `PASSWORD_RESET_REQUIRED`. See Section 21 (Troubleshooting)
  for recovery steps.

---

## 18. Secret Rotation Runbook

### JWT / Session Secret

**Supabase mode only** — Supabase manages JWT signing. To rotate: Supabase Dashboard → Settings
→ API → JWT Secret → Regenerate. All active sessions will be invalidated; users must sign in again.

**DigitalOcean / Railway mode** — Sessions are stored in Redis. To invalidate all sessions:
```bash
redis-cli --scan --pattern "do:session:*" | xargs redis-cli del
```

### Payment Webhook Secrets

1. Generate a new secret in the payment provider dashboard.
2. Update the environment variable in Vercel.
3. Redeploy (no downtime — Vercel deploys atomically).
4. Disable the old secret in the provider dashboard.

### AI API Keys

1. Generate a new key in the AI provider dashboard.
2. Update env var in Vercel.
3. Redeploy.
4. Revoke the old key.

### S3_KEY / S3_SECRET Rotation

The rotation process differs by provider:

**Cloudflare R2**:
1. Cloudflare Dashboard → R2 → Manage R2 API Tokens → Create Token (read/write)
2. Update `S3_KEY` and `S3_SECRET` in Vercel
3. Redeploy
4. Revoke the old token in Cloudflare

**Backblaze B2**:
1. B2 Dashboard → App Keys → Add a New Application Key
2. Update env vars in Vercel
3. Redeploy
4. Delete the old key in B2 Dashboard

**DigitalOcean Spaces**:
1. DO Dashboard → API → Spaces Access Keys → Generate New Key
2. Update `S3_KEY` and `S3_SECRET` in Vercel
3. Redeploy
4. Delete the old key in DO Dashboard

**AWS S3**:
1. AWS IAM → Users → your user → Security credentials → Create access key
2. Update env vars in Vercel
3. Redeploy
4. Deactivate and delete the old key in IAM

---

## 19. Backup and Restoration

### Supabase Backups

- Supabase Pro includes Point-in-Time Recovery (PITR). Enable in Project Settings → Backups.
- Free tier: daily backups only.
- To restore: Supabase Dashboard → Backups → Select backup → Restore.

### DigitalOcean Backups

- Automated backups: Databases → your cluster → Backups → Enable daily backups
- Backups are retained for 7 days on the Basic plan

**Manual backup** (uses the direct port 25432 — not the PgBouncer URL):
```bash
pg_dump "postgresql://user:pass@host:25432/dbname?sslmode=require" > backup_$(date +%Y%m%d).sql
```

**Restore** (uses the direct port 25432):
```bash
psql "postgresql://user:pass@host:25432/dbname?sslmode=require" < backup_20240101.sql
```

### Railway Backups

Railway includes automated daily backups for PostgreSQL services (retention varies by plan).
To find them: Railway Dashboard → your project → `postgres` service → **Backups** tab.

**Manual backup** (uses the Postgres service URL — not the PgBouncer URL):
```bash
pg_dump "postgresql://postgres:pass@postgres.railway.internal:5432/railway" \
  > backup_$(date +%Y%m%d).sql
```

**Restore**:
```bash
psql "postgresql://postgres:pass@postgres.railway.internal:5432/railway" \
  < backup_20240101.sql
```

> **Tip**: When running `psql` or `pg_dump` locally against Railway, use the **public** URL
> exposed in the Railway dashboard (Railway → postgres service → Connect), not the internal
> `.railway.internal` URL, which is only accessible from within your Railway project.

### Manual Backup (Supabase)

```bash
pg_dump postgresql://postgres:[password]@[host]:5432/postgres > backup.sql
```

---

## 20. Deployment and Rollback

### Deploy

Push to `main` branch. GitHub Actions builds and validates. Vercel auto-deploys on merge.

### Rollback

In Vercel → Deployments, select a previous deployment → Promote to Production.

### Database Migration Rollback

Each migration file should have a corresponding rollback.

**Supabase mode**: Run rollback SQL in the Supabase SQL Editor or via psql.

**DigitalOcean mode**: Run rollback SQL via psql using the **direct** connection (port 25432, not PgBouncer):
```bash
psql "postgresql://user:pass@host:25432/dbname?sslmode=require" -c "<rollback SQL here>"
```

**Railway mode**: Run rollback SQL via the **Postgres service URL** (not PgBouncer):
```bash
psql "postgresql://postgres:pass@postgres.railway.internal:5432/railway" -c "<rollback SQL here>"
```

---

## 21. Troubleshooting

### "Migrations fail with 'relation already exists'"

In DigitalOcean or Railway mode, check what tables already exist before running a migration:
```bash
# DigitalOcean
psql "postgresql://user:pass@host:25432/dbname?sslmode=require" -c "\dt"

# Railway
psql "postgresql://postgres:pass@postgres.railway.internal:5432/railway" -c "\dt"
```
If a table already exists, either the migration was partially applied or you're running it twice.
Wrap the DDL in `IF NOT EXISTS` or skip the relevant migration.

### "Realtime features not updating"

In DigitalOcean and Railway modes, realtime uses SSE polling (no Supabase Realtime WebSocket).
If updates seem slow or stale, check the EventSource connection in browser DevTools (Network tab
→ filter by `eventsource`). Verify the SSE endpoint returns 200 and is streaming events.
Polling interval is typically 5–30 seconds.

### "Login returns PASSWORD_RESET_REQUIRED"

**Cause**: The user was created via OAuth (Google or Telegram) in Supabase mode and has no
`password_hash`. After migrating to DO mode, their first email+password login fails.

**Recovery**: Generate a bcrypt hash and set it manually:

```bash
# 1. Generate hash (requires Node.js and bcryptjs)
node -e "const b = require('bcryptjs'); b.hash('NewPassword123', 12).then(console.log)"
```

```sql
-- 2. Set the hash via direct psql connection (port 25432)
UPDATE users SET password_hash = '<paste-hash-here>' WHERE email = 'user@example.com';
```

Then ask the user to log in with `NewPassword123` and immediately change their password.

### "Avatar uploads fail in DigitalOcean or Railway mode"

Verify that `S3_ENDPOINT`, `S3_KEY`, `S3_SECRET`, `S3_BUCKET`, and `S3_CDN_URL` are all set.
Test the connection manually:
```bash
node -e "
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const c = new S3Client({ endpoint: process.env.S3_ENDPOINT, region: process.env.S3_REGION, credentials: { accessKeyId: process.env.S3_KEY, secretAccessKey: process.env.S3_SECRET } });
c.send(new PutObjectCommand({ Bucket: process.env.S3_BUCKET, Key: 'test.txt', Body: 'ok', ACL: 'public-read' })).then(() => console.log('OK')).catch(console.error);
"
```

### "Connection pool exhausted / too many connections"

Lower `DATABASE_POOL_MAX` (default 5). Each serverless function instance creates its own pool.
With Vercel spinning up many instances, the total connections = instances × `DATABASE_POOL_MAX`.
Ensure the PgBouncer pool size is set high enough (DigitalOcean: Connection Pools settings;
Railway: `pgbouncer` service environment variables — `MAX_CLIENT_CONN` and `DEFAULT_POOL_SIZE`).

---

## 22. Secrets That Must Never Be Committed

- `SUPABASE_SERVICE_ROLE_KEY` _(Supabase mode only)_
- `DATABASE_URL` _(contains DB password)_
- `S3_KEY` / `S3_SECRET`
- `GOOGLE_CLIENT_SECRET`
- `TELEGRAM_BOT_TOKEN`
- `PAYSTACK_SECRET_KEY`
- `DODOPAYMENTS_SECRET_KEY`
- `DEEPSEEK_API_KEY`
- `GEMINI_API_KEY`
- `CRON_SECRET`
- `RESEND_API_KEY`
- Any `*_WEBHOOK_SECRET`
- Redis credentials / tokens

The `.gitignore` excludes `.env.local`. Never commit `.env` files with real values.
