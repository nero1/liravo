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
S3_OBJECT_ACL=none                        # Default; bucket/CDN policy grants reads

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
# S3_OBJECT_ACL=public-read                # If Spaces requires object ACLs

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
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Google OAuth client audience for Supabase or direct token sign-in |
| `GOOGLE_CLIENT_SECRET` | Google OAuth Client Secret _(Supabase mode only)_ |
| `AUTH_ENCRYPTION_KEY` | Server-only base64 value encoding 32 random bytes; required to enroll/encrypt 2FA secrets (`openssl rand -base64 32`). Preserve this key with backups; rotation requires re-encrypting stored factors. |
| `GOOGLE_ALLOWED_CLIENT_IDS` | Optional comma-separated native Google OAuth audiences for direct PostgreSQL sign-in; `NEXT_PUBLIC_GOOGLE_CLIENT_ID` is also accepted. |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token from BotFather |
| `HCAPTCHA_SECRET_KEY` | Server-only hCaptcha secret; enables challenges for direct sign-up and after three failed password attempts. |
| `HCAPTCHA_SITE_KEY` | Public hCaptcha site key served by `/api/auth/config`; required when the secret is configured. |
| `HCAPTCHA_ALLOWED_HOSTNAMES` | Optional comma-separated challenge hostnames; defaults to the hostname of `NEXT_PUBLIC_APP_URL`. |

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
| `PAYSTACK_SECRET_KEY` | API secret and local SHA-512 webhook verification key |
| `PAYSTACK_PUBLIC_KEY` | Paystack public key |
| `DODOPAYMENTS_API_KEY` | Dodo API key (`DODOPAYMENTS_SECRET_KEY` remains a legacy alias) |
| `DODOPAYMENTS_ENVIRONMENT` | `test_mode` (default) or `live_mode` |
| `DODOPAYMENTS_PREMIUM_PRODUCT_ID` | Actual USD premium product ID; no fabricated default |
| `DODOPAYMENTS_WEBHOOK_SECRET` | Dodopayments webhook secret |

### Cron

| Variable | Description |
|---|---|
| `CRON_SECRET` | Random secret string used to authenticate cron job requests |

### Email

| Variable | Description |
|---|---|
| `MAILGUN_API_KEY` | Server-only Mailgun API key |
| `MAILGUN_DOMAIN` | Verified sending domain |
| `MAILGUN_FROM` | Sender address; defaults to `Liravo <noreply@MAILGUN_DOMAIN>` |

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
S3_OBJECT_ACL=public-read

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
   psql "postgresql://user:pass@host:25432/dbname?sslmode=verify-full" -f supabase/migrations/001_initial_schema.sql
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
2. Configure sandbox `PAYSTACK_SECRET_KEY` and `PAYSTACK_PUBLIC_KEY` first; use separate live credentials only after sandbox validation.
3. Configure `https://liravo.org/api/subscriptions/webhook`. Native `x-paystack-signature` is verified over the untouched body using SHA-512 and the API secret; no custom shared-secret headers are needed.
4. Charges must carry the server-generated subscription metadata; currency, amount and reference are checked before credit. Charge IDs are durable replay identities.
5. Test with the provider dashboard before enabling billing. The verification key must be available to local HMAC code, not only as an outbound proxy placeholder.

### Paystack events handled

| Event | Action |
|---|---|
| `charge.success` | Activates/renews the bound subscription after payment validation |

---

## 11. Dodopayments Setup

