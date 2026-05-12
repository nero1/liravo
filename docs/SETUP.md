# Liravo — Setup Guide

This document covers everything a developer needs to go from zero to a running Liravo instance.

---

## 1. Project Overview

Liravo is a Next.js 14 (App Router) social book discovery platform. The stack:

- **Frontend**: Next.js 14, TypeScript, Tailwind CSS
- **Database**: Supabase (PostgreSQL + Auth + Storage)
- **Cache**: Redis via ioredis or Upstash (configured by env var)
- **Deployment**: Vercel (Hobby Plan for MVP)
- **AI**: DeepSeek (primary), Gemini (fallback)
- **Payments**: Paystack + Dodopayments

---

## 2. Environment Variables

Copy `.env.local.example` to `.env.local` and fill in the values.

### Supabase
| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL (from Project Settings → API) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon/public key (Project Settings → API) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key — **never expose to client** |

### Redis
| Variable | Description |
|---|---|
| `REDIS_PROVIDER` | `upstash` or `ioredis` |
| `UPSTASH_REDIS_REST_URL` | Upstash REST URL (if using Upstash) |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash token (if using Upstash) |
| `REDIS_URL` | Redis connection string (if using ioredis, e.g. `redis://localhost:6379`) |

### Auth
| Variable | Description |
|---|---|
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Google OAuth Client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth Client Secret |
| `TELEGRAM_BOT_TOKEN` | Your Telegram bot token from BotFather |

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

## 3. Supabase Setup

1. Create a new Supabase project at [supabase.com](https://supabase.com).
2. In Project Settings → API, copy the URL and keys into `.env.local`.
3. In the SQL Editor, run the migration file: `supabase/migrations/001_initial_schema.sql`.
4. In Authentication → Providers, enable:
   - **Google**: add your Google OAuth credentials (see Section 5).
   - **Telegram**: add your Telegram bot token (see Section 6).
5. In Storage, create a bucket named `avatars` with public read access.
6. RLS is automatically configured by the migration. Default deny. Allow policies are explicit.

---

## 4. Redis Setup

### Option A: Upstash (recommended for Vercel)
1. Create a free account at [upstash.com](https://upstash.com).
2. Create a Redis database.
3. Copy the REST URL and token into your env vars.
4. Set `REDIS_PROVIDER=upstash`.

### Option B: ioredis (self-hosted)
1. Deploy Redis on [Railway](https://railway.app) or [Render](https://render.com) (both have free tiers).
2. Copy the Redis connection string.
3. Set `REDIS_PROVIDER=ioredis` and `REDIS_URL=redis://...`.

---

## 5. Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com).
2. Create a new project or select existing.
3. Enable **Google People API** and **Google OAuth 2.0**.
4. In APIs & Services → Credentials → Create Credentials → OAuth client ID.
5. Application type: **Web application**.
6. Authorised redirect URIs: `https://your-project.supabase.co/auth/v1/callback`.
7. Copy Client ID and Client Secret into Supabase Auth → Google provider.
8. Set `NEXT_PUBLIC_GOOGLE_CLIENT_ID` in your env.

---

## 6. Telegram OAuth Setup

1. Open Telegram and message [@BotFather](https://t.me/BotFather).
2. Send `/newbot`, follow prompts to name your bot.
3. Copy the bot token.
4. In Supabase Auth → Telegram provider, paste the token.
5. Set `TELEGRAM_BOT_TOKEN` in your env.

---

## 7. Amazon Associates Setup

1. Apply at [affiliate-program.amazon.com](https://affiliate-program.amazon.com) (US) and the regional equivalent for each market.
2. The **3-qualifying-sale requirement**: Amazon requires 3 qualifying sales within 180 days for full PA API access. Until then, use the static affiliate link fallback (Amazon search URL + tag). The affiliate store registry handles this automatically.
3. Once PA API access is approved, update the `affiliate_stores` table with dynamic link templates.
4. For each country, note your affiliate tag and set the environment variables.

---

## 8. Paystack Setup

1. Create an account at [paystack.com](https://paystack.com).
2. In Settings → API Keys & Webhooks, copy your secret and public keys.
3. Configure a webhook URL: `https://liravo.org/api/webhooks/paystack`.
4. Copy the webhook secret and set `PAYSTACK_WEBHOOK_SECRET` (add this to your env).

---

## 9. Dodopayments Setup

1. Create an account at [dodopayments.com](https://dodopayments.com).
2. Copy the secret key.
3. Set up a webhook endpoint: `https://liravo.org/api/webhooks/dodopayments`.
4. Copy the webhook signing secret.

---

## 10. Vercel Deployment

1. Fork or push the repository to GitHub.
2. Import the project on [Vercel](https://vercel.com).
3. In the Vercel project settings, add all environment variables from `.env.local.example`.
4. Connect your custom domain `liravo.org` in Vercel → Domains.
5. Supabase redirect URI for OAuth must be updated to the production domain.

---

## 11. Cron Job Setup (cron-job.org)

Vercel Hobby Plan allows only 1 cron trigger per day. Sub-daily jobs use [cron-job.org](https://cron-job.org) to call protected Next.js API routes.

**All cron endpoints require the `x-cron-secret` header matching `CRON_SECRET`.**

| Job | Endpoint | Schedule | Purpose |
|---|---|---|---|
| Feed pre-compute | `/api/cron/feed` | Every 5 min | Refresh active user feeds |
| Leaderboard refresh | `/api/cron/leaderboards` | Every hour | Update leaderboard data |
| Streak check | `/api/cron/streaks` | Daily (midnight UTC) | Process streak freezes |
| Prompt generation | `/api/cron/prompts` | Weekly | Pre-generate writing prompts |
| Affiliate health | `/api/cron/affiliate-health` | Daily | Validate top 500 book links |

---

## 12. Secret Rotation Runbook

### JWT / Session Secret
Supabase manages JWT signing. To rotate: Supabase Dashboard → Settings → API → JWT Secret → Regenerate. All active sessions will be invalidated. Users must sign in again.

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

---

## 13. Backup and Restoration

### Supabase Backups
- Supabase Pro includes Point-in-Time Recovery (PITR). Enable in Project Settings → Backups.
- Free tier: daily backups only.
- To restore: Supabase Dashboard → Backups → Select backup → Restore.

### Manual Backup
```bash
pg_dump postgresql://postgres:[password]@[host]:5432/postgres > backup.sql
```

### Restoration
```bash
psql postgresql://postgres:[password]@[host]:5432/postgres < backup.sql
```

---

## 14. Deployment and Rollback

### Deploy
Push to `main` branch. GitHub Actions builds and validates. Vercel auto-deploys on merge.

### Rollback
In Vercel → Deployments, select a previous deployment → Promote to Production.

### Database Migration Rollback
Each migration file should have a corresponding rollback. Run the rollback SQL manually in the Supabase SQL editor.

---

## 15. Database Seeding

Run the seed script after running migrations:

```bash
npm run seed
```

This creates:
- The `@liravo` Liravo Editors system account
- Default affiliate stores (Amazon US, UK, CA, AU)
- Default feature flags
- Initial writing prompts (60 days)

---

## 16. Secrets That Must Never Be Committed

- `SUPABASE_SERVICE_ROLE_KEY`
- `GOOGLE_CLIENT_SECRET`
- `TELEGRAM_BOT_TOKEN`
- `PAYSTACK_SECRET_KEY`
- `DODOPAYMENTS_SECRET_KEY`
- `DEEPSEEK_API_KEY`
- `GEMINI_API_KEY`
- `CRON_SECRET`
- `RESEND_API_KEY`
- Any `*_WEBHOOK_SECRET`

The `.gitignore` excludes `.env.local`. Never commit `.env` files with real values.