1. Create an account at [dodopayments.com](https://dodopayments.com).
2. Set `DODOPAYMENTS_API_KEY`, `DODOPAYMENTS_ENVIRONMENT=test_mode`, and a real `DODOPAYMENTS_PREMIUM_PRODUCT_ID` priced consistently with the app's USD premium price. The legacy `DODOPAYMENTS_SECRET_KEY` name is accepted.
3. Configure `https://liravo.org/api/subscriptions/webhook` and its `DODOPAYMENTS_WEBHOOK_SECRET`. Standard Webhooks verification uses `webhook-id`, `webhook-timestamp` and `webhook-signature`; the signing secret must be available locally for HMAC verification.
4. Checkout uses `/checkouts` on `test.dodopayments.com` or `live.dodopayments.com`, matching the official Dodo SDK contract. `payment.succeeded` activates/renews; `subscription.cancelled` and `subscription.expired` update entitlement. Older events cannot undo a later cancellation.
5. Tip webhook delivery uses `/api/tips/webhook` and signed provider metadata `tip_id`. Successful payment IDs deduplicate across delivery IDs; amount/currency checks precede any credit. The tip checkout UI/provider flow still needs sandbox end-to-end verification.

### Dodopayments events handled

| Event | Action |
|---|---|
| `payment.succeeded` | Validates payment and activates/renews the bound subscription, or completes a tip |
| `payment.failed` | Marks the bound tip failed without credit |
| `subscription.cancelled` / `subscription.expired` | Updates the bound subscription entitlement, ignoring stale events |

Unsupported events or unrelated products are acknowledged without changes. Do not configure homegrown `subscription.activated` payloads or `x-webhook-secret` headers; adapters consume native provider envelopes. Promoted-listing billing is a separate unfinished integration.

---

## 12. Vercel Deployment

`npm run build` checks every server function trace plus the shared runtime against a 200 MB uncompressed budget (Vercel limit: 250 MB). Transformers/ONNX are browser-only dependencies; the build rejects them in server traces. Keep the server webpack alias in place when changing the client tone classifier.

1. Fork or push the repository to GitHub.
2. Import the project on [Vercel](https://vercel.com).
3. In the Vercel project settings, add all environment variables from `.env.local.example`.
4. Connect your custom domain `liravo.org` in Vercel → Domains.
5. Supabase redirect URI for OAuth must be updated to the production domain _(Supabase mode only)_.

---

## 13. Cron Job Setup (cron-job.org)

Vercel Hobby schedules each job daily or less often. `vercel.json` contains the deployed schedules. All cron routes accept GET (Vercel) and POST (external orchestrators), require `Authorization: Bearer <CRON_SECRET>`, and use a renewable distributed overlap lock. Redis failure returns 503; overlap returns 409. Stagger external jobs; do not run the same job concurrently on two schedulers. Administrators can run jobs through `POST /api/admin/cron-status`; its DB authorization and server-held credential preserve the same job locks. The admin panel lists deployed schedules and integrity alerts. Never expose the cron credential through a public environment variable.

| Job | Endpoint | Schedule |
|---|---|---|
| Outbox drain | `/api/cron/outbox-drain` | Daily 00:00 UTC |
| Leaderboard snapshot | `/api/cron/leaderboard-snapshot` | Daily 02:00 UTC |
| Shelf recommendations | `/api/cron/shelf-recommendations` | Daily 03:00 UTC |
| Similar books | `/api/cron/similar-books` | Daily 04:00 UTC |
| Prompt generation | `/api/cron/generate-prompts` | Daily 06:00 UTC |
| AI writing plans | `/api/cron/ai-writing-plans` | Daily 07:00 UTC |
| New release alerts | `/api/cron/new-release-alerts` | Daily 08:00 UTC |
| Reading goal milestones | `/api/cron/reading-goal-milestones` | Daily 09:00 UTC |
| Account hardening | `/api/cron/account-hardening` | Daily 10:00 UTC |
| Taste profiles | `/api/cron/taste-profiles` | Sunday 01:00 UTC |
| Email digest | `/api/cron/email-digest` | Daily 11:00 UTC; once per user/UTC week |
| Affiliate health | `/api/cron/affiliate-health` | External scheduler, daily 12:00 UTC |

Daily outbox processing can delay notifications up to 24 hours. Use an external POST scheduler for lower latency. Digests process four users concurrently, up to 40 per run, with a Redis cursor; increase the external invocation frequency for larger audiences. A 35-second scheduling deadline and six-second Mailgun timeout bound each invocation. Migration 031 tracks weekly delivery receipts and caps definite-failure retries at three; successful recipients are skipped on replay. Ambiguous timeouts and stale sending claims become `unknown` and are never automatically resent. Verify them in Mailgun before marking `sent` with its message ID or `failed` for a safe retry. Reconciliation logs uncertain deliveries and financial state/outbox/audit anomalies during outbox drain; alert on any nonzero count. Daily invocation permits continuation within the week; use an external scheduler when the audience exceeds daily batch capacity.

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
DIRECT_URL="postgresql://user:pass@host:25432/dbname?sslmode=verify-full"

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
psql "postgresql://user:pass@host:25432/dbname?sslmode=verify-full" -c \
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
to be running. It supports Supabase credentials or a direct PostgreSQL connection.

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

**Required env vars for CLI seed (Supabase):**
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

**DigitalOcean / Railway:** set `DATABASE_PROVIDER` to `digitalocean` or `railway`, and supply `DATABASE_URL` and the appropriate `DATABASE_SSL` setting. The CLI and Admin UI use the same service-only seed routines. Failed seeds exit nonzero; retry after resolving reported dependencies. Existing lists repair missing book links and prompts keep their original schedule.

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
psql "postgresql://user:pass@host:25432/dbname?sslmode=verify-full" -c \
  "INSERT INTO invite_codes (code, created_by) VALUES ('INVITE123', '<admin-user-id>');"

# Railway (Postgres service URL)
psql "postgresql://postgres:pass@postgres.railway.internal:5432/railway" -c \
  "INSERT INTO invite_codes (code, created_by) VALUES ('INVITE123', '<admin-user-id>');"
```

---

## 17. Limitations

### DigitalOcean and Railway mode limitations

Both direct-PostgreSQL modes (DigitalOcean and Railway) share these limitations:

- **Web sign-in** uses email/password in direct PostgreSQL mode. Native Google ID-token sign-in requires an allowed client audience; Telegram signed-payload exchange requires the bot token. Supabase web OAuth uses its configured providers.
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

**DigitalOcean / Railway mode** — Sessions use Redis and PostgreSQL factor grants. To invalidate all sessions, remove both:
```bash
redis-cli --scan --pattern "do:session:*" | xargs -r redis-cli del
psql "$DATABASE_DIRECT_URL" -c "DELETE FROM auth_factor_grants;"
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
pg_dump "postgresql://user:pass@host:25432/dbname?sslmode=verify-full" > backup_$(date +%Y%m%d).sql
```

**Restore** (uses the direct port 25432):
```bash
psql "postgresql://user:pass@host:25432/dbname?sslmode=verify-full" < backup_20240101.sql
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

### Quarterly restore drill

Restore an encrypted backup to an isolated database; never overwrite production for a drill. Target RPO ≤24 hours and RTO ≤4 hours. Verify the backup checksum before restoring, migration version, table counts and foreign keys; sample user ownership, completed tips versus payouts, referral commissions, pending payout reservations and outbox status. Run authentication and financial smoke tests with sandbox credentials. Record backup timestamp, restore duration, discrepancies and operator sign-off in the existing operations log; failed checks block release until reconciled. Delete the drill database after review.

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
psql "postgresql://user:pass@host:25432/dbname?sslmode=verify-full" -c "<rollback SQL here>"
```

**Railway mode**: Run rollback SQL via the **Postgres service URL** (not PgBouncer):
```bash
psql "postgresql://postgres:pass@postgres.railway.internal:5432/railway" -c "<rollback SQL here>"
```

---

### Abuse and alert policy

Money limits enforce independent account and trusted-IP counters; AI limits use account identity; missing Redis fails closed. Auth limits retain their existing fail-open availability policy and need ingress bot protection. Forwarded IPs are ignored by default; Vercel uses its overwritten `x-vercel-forwarded-for` header. Other deployments may set `TRUSTED_CLIENT_IP_HEADER` only when their ingress strips and replaces that header. Never trust client-provided forwarding chains or fingerprints.

| Class | Policy | Escalation |
|---|---|---|
| Authentication | `RATE_LIMITS.AUTH_*` window/lockout | Ingress challenge after repeated failures |
| Money | Auth quota per user + trusted IP, fail closed | Investigate payout failures immediately |
| Catalog lookup | 20/minute per user, fail closed; shared 18-second provider budget | Retry unavailable providers; inspect identity conflicts |
| AI | 30/minute per user, fail closed | Review spend and provider failures |
| Social | 120/minute per user, durable idempotency and lifetime reward uniqueness | Ingress challenge for high-volume accounts |

Use structured `cron_run`, `cron_error`, `payout_request_error`, `tip_create_error`, and `subscription_webhook_error` logs with correlation IDs. Alert on financial errors immediately, cron errors/overlaps across two scheduled runs, and an outbox oldest-pending age exceeding its scheduler interval. The admin cron dashboard has persistent Redis counters in fixed UTC 15-minute windows. It alerts on any payment conflict/processing failure, payout failure or failed cron run, two overlaps, or replay rates above 10% with at least 20 verified deliveries. Counter reads that fail show an explicit unavailable state. External paging can consume the structured logs; no paging integration is provisioned. Tune quotas using verified false-positive samples; never disable financial deduplication or CSRF to reduce alerts.

## 21. Troubleshooting

### "Migrations fail with 'relation already exists'"

In DigitalOcean or Railway mode, check what tables already exist before running a migration:
```bash
# DigitalOcean
psql "postgresql://user:pass@host:25432/dbname?sslmode=verify-full" -c "\dt"

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

### "Password login fails after migrating an OAuth account"

OAuth-only accounts have no password hash. Use the original identity provider or `/account/recover` with a verified recovery email. Password login deliberately returns the same failure for missing accounts and accounts without passwords. Direct passwords must fit within bcrypt's 72-byte UTF-8 limit; use account recovery for legacy longer passwords.

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
- `DODOPAYMENTS_API_KEY` (or its legacy alias)
- `DEEPSEEK_API_KEY`
- `GEMINI_API_KEY`
- `CRON_SECRET`
- `MAILGUN_API_KEY`
- Any `*_WEBHOOK_SECRET`
- Redis credentials / tokens

The `.gitignore` excludes `.env.local`. Never commit `.env` files with real values.

### Security and financial migration update

Apply migrations 019–068 after the existing migrations before deploying these routes. Financial and social writes now require service-only RPCs; missing RPCs fail closed. `service_role` must exist and the direct PostgreSQL application role must have EXECUTE privileges on these routines. Never grant them to anonymous or browser roles. Use a staging restore first; the SQL tests exercise isolated fixtures. All migrations also passed a clean PostgreSQL 16 rehearsal with Supabase auth stubs; rehearse your own staging snapshot before production.

Payout requests reserve each USD/NGN/EUR balance atomically; failed/cancelled requests release reservations, completed requests remain deducted. Currencies are never implicitly converted; referral commissions retain their transaction currency. Tip referral commissions are 10% of the platform fee; subscription and ticket referrals are 10% of their purchase price. Migration 050 corrects verified historical commissions, preserves proportional refunds and audits exact adjustments; missing attribution evidence still requires staging reconciliation before withdrawals. Tips and payouts use `Idempotency-Key`; social mutations use `X-Idempotency-Key` (8–200 characters). Webhook event IDs are durably unique per provider; failed transactions retain no replay claim. Provider-native charge/payment identities supply durable webhook event IDs. Paystack HMAC uses SHA-512. Verify provider adapters against real sandbox payloads before accepting payments.

Browser mutations send the CSRF cookie in `X-CSRF-Token`; native forms include `_csrf`. Stateless Bearer clients must authenticate independently and cannot fall back to cookie sessions. Feed/notification/list cursors are opaque timestamp/UUID tokens; clients should follow `nextCursor`. List responses cap own and followed collections at 50; follow `nextCursor`/`cursor` and `nextFollowedCursor`/`followedCursor` independently.

Web validation: `npm ci`, `npm run lint`, `npx tsc --noEmit`, `npm test`, `npm run build`. Node 24 supports the current test toolchain. Expo has its own dependencies/configuration under `mobile/` and is excluded from web type checking. Run `npm ci`, `npm run lint -- --max-warnings 0`, `npm run typecheck` and `npm run export:android` there; CI runs these separately. Set `LIRAVO_BASE_URL` only for live API tests; absent values are explicitly skipped. Local SQL tests use PGlite; repeat competing financial requests against a real PostgreSQL staging instance before release.

Migration 023 copies legacy buddy participants and prompt submissions into canonical tables, retaining legacy tables for conflict reconciliation. Review conflicting rows before retiring them. Existing deployments that manually worked around failed historical migrations must reconcile that schema in staging before applying this series.

XP awards now use a durable per-user business-event ledger. Daily login awards the configured 3 XP once per UTC day; finished-book rewards require a verified owned finished shelf entry and deduplicate by book. Generic client claims for review/like/follow XP are rejected; their authoritative routes award rewards. Outbox claims recover after five minutes, with at most ten attempts. Database notification/reward effects and acknowledgement commit together; push delivery remains best effort and its failures emit `push_delivery_error`.

Subscription intent/audit creation and local cancellation are transactional. Reuse the same idempotency key after ambiguous gateway failures; the provider reference and upstream idempotency identity stay stable. Provider-hosted checkout URLs are HTTPS allowlisted. Dodo checkout is USD-only. Sandbox verification of provider webhook formats, recurring billing cancellation and timeout reconciliation remains required before enabling live payments.

Migration 027 renames legacy `reading_lists.title` to the API contract `name` and adds followed-list keyset pagination. A database containing both columns must reconcile them first; the migration refuses to discard either.

Migration 028 adds the persisted locale preference used by the locale API. Premium checkout strings and prices use locale catalogs/formatting; CI checks catalog key parity, interpolation contracts and ICU rendering for English, French and German. Other UI areas still require the translation/accessibility sweep tracked in the audit.

Migrations 029–030 restrict private profile columns and privileged RPCs for browser roles, including Supabase explicit default grants. Auth API responses use a field allowlist; contact/authentication changes go through authenticated service handlers. Migration 031 adds digest delivery receipts and the service-only financial integrity snapshot used by outbox drain.

Migrations 032–034 add durable intent snapshots/reward outbox records for primary content creation, atomic streaks and replay-safe book interactions. Those content APIs require `Idempotency-Key` (8–200 characters); browser forms and mobile transport retain keys until acknowledgement. Reusing a key with another payload returns 409. Natural membership keys make buddy joining idempotent; a database lock enforces capacity. Migration 032 preserves legacy buddy data by renaming `creator_id`/`max_members` to the API’s `created_by`/`max_participants`; reconcile installations containing both names before applying it. Reading/writing streak dates and freeze tokens are service-managed. Missing days consume one freeze token each.

Direct PostgreSQL mutation `.select()` now returns selected fields, `.single()` checks cardinality, exact counts retain result rows, and duplicate-ignore upserts honor their option. Regression tests run against PostgreSQL. Native transport/changed payload contracts are covered independently; a full Expo build was not run.

Migrations 035–036 enforce the last-enabled sign-in provider under concurrent admin updates and atomically bind referral identity, its reward and notification. Referral codes/attribution are service-managed; OAuth callbacks accept only app-relative return paths. A 503 `FLAG_CACHE_UNAVAILABLE` means the flag was saved but cache synchronization failed; retrying the same desired state is safe.

Admin pages use service reads after DB authorization and catalogs for English/French/German. The direct PostgreSQL adapter resolves FK relationships from schema metadata, including nested/cardinality-aware projections, and supports consumed containment, non-null and case-insensitive filters. Real admin page queries and rejection handling run in the migration rehearsal. Restart app processes after schema changes.

Migration 037 queues recurring Dodo cancellations before contacting the provider. A confirmed remote cancellation commits local status, premium access and audit together. Failed requests retain access and retry through outbox drain (three concurrent requests, ten attempts, two-minute claim recovery); failed/stalled cancellations appear in integrity alerts. Paystack checkout currently makes a single charge without a recurring plan. Refund accounting and dated access are added in migration 041; checkout reconciliation and provider sandbox validation remain required.

USD/EUR tips create an immutable fixed-price Dodo product per payment reference; the old `DODOPAYMENTS_TIP_PRODUCT_ID_*` settings are unnecessary. Checkout validates product settings and reserves a stable payment reference; NGN tips use Paystack. Verified provider captures alone confirm payment; `/tips/[id]` is visible only to its sender. Keep the same request key after a checkout/network failure. Configure an external outbox scheduler for cancellation latency shorter than the daily Hobby schedule.

Migration 038 adds atomic writer submission/join/vote/best-answer intents and participation counts. Clients retain request keys after failures; independent voting controls keep independent keys. Prompt XP is awarded once per prompt and challenge XP once per challenge; editing never repeats the reward. Word counts are computed on the server. Best-answer selection is final while the selected answer exists, and a question earns at most one best-answer reward even after answer deletion. Daily prompt generation and seeding share a date-locked publisher; validated cached output retries partial database saves without skipping missing dates.

Migration 042 aligns workshop/debate collections and legacy reading-room/author-post aliases, adds the missing badge/pass/verification/appeal tables, and extends durable creates to the remaining content forms. Free-event RSVP, workshop capacity, list forks and final debate votes are transactional. Workshop drafts and private room discussions require membership; locked milestone discussions remain hidden. Author announcements use paged outbox delivery, and badge XP/notifications commit once. Browser JSON mutations retain a hashed pending intent in session storage across reloads until a readable success response; explicit caller keys take precedence.

Migration 043 makes author replies/verification, ARC applications/reviews, moderation decisions, role changes and book-chain passes transactional and replayable. These mutations require the same intent header. ARC approvals enforce capacity and closing dates. Moderation verifies current DB roles, keeps decisions/audits/notifications together and requires independent appeal review; account removal/restoration requires admin access. Approved removal appeals restore content unless another removal still applies. List follow/unfollow use desired state and natural membership keys with transactional counters. Genre rewards count distinct finished books; seasonal totals count only new awards.

In the managed Node 24 cloud environment, keep the provided proxy and CA variables and start Node with `NODE_USE_ENV_PROXY=1`; this routes provider and image-asset fetches through the session proxy. CSRF origin checks use the actual HTTP Host authority rather than Next’s internal hostname and ignore forwarded-host headers.

Migration 039 adds Google Play receipt ownership, private opaque account bindings, durable authenticated RTDN receipts and acknowledgement tracking. Configure `GOOGLE_PLAY_SERVICE_ACCOUNT_KEY`, `GOOGLE_PLAY_PACKAGE_NAME`, `GOOGLE_PLAY_PRODUCT_ID`, `GOOGLE_PLAY_RTDN_SERVICE_ACCOUNT_EMAIL` and the exact `GOOGLE_PLAY_RTDN_AUDIENCE`; follow `mobile/ANDROID_APP_SETUP.md` for Pub/Sub IAM. Query-string secrets are rejected. Allow HTTPS access to androidpublisher.googleapis.com, oauth2.googleapis.com and www.googleapis.com. Cancelled Play subscriptions retain paid time; other providers and explicit admin grants remain independent. Outbox drain expires dated entitlements; gated APIs check expiry directly. Admin grant/revoke controls change complimentary access, not paid purchases. Monitor unacknowledged purchases and stalled billing receipts in the cron dashboard.

Migration 040 makes `payout_requests` the settlement ledger; `payouts` retains tip accrual history. Earnings show earned, reserved, paid and available balances per currency, with 50-row cursors. Save a `manual` bank destination (USD/NGN/EUR) or Paystack NGN destination before requesting 5–10,000 currency units. Destinations are captured immutably per request. Users can cancel before approval; admin approval reserves processing before any external transfer. Paystack uses a stable reference, verifies amount/currency/recipient, and commits completion only after confirmed settlement; outbox drain retries approved transfers in batches of three. Pending/ambiguous results retain reservations. Resolve OTP/provider actions in the Paystack dashboard; configure a frequent external outbox scheduler when daily reconciliation is insufficient.

Configure both payment providers to POST native signed events to `/api/webhooks/payments`; the existing tip/subscription URLs remain compatible and dispatch all supported payment/transfer types. Manual payouts require admin approval, external payment, then an audited bank receipt with matching amount/currency. Historical completed/processing/failed tip transfers are held for reconciliation rather than resent; the admin queue records verified payment or verified nonpayment before releasing a legacy hold. Review historical transfers and commission calculations in staging before enabling withdrawals. Unconfirmed/stale payouts appear in integrity alerts. No Dodo creator-transfer API is assumed.

Migration 041 records immutable provider capture identities and verified service periods. Paystack purchases are 30-day passes from payment time; Dodo access uses each payment’s `service_periods`, not the subscription’s current renewal date. Dodo products must have the advertised monthly USD price, no trial/discount/PPP, and tax-exclusive pricing; tip products must also be tax exclusive. Gateway principal after tax must exactly match the reserved amount. Displayed prices exclude applicable tax. Cancellation schedules the end of renewal and preserves paid access. A full refund of the last paid Dodo period queues provider cancellation. Legacy active subscriptions without a verifiable period fail closed and appear in integrity alerts; reconcile them before deploying. Verified replays can fill a missing paid period without repeating the charge, commissions or rewards.

Signed `refund.processed` (Paystack) and `refund.succeeded` (Dodo) events bind to original captures. Partial refunds prorate creator credit and referral commission cumulatively against the original gross charge, with final rounding at the ledger’s precision; full refunds reverse tip XP and revoke only the refunded paid period. Uncovered pending payouts cancel atomically; approved/ambiguous transfers stay reserved and negative balances are flagged. Refunds before capture enter a private retry queue; outbox drain fetches the original payment and commits capture/refund together. Ten failed attempts require operator reconciliation. Duplicate charges are recorded without repeating earnings/rewards and enter the durable return queue. Refunds must use the original charge currency; no FX is inferred. Historical refunded tips retain zero credit, and existing refund/commission/XP records require staging reconciliation.

Migration 044 enforces authenticator/recovery verification before direct or Supabase application access. Enrollment uses session-bound five-minute challenges and encrypted secrets; login challenges allow ten attempts, consume TOTP steps/recovery hashes once, and issue versioned seven-day grants. Supabase authenticated RLS also requires a proof for its validated `session_id`; apply the migration before deploying. Enabling 2FA rejects unverified sessions; disabling invalidates earlier proofs. Configure `AUTH_ENCRYPTION_KEY` first. New secrets are encrypted; legacy plaintext secrets upgrade after successful verification when the key is configured. `POST /api/auth/2fa/setup` starts/confirms enrollment; verification uses `/api/auth/2fa/verify`, and Supabase clients first exchange their session through `/api/auth/session`. Outbox drain removes expired challenges/grants in bounded batches. The migration also supplies missing account deletion/Google identity columns and transactional direct-account creation for schemas retaining the auth-user foreign key.

Migration 045 supplies canonical annual goals and challenge progress, transactional default shelves, durable custom-shelf creation and atomic progress/XP updates. Goal milestones commit with their notifications and use bounded cursor batches. Catalog search persists validated provider metadata before returning local book IDs; ISBN identities deduplicate competing imports. Shelf contents use `(added_at,id)` cursors. Native first-factor POSTs use `X-Liravo-Client: native` without cookies, Origin or browser fetch headers; their responses set no session/CSRF cookies. Subsequent requests use Bearer tokens. Browser requests retain CSRF protection. Mobile account changes clear query caches and serialize secure token storage.

Migration 046 validates AI taste profiles and seven-day writing plans before storage, checks current premium access (and the Newbie Writer role for plans), and restricts Supabase reads accordingly. Legacy unvalidated text is retained but must be regenerated before display. Fresh profiles are reused for 24 hours only when reading data, locale, models and policy match; writes recheck the source transactionally. Both cron jobs use two concurrent users, a 35-second scheduling deadline and a persistent cursor. Missing/invalid provider output returns an error rather than canned success. Configure `DEEPSEEK_API_KEY` and/or `GEMINI_API_KEY` for generation. `GET/POST /api/ai/taste-profile` and `/api/write/plan` serve the matching web/native views. Profile updates now accept validated partial onboarding/preferences, commit atomically and return the sanitized user object expected by native clients.

Migration 047 persists verified checkout session IDs with their URLs and queues missed-payment recovery. Outbox drain verifies Paystack references and Dodo sessions/payments, reuses the webhook capture ledger, and pages recurring Dodo payments. Leases, backoff and binding/amount quarantine prevent duplicate credit; failed work appears as `unreconciledCheckouts`. Payment status pages offer an authenticated POST check. Legacy Dodo URLs without a saved session ID need provider-verified reconciliation; do not infer IDs from URLs. Frequent recovery requires the external outbox schedule described above. Promoted listings remain manually activated: create/update/delete intents commit with audits, visible clicks count once per intent, and both placements use current dates. The old promotion shared-secret hook now delegates to native provider verification and never grants arbitrary activation or notifications. Paid-promotion automation remains a later phase.

Migration 048 adds paid tickets with immutable price/organizer snapshots, 20-minute capacity reservations, verified settlement and proportional refunds. NGN uses Paystack; USD/EUR use a fixed-price Dodo product per ticket. No ticket, host revenue or referral credit is granted before capture. Late/full-capacity, wrong-amount and duplicate ticket payments are recorded without credit and queued for return. Outbox drain submits refunds once, polls verified refund IDs and retains lost acknowledgements for reconciliation. The admin dashboard accepts provider refund IDs and verifies them before committing audited recovery; never blindly resubmit an unknown refund. Old confirmed tickets and unverified event revenue remain held for verified reconciliation. `unresolvedPaymentReturns` and `legacyEventTickets` join integrity alerts. Web/native event screens share the English/French/German catalogs; native ICU messages use `intl-messageformat`.

Migration 049 records verified tip/subscription amount or currency mismatches without granting benefits and queues their return. Receipt and premium pages show captured, refunded and remaining amounts by currency; quarantined checkouts cannot reopen. Dodo capture verification reads authoritative payment totals and tax before settlement.

Migrations 051–052 make buddy chapter/note updates atomic and reject replies outside their group. Legacy foreign reply links are detached without deleting notes. The shared visibility function also removes recursive buddy RLS policies; open listings exclude private groups. Goodreads import accepts web CSV uploads and native JSON (`csv`), up to 2 MB/2,000 rows. One transaction commits catalog identities, shelf counts and the replay receipt; retry the same file/key after failure. Goodreads IDs retain their own mapping, ISBNs use canonical validation, existing shelf entries stay unchanged and imports award no XP. Malformed CSV fails before writes; rows without a usable source identity are counted as skipped. Conflicting catalog identities require reconciliation rather than title-only matching.

Migrations 053–054 serialize and audit theme, affiliate-store and seasonal-event changes. At most one custom theme is active; safe `:root`/`.dark` overrides support the existing colour variables and `--radius`, without arbitrary CSS or external resources. Seasonal forms use UTC dates and the canonical publication fields. Seeds use private durable identities, repair missing list links and preserve prompt dates across retries; the reserved editor account cannot adopt an unrelated user. Keep seed markers when restoring backups. Three seed ISBNs were corrected; if an old and canonical book both exist, the invalid identity is cleared and `catalog_identity_reconciliation_required` records the IDs for content reconciliation.

Migrations 055–056 route core profile/onboarding changes through the validated API; browser database writes to those fields are denied. Onboarding profile and optional PIN commit together. PIN changes require current proof, and configured PINs protect payout reservations and bank-detail changes. Proof checks use per-account/trusted-IP quotas; the database rechecks the current hash while committing. Payout destination writes now require an idempotency key. Web/native clients retain financial keys across reloads in session storage/SecureStore, exclude PINs from stored intents and automatic retry caches, and clear keys after acknowledged success. PIN state responses expose only whether a PIN is configured.

Migration 057 replaces exposed legacy email tokens with private, hashed, purpose-bound proofs (verification: 24 hours; recovery: one hour). Existing links must be reissued. Current email remains active until POST confirmation; opening a link only displays a confirmation page. Configured PINs protect email changes and enrollment recovery codes, with transaction-time rechecks. Recovery preserves 2FA, invalidates older application grants and provider access issued before the recovery second, and revokes other Supabase refresh sessions. Native recovery opens the web flow. Configure the Mailgun variables above; failed delivery does not change the linked email.

Migration 058 stages avatar uploads until the profile transaction commits. The API accepts JPEG, PNG and static WebP up to 3 MB, bounds decoded pixels, strips metadata and stores a WebP no larger than 512×512. Clients submit the returned `uploadId` as `avatar_upload_id` to the profile API; uploading alone never changes the profile. Supabase avatar writes require the service API; public reads remain available. Outbox drain removes abandoned/expired objects in leased batches of five, preserves referenced images and retries deletion failures. Native builds require the added Expo image manipulator; rebuild the development client after installing dependencies. `S3_CDN_URL` must be the public HTTP(S) asset base without credentials, query or fragment; its origin/path also constrain Next image requests. S3 uploads omit ACL headers by default for ACL-disabled buckets; configure public bucket/CDN reads, or opt into `S3_OBJECT_ACL=public-read` on supporting backends. Per-object S3 deletion errors retain cleanup records for retry.

Migration 059 resolves direct social identities atomically by provider subject before considering a verified email. It rejects unverified-email linking, conflicting identities and ambiguous legacy case variants; changing a recovery email preserves the original Google identity. Telegram payloads use the Login Widget SHA-256/HMAC protocol. Direct sign-up and repeated password failures require hCaptcha when configured; missing provider configuration or verification outages fail closed. Allow `api.hcaptcha.com` for server verification, `hcaptcha.com` and its subdomains for the widget, and `oauth2.googleapis.com` for Google token verification. Fonts are installed dependencies, so builds do not download Google Fonts. Native CAPTCHA uses the hosted `/auth/captcha` bridge with an origin- and nonce-bound response; rebuild the development client after installing Expo Crypto.

Migration 060 records the first want-to-read decision per reader/book, validates review ownership/visibility and commits attribution, counters, XP and badge outbox work together. Existing shelf entries and verified historical XP reserve unattributed decisions; no historical influence is invented. Creator statistics use net tips by currency, and the public influence leaderboard counts unique attributed decisions since Monday 00:00 UTC. Private/banned/deleted creators are excluded without a stale cache. Web/native review buttons send the reviewed source and desired shelf state with durable retry keys.

Migration 061 applies feed privacy before pagination and shares the contract across web/native. Cursors retain PostgreSQL microseconds and source ordering; direct timestamp bindings preserve that precision too. Migration 062 requires authenticated book-link clicks with `bookId`, the returned `linkId` and an idempotency key. Store flags, country and link type come from server data; direct browser inserts are revoked. Links read current store configuration, and disabled/changed links reject new clicks while committed receipts still replay. Audible search links retain their configured tag; optional `AUDIBLE_AFFILIATE_US/FR/DE` values are server-read, with existing `NEXT_PUBLIC_AUDIBLE_AFFILIATE_*` aliases supported.

Migration 063 commits live book-completion XP with owned shelf membership and durable intent receipts. Completion awards 50 XP once per reader/book; existing/imported completion history cannot claim new activity XP. Review conversions queue one 5 XP reward for the reviewer. Daily login remains 3 XP per UTC day. `/api/xp` accepts only `daily_login` and verified `finish_book`; the extra `add_book` claim is removed. Browser shelf writes require the API, and both web/native use the same completion flow.

Migration 064 seeds a private activity-day ledger from retained sessions and derives reading streaks, freeze usage and milestone XP from those dates. The ledger preserves achievements when a book/session is removed; badges use the verified lifetime peak. Session insertion commits its 5 XP and streak together; response replay never creates activity on a new day. Late/out-of-order sessions and legacy outbox delivery recompute the same source history. The migration reconciles existing counters and unsupported streak bonuses with before/after audit records; rehearse a staging snapshot first. Browser session writes require the API, and web session intents survive reloads. Writing streaks retain their existing transaction flow.

Migration 065 separates works from editions and retains legacy book UUIDs, links and history. Apply the complete file transactionally before deploying, then restart app processes. Inspect `book_catalog_audit` for repaired ISBNs, legacy aliases, progress recalculations and provider work resolution. Catalog writes serialize identity changes; shelf/completion operations take a shared catalog lock before actor/book locks. ISBN conflicts fail closed. Work/edition APIs require authentication; provider discovery uses bounded pages and exact ISBN lookup. Goals and completion XP count a known work once, including imported history and deleted source editions; historical XP is retained. Shelf metadata/progress resolve legacy aliases, and private shelf metadata is owner-scoped. Real Google/Open Library calls still require the environment’s configured host access. Migration 066 retains per-field metadata provenance, allows verified providers to correct unverified import fields and recalculates percentages without changing pages or XP. Imports use `import_goodreads_library_v2`; old parser receipts remain replayable during rolling deployment. Unknown languages are `und`, not English.

Migrations 067–068 add shared paginated mood discovery, owned JSON/CSV exports and referral snapshots. Exports retain edition/provider identifiers and progress, reject query failures and use private temporary files on native. Referral totals use awarded XP and refund-adjusted commissions by currency; public rankings exclude private profiles. Rebuild native projects after adding `expo-localization`, `expo-file-system` and `expo-sharing`. Saved account locale overrides device/persisted fallback; signed-out language selection is available.

Migration 069 enforces notification opt-outs at insertion, adds locale-neutral message facts and restricts browser writes to `is_read`. Deploy it before the updated app. Existing notifications are backfilled without changing their legacy message text; web/native render supported messages in the current locale. Owned preferences load from `/api/users/me` and save through `PATCH /api/users/profile`; individual read updates use `PATCH /api/notifications` with `notification_id`. Push reads current recipient preferences/locale before delivery; allow `exp.host` and configured web-push endpoints. Push delivery remains best effort, and live delivery needs provider/device validation. New-release email opt-in is independent of the weekly digest flag.

Migration 070 initializes a new account’s selected language once across email signup, direct social identities and managed OAuth/native sessions. Existing accounts retain their saved language. Clients send `X-Liravo-Preferred-Locale`; web requests fall back to the selected page locale. Explicit language changes use the owned locale transaction and prevent later login initialization from resetting the preference. Apply the migration before deploying the updated authentication handlers.

Migration 071 adds complete visible review statistics with bounded helpfulness cursors and active-account filtering. Review pages return `statistics` and `nextCursor`; native/web can load every page. Community reviews no longer overwrite catalog/provider ratings. Ambiguous legacy review caches are cleared with their prior values retained in `book_catalog_audit`; verified Google refreshes restore catalog scores. Work totals apply the same account visibility filters. Owned/public profiles share earned badge definitions, and structured metadata escapes authored text while retaining valid JSON values.

Migration 072 derives workshop member counts from membership, repairs legacy overcounts and requires API writes for rooms/membership. Web/native use the shared atomic create/join flow, member-only draft/feedback endpoints and bounded cursors. One member can leave one feedback entry per draft. Owned prompt responses and challenge entries return on reopening; native retry records store compact fingerprints and retain legacy receipt keys. Native writing controls and web workshop screens use EN/FR/DE catalogs.

Migration 073 extends the owned writing-progress snapshot with seven complete Monday–Sunday UTC word totals and earned writing badges. Web/native share complete submission totals, the writing streak and feedback counts; API responses are private and uncached. Writing progress/resources use EN/FR/DE. Resource links use `/book/[id]` or an exact-ISBN discovery query; discovery restores the query into the search field. Exact ISBN searches reuse canonical local editions without provider access; external Google results must match the requested ISBN.

Migration 074 replaces untrusted author-book assignments and name matching with staff-approved `author_work_claims`. Deploy it with the updated app: legacy assignments remain private, existing ARC offers are deactivated and post book links are removed with prior values retained in `book_catalog_audit`. Administrators review identity requests and approve/revoke specific works under Admin → Users → Author works. Reapprove legitimate legacy works before creating new offers. Approval follows canonical work merges and every edition; revocation disables affected offers and removes post links. Web/native catalog pages use bounded cursors; analytics count the complete approved catalog. Author profile/analytics, creation forms and staff controls use EN/FR/DE.

Migration 075 adds public writer-question/thread snapshots with active-account filtering, complete answer counts, bounded cursors and a pinned best answer. Deploy with the updated API/web/native clients: use `nextCursor`; numbered pages beyond 1 are rejected. Browser SQL access to these tables is revoked. Only verified authors or members above 1,000 XP can post answers; database guards also validate the target question and selected answer. Reply/best-answer notifications are atomic, follow reply preferences and use EN/FR/DE facts with thread links. Question/answer/best-answer writes retain owned retry keys across reloads.

Migration 076 moves ARC catalogs/application lists to private server snapshots so slot counts include every application across database providers. Reader responses expose only their own application status; owners get complete counts and bounded status-filtered pages. Closed offers remain visible to their participants as history. Inactive readers cannot be approved, final decisions are immutable, and browser SQL access to ARC tables is revoked. Web/native reader/owner/review screens use EN/FR/DE, named controls, owned acknowledgements and durable retry keys. Apply the migration with the updated API and clients.

Migration 077 adds server snapshots for buddy-read catalogs, details and notes. Apply it with the updated API/web/native clients. Catalogs filter membership before pagination; use `scope=mine|open` and `nextCursor`. The legacy response retains separate arrays with `myNextCursor`/`openNextCursor`. Details include canonical edition metadata, title, actual participant count and membership permissions. Notes are participant-only and paged. New joins reject inactive accounts/organizers while retaining existing membership history. EN/FR/DE creation forms select an edition by title/author/ISBN; creation, chapter and note retries retain owned keys across reloads.

Migration 078 adds complete annual reading snapshots shared by stats, Wrapped and public share cards. Deploy with the updated app: stats retain flat API fields and owned responses include `actorId`. Annual book totals count each canonical work once on the completed shelf, using its latest completed edition within the UTC year. Pages use that edition’s page count, falling back to recorded progress; custom shelves are excluded. Maximum streak and lifetime XP remain separate from current streak and annual net ledger XP. Detailed stats require authoritative Premium access. Public cards include only public completed shelves and return errors for unavailable readers/storage. Explicit server locale overrides now take precedence over request preferences; stats/Wrapped/cards and native goals use EN/FR/DE.

Migration 079 adds reading-room catalog/detail/milestone/post snapshots and active-account/organizer guards. Deploy with the updated API/web/native clients. Catalogs accept `scope=public|mine` and `nextCursor`; joined private/ended rooms remain in Mine. Detail rosters use `participantsCursor`/`participantsNextCursor`. Discussions filter `milestone=general|UUID` before pagination; omitted filters retain the all-unlocked view. Milestones include complete totals/post counts and server unlock flags. Direct browser writes are revoked; owned post/milestone receipts still acknowledge prior commits after closure. Room creation preserves optional books and adds edition search; scheduling inputs use UTC. Web/native screens use EN/FR/DE and closed discussions remain read-only. Invitation management remains planned.

Content-form clients now use owned review/quote/shelf/verification receipts and durable retry keys. Native review/quote forms load the selected edition; verification sends `pen_name`, `book_titles`, optional `publisher`, `website_url` and `social_proof_url`. Proof URLs require HTTP(S); submission does not approve identity or work ownership. Quote pages accept positive whole numbers through PostgreSQL integer maximum 2147483647. Review/quote APIs reject content with no visible text after sanitization. No additional migration is required beyond 079.
