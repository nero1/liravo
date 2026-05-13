# Liravo — How It Works

A technical and operational guide covering every feature, system, and architecture decision in Liravo.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Authentication and Sessions](#authentication-and-sessions)
3. [User Profiles and Personas](#user-profiles-and-personas)
4. [Book Catalogue System](#book-catalogue-system)
5. [Shelf and Reading Tracker](#shelf-and-reading-tracker)
6. [Affiliate Link System](#affiliate-link-system)
7. [Feature Flags](#feature-flags)
8. [Caching Architecture](#caching-architecture)
9. [AI Layer](#ai-layer)
10. [Gamification System](#gamification-system)
11. [Moderation Architecture](#moderation-architecture)
12. [Payment Flows](#payment-flows)
13. [Referral System](#referral-system)
14. [Cron Job Schedule](#cron-job-schedule)
15. [Security Architecture](#security-architecture)
16. [Database Schema Overview](#database-schema-overview)
17. [Admin Panel](#admin-panel)
18. [i18n Architecture](#i18n-architecture)
19. [How to Add New Things](#how-to-add-new-things)

---

## Architecture Overview

Liravo is a Next.js 14 App Router application. All pages are React Server Components by default. Client interactivity uses `'use client'` components at the leaf level.

```
Request → Vercel Edge → Next.js Server → Supabase (DB + Auth) / Redis (Cache)
                                      → External APIs (Google Books, DeepSeek, Gemini)
```

Key principles:
- Server-side rendering for all public and SEO-critical pages
- Client components only where interactivity is required
- Redis cache in front of all expensive DB reads
- All AI is pre-computed where possible (nightly cron)

---

## Authentication and Sessions

### Providers
- Google OAuth via Supabase Auth
- Telegram OAuth via Supabase Auth
- Admin can disable either provider via the feature flags system

### Session Flow
1. User clicks "Continue with Google/Telegram"
2. Supabase Auth handles the OAuth redirect
3. On callback, `src/app/api/auth/callback/route.ts` exchanges the code for a session
4. If the user is new, they are redirected to `/onboarding`
5. Supabase manages JWT tokens in httpOnly cookies

### Onboarding
Three-step flow:
1. Username and display name
2. User type selection (reader, author, newbie writer, creator)
3. Genre selection (minimum 5)

On completion, the user's `onboarding_complete` flag is set to true and default shelves are created.

### Post-Onboarding Security Hardening
Users are periodically prompted (non-blocking) to:
- Add an email for recovery
- Set a password
- Enable 2FA (authenticator app — no SMS)
- Set a 4-digit PIN for sensitive operations

Prompts appear on day 7 and day 30 if not completed.

---

## User Profiles and Personas

Every user has one or more types: Reader, Author, Newbie Writer, Creator. This drives feature access and home feed composition.

### Profile Fields
- Avatar, banner image
- Display name, username, bio (280 chars max)
- Country (ISO code, shown at country level only)
- Up to 3 external links
- XP, level title, reading streak
- Verified Author badge (admin-granted)
- Creator badge (platform-assigned at threshold)

### Privacy
- `profile_visibility`: `public` (default) or `followers_only`
- `shelf_visibility`: independent of profile visibility

---

## Book Catalogue System

### Data Sources (priority order)
1. Local Supabase database (first source checked)
2. Google Books API (primary external)
3. Open Library API (fallback)

On first lookup, metadata is saved locally. Subsequent requests never hit the external API.

### Full-text Search
Books have a `search_vector` tsvector column auto-updated by a PostgreSQL trigger. Searches query this column for fast results.

### Book Pages
Each book has:
- Metadata (cover, title, author, publisher, year, ISBN, genres)
- Rating and rating distribution
- Community reviews
- Community quotes
- Reading counts (currently reading, want to read, have read)
- Affiliate buy links
- Similar books (AI-computed nightly, Phase 3+)
- JSON-LD `Book` schema for SEO

---

## Shelf and Reading Tracker

### Default Shelves
Every user gets three default shelves on onboarding:
- Currently Reading
- Have Read
- Want to Read

### Custom Shelves
Free tier: up to 10 custom shelves. Premium: unlimited.

### Reading Progress
Tracked per `shelf_books` row. Users log progress by page or percentage. Progress sessions are used for XP calculation and streak tracking.

---

## Affiliate Link System

### Link Priority Logic
For each book page, the server queries `affiliate_stores` filtered by the user's country, sorted by `priority` (ascending). Links are presented:

1. **Amazon affiliate** (priority 1) — shown as primary CTA "Buy on Amazon"
2. **Audible affiliate** — "Listen on Audible" if audiobook available
3. **Other affiliate stores** — from the registry, by priority
4. **Non-affiliate external links** — Project Gutenberg, WorldCat, etc. `rel="nofollow noopener"`
5. **No link** — "Check your local library" + WorldCat search

### Affiliate Store Registry
Admin-managed via the `affiliate_stores` table. Fields:
- `name`, `countries[]`, `url_template`, `affiliate_tag`, `priority`, `is_active`, `is_non_affiliate`

URL template uses `{isbn}` and `{tag}` placeholders. No code deployment needed to add a new store.

### Click Tracking
Every affiliate link click is logged to `affiliate_link_clicks` with a hashed user ID. Admin can view top-clicked books and non-affiliate click patterns to prioritise new affiliate partnerships.

---

## Feature Flags

Stored in the `feature_flags` table. Cached in Redis with a 60-second TTL.

```typescript
const enabled = await getFeatureFlag(FEATURE_FLAGS.GOOGLE_AUTH);
```

Admin can toggle flags in the admin panel without a code deployment. Cache invalidated immediately on toggle. All flag names are defined as constants in `src/constants/config.ts`.

---

## Caching Architecture

| Data | Redis Key Pattern | TTL |
|---|---|---|
| Book metadata | `book:{id}` | 24 hours |
| User feed | `feed:{user_id}:cursor:{cursor}` | 5 minutes |
| Leaderboards | `leaderboard:{type}` | 1 hour |
| Affiliate links | `affiliate_link:{book_id}:{country}` | 24 hours |
| Feature flags | `feature_flag:{name}` | 60 seconds |
| Auth rate limit | `ratelimit:auth:{ip}` | 15 minutes |

### Cache Invalidation
- Book updated → `book:{id}` deleted
- Feature flag toggled → `feature_flag:{name}` deleted
- Feed write → `feed:{user_id}:*` deleted

### Stampede Prevention
Set using Redis `SET NX EX` (setNx). Only one request regenerates while others short-circuit.

---

## AI Layer

### Provider Architecture
All AI calls go through `src/services/ai.ts`:
1. Try DeepSeek first (8-second timeout)
2. Fall back to Gemini if DeepSeek fails
3. Circuit breaker: 3 DeepSeek failures in 5 minutes → route to Gemini for 10 minutes

### Model Configuration
All model names are in `src/constants/ai.ts`. No model string appears elsewhere. Update one file to change models globally.

### AI Features
| Feature | Trigger | Tier |
|---|---|---|
| Mood-based book discovery | User query | Free |
| Platform writing prompts | Nightly cron | Platform |
| Personalised writing challenges | Nightly cron | Paid |
| AI writing feedback | On submit | Paid |
| AI taste profile | On demand | Paid |
| Similar books | Nightly cron | Free (pre-computed) |
| Review tone screening | On review submit | Platform (on-device) |

### On-Device AI
Transformers.js or ONNX Runtime Web. Used for:
- Review tone pre-screening (MobileBERT/DistilBERT)
- Offline mood-to-genre mapping

Target: 2–4 GB RAM devices. Model cap: 50 MB.

---

## Gamification System

### XP Actions
See `src/constants/config.ts` for the full `XP_CONFIG` map.

### Level Titles
```
0–499:      Page Turner
500–1,499:  Bookmarked
1,500–3,999: Chapter Chaser
4,000–7,999: Spine Cracker
8,000–14,999: Literary Nomad
15,000–24,999: Wordsmith
25,000–49,999: Bibliophile
50,000+:    Legend of the Shelf
```

### Streaks
- Increments when a reading session is logged on that day
- Freeze tokens: 1 at 7-day milestone, 1 more at 30-day
- Auto-consumed on a missed day

### Badges
Categories: Reading milestones, Genre badges, Social badges, Writing badges, Speed badges, Seasonal badges, Referral badges.

### Leaderboards
Refreshed nightly via cron. Scoped: global, national, friend circle.

---

## Moderation Architecture

### Tier 1 — Community
- Report button on all UGC
- 5 reports (configurable) → auto-hidden pending moderator review

### Tier 2 — Moderators
- Can: approve, edit, remove, warn, escalate
- Cannot: ban, grant roles, access financial data

### Tier 3 — Admin
- Handles escalations, bans, role management

### Community Notes (admin-toggleable)
Eligible users (50+ reviews, account 30+ days, no warnings) can add contextual notes. Notes become public when they reach a helpfulness threshold from peer ratings.

### Automated Moderation
- On-device tone classifier on every review submit
- Spam detection: near-identical content rejected
- Link spam: external links checked against blocklist

---

## Payment Flows

### Tips
1. User clicks tip button (creator/author with 500+ followers)
2. Dodopayments (global) or Paystack (Nigeria) processes payment
3. Webhook confirms payment
4. Platform records: 90% to creator, 10% platform fee
5. If creator was referred: 10% of platform fee to referrer
6. All calculations via Decimal.js

### Premium Subscription
1. User visits `/premium` and clicks an upgrade button (Dodopayments for global, Paystack for Nigeria)
2. POST to `/api/subscriptions/create` with `{ provider, currency }` creates a `pending` subscription record and returns a checkout URL
3. User completes payment on the provider's hosted checkout page
4. Provider calls `/api/subscriptions/webhook` with `x-payment-provider` and `x-webhook-secret` headers
5. On `subscription.activated`: `is_premium: true` set on `users` table, subscription status updated to `active`
6. On `subscription.cancelled`: `is_premium: false`, subscription status set to `cancelled`
7. User can cancel anytime via POST `/api/subscriptions/cancel`

### Premium Features Unlocked
- Unlimited custom shelves (free tier: 10)
- Reading statistics dashboard (`/stats`)
- AI taste profile (`/taste-profile`)
- AI writing feedback and plans
- Weekly email digests
- Premium badge on profile

### Promoted Listings
Previously: Admin manually activated after payment confirmation.
Phase 7: Fully automated via webhook at `/api/webhooks/promoted-listings`.
- Payment provider sends `{ event: 'payment.completed', listing_id, user_id }` with webhook secret
- System sets `status: 'active'`, `start_date: now`, `end_date: now + 30 days`
- User receives an in-app notification

### Earnings Dashboard
Every user (not just creators) has an `/earnings` page showing:
- **Tips received**: Sum of `creator_amount` from completed tips
- **Referral commissions**: 10% of platform's gross from referred users' paid transactions, stored in `referral_commissions` table
- **Event revenue**: Organiser cut from paid events/workshops

### Payout Flow
1. User visits `/earnings` and clicks "Request Payout"
2. POST to `/api/earnings/request-payout` creates a `payout_requests` record with `status: 'pending'`
3. Admin processes payouts manually via the admin panel or automated scripts
4. Minimum payout: $10.00 (enforced in UI; future: enforce server-side)
5. Paid via Dodopayments (global) or Paystack (Nigeria)

### Referral Commission Accounting
- Referral code is a 12-digit numeric string stored on `users.referral_code`
- When a referred user (`referred_by` FK) completes a paid transaction:
  1. Platform takes its gross cut (10% of tips, 100% of subscription revenue)
  2. 10% of that gross cut is credited to the referrer's `referral_commissions` balance
  3. The commission is inserted atomically with the parent transaction
- Commissions are non-reversible unless the parent transaction is refunded

---

## Referral System

### Referral Code Format
12-digit numeric code (no username, no PII). Generated at account creation. Stored in `users.referral_code`.

**URL format**: `https://liravo.org/join?ref=471370973642`

### Attribution
`referred_by` foreign key stored on the referred user's profile. "Brought to Liravo by [username]" shown on public profile (toggleable by the user).

### Commission
10% of the platform's gross take on all paid transactions from referred users. Credited to `referral_commissions` table. Atomic with the parent transaction. Non-reversible unless parent transaction refunded.

### Referral Badges
- Connector: 10 referrals
- Ambassador: 50 referrals
- Liravo Builder: 200 referrals

---

## Cron Job Schedule

| Job | Schedule | Service | Purpose |
|---|---|---|---|
| Feed pre-compute | Every 5 min | cron-job.org | Refresh active user feeds |
| Leaderboard refresh | Every hour | cron-job.org | Update leaderboard snapshots |
| Daily streak check | 00:00 UTC | Vercel Cron | Process streak freezes and XP |
| Shelf recommendations | Nightly 02:00 | cron-job.org | AI shelf recommendations |
| Leaderboard snapshot | Sunday 03:00 | cron-job.org | Save weekly leaderboard snapshot |
| Prompt generation | Sunday 02:00 | cron-job.org | AI-generate 7 days of writing prompts |
| AI writing plans | Monday 04:00 | cron-job.org | Personalised plans for premium users |
| Affiliate health | Nightly 03:00 | cron-job.org | Validate top 500 book links, flag gaps |
| Taste profiles | Daily 05:00 | cron-job.org | Refresh stale AI taste profiles (max 50/run) |
| Email digest | Friday 09:00 | cron-job.org | Weekly reading digest emails |
| Monthly Wrapped | Dec 1 | cron-job.org | Generate Reading Wrapped data |
| DB pruning | 04:00 UTC | cron-job.org | Clear old notifications, stale caches |

All external cron jobs hit `/api/cron/{name}` with `x-cron-secret: $CRON_SECRET` header.

---

## Security Architecture

### Auth
- Supabase Auth manages JWT tokens
- `is_admin` checked against DB on every admin route (never trusted from session)
- 4-digit PIN stored bcrypt-hashed (cost 12)
- 2FA via TOTP (authenticator apps) — no SMS

### Rate Limiting
Redis sliding window. Auth routes: 5 attempts per 15 minutes, 30-minute lockout.

### Input Validation
All inputs validated server-side with Zod. User HTML (long reviews, bio) sanitised with DOMPurify. `dangerouslySetInnerHTML` is never used.

### Row Level Security
All Supabase tables have RLS enabled. Default deny. Explicit allow policies. Service role key used only server-side.

### CSRF
SameSite=Strict cookies. CSRF token on state-changing API routes.

### Security Headers
Set in `next.config.mjs`: HSTS, X-Frame-Options, X-Content-Type-Options, CSP.

---

## Database Schema Overview

Key tables and relationships:

```
auth.users (Supabase)
  └── users (profile, XP, settings)
        ├── shelves (default + custom)
        │     └── shelf_books (reading tracker)
        ├── reviews (+ book ratings)
        ├── quotes
        ├── follows (follower/following pairs)
        └── notifications

books
  ├── reviews (community reviews)
  ├── quotes
  ├── shelf_books (reading lists)
  └── affiliate_link_clicks (tracking)

feature_flags (admin-managed)
affiliate_stores (admin-managed, extensible)
content_reports (moderation queue)
security_events (audit log)
```

---

## Admin Panel

Accessible at `/admin`. `is_admin` verified against DB on every request (never trusted from session).

### Dashboard (`/admin`)
Stats cards: total users, books, reviews, reports pending, revenue this month (tips + subscriptions).
Quick links to all admin sections.

### User Management (`/admin/users`)
- Paginated table: username, email, user types, is_premium, is_moderator, is_admin, created_at
- Search by username
- Per-row actions: Grant/Revoke Moderator, Grant/Revoke Premium, Suspend/Unsuspend
- API: `GET /api/admin/users` (paginated, searchable), `PATCH /api/admin/users` (update user flags)
- Uses service role key to bypass RLS

### Book Management (`/admin/books`)
- Top 100 books by have-read count with cover, title, author, source ID, affiliate click count
- "Refresh Links" button triggers affiliate link regeneration per book

### Feature Flags (`/admin/feature-flags`)
- Lists all feature flags from DB: name, enabled toggle, description, last updated
- Toggle: updates DB + immediately deletes Redis cache key (`feature_flag:{name}`)
- API: `GET /api/admin/feature-flags`, `PATCH /api/admin/feature-flags`

### Affiliate Store Registry (`/admin/affiliate-stores`)
- CRUD for affiliate stores: name, countries, URL template, affiliate tag, priority, active, non-affiliate
- Add new store inline, edit existing store inline
- API: `GET`, `POST`, `PATCH /api/admin/affiliate-stores`

### Seed Content (`/admin/seed`)
- Create the `@liravo_editors` system account (idempotent — returns 409 if exists)
- Trigger weekly writing prompt generation
- API: `POST /api/admin/seed/editors-account`

### Reports, Promoted Listings, Seasonal Events
- Moderation queue with approve/remove/warn/escalate actions
- Promote/deactivate listings, view CTR
- Create/manage community events

### Affiliate Health Monitoring
Nightly cron (`/api/cron/affiliate-health`) checks top 500 books:
- Flags books with zero affiliate clicks to `affiliate_health_log` table
- Report: `{ checked: N, flagged: M }`
- Helps prioritise affiliate partnership outreach for popular books

---

## i18n Architecture

Uses `next-intl`. All strings in `messages/{locale}.json`. No hardcoded English strings in components.

Default locale: `en`. Supported: `en`, `fr`, `de`.

### Adding a New Locale
1. Create `messages/{locale}.json` with all keys from `messages/en.json`
2. Add the locale code to `locales` array in `src/i18n.ts`
3. Add affiliate store rows to `affiliate_stores` table for the new country (via admin panel or migration)
4. If the locale is RTL (Arabic, Hebrew, Farsi), add to `RTL_LOCALES` in `src/lib/rtl.ts` — the `<html dir>` attribute is set automatically

### Adding a New Amazon Affiliate Region
1. Log in to the Admin Panel → Affiliate & Revenue → Add Store
2. Set `name` to "Amazon {Country}", `country` to the ISO code (e.g., `JP`), `url_template` to the region's Amazon search URL with `{isbn}` and `{tag}` placeholders, `affiliate_tag` to your Amazon Associates tag for that region, `priority` to `1`, `is_active` to `true`
3. The `/api/affiliate-tags?country=XX` endpoint is cached in Redis for 1 hour and will serve the new tag automatically

### Locale-Aware Affiliate Routing
`buildAffiliateLinks` in `src/services/books.ts` accepts an optional `locale` parameter. The locale is mapped to a country code (`fr` → `FR`, `de` → `DE`, `en` → `US`). This country code is used to filter the `affiliate_stores` table so the correct regional links are shown to each user.

The standalone `/api/affiliate-tags?country=US|UK|CA|AU|FR|DE` endpoint returns the affiliate tag for that country's primary Amazon store, cached in Redis for 1 hour.

### Audible Regional CTA System
`<AudibleCTA locale="en|fr|de" bookTitle="..." />` is a client component that:
- Builds the correct regional Audible URL: `audible.com` (US), `audible.fr` (FR), `audible.de` (DE)
- Appends the affiliate tag from the appropriate `NEXT_PUBLIC_AUDIBLE_AFFILIATE_{REGION}` env var
- Logs clicks via `POST /api/books/click` with `{ store: 'audible', locale }`
- Renders as an amber CTA button with a headphone icon

To add a new Audible region: add the env var `NEXT_PUBLIC_AUDIBLE_AFFILIATE_{REGION}` and extend the `getAudibleUrl` function in `src/components/books/AudibleCTA.tsx`.

### RTL Support Roadmap
RTL utilities live in `src/lib/rtl.ts`:
- `RTL_LOCALES`: tuple of RTL locale codes (`ar`, `he`, `fa`)
- `isRTL(locale)`: returns true if the locale is in `RTL_LOCALES`
- `getDirection(locale)`: returns `'rtl'` or `'ltr'`

The root layout (`src/app/layout.tsx`) already passes `dir={getDirection(locale)}` to the `<html>` element. To activate Arabic or Hebrew:
1. Add the locale to `src/i18n.ts`
2. Create `messages/ar.json` (or `he.json`)
3. The `dir="rtl"` attribute is applied automatically — no layout changes needed
4. Review component-level spacing: use logical CSS properties (`ps`, `pe`, `ms`, `me`) via Tailwind's `rtl:` variant or Tailwind v3 logical-properties utilities

### Locale Preference Storage
Users can switch locale via the `<LocaleSwitcher />` component in the sidebar. On selection:
1. `PUT /api/users/locale` saves `preferred_locale` to the `users` table
2. `router.refresh()` reloads the page so next-intl picks up the new locale from the request context

### Logical CSS Properties
All components use `margin-inline-start` (not `margin-left`) etc. to support future RTL expansion.

---

## How to Add New Things

### New Feature Flag
1. Add the constant to `FEATURE_FLAGS` in `src/constants/config.ts`
2. Insert a row into `feature_flags` table in the migration or admin panel
3. Check it in server code with `getFeatureFlag(FEATURE_FLAGS.YOUR_FLAG)`

### New Affiliate Store
1. In Admin Panel → Affiliate & Revenue → Add Store
2. Set: name, countries, URL template (`{isbn}`, `{tag}` placeholders), affiliate tag, priority
3. Cache invalidated automatically

### New Badge Type
1. Add the badge name to the relevant category in the gamification config
2. Add the awarding logic (trigger: action → check threshold → insert badge)
3. The badge appears automatically on the user's profile

### New Theme
1. In Admin Panel → Theme → Upload Theme
2. Upload a CSS file with `:root` custom property overrides
3. Activate the theme — it's stored in the DB and served via a `/api/theme.css` route

### New Cron Job
1. Create `src/app/api/cron/{name}/route.ts`
2. Validate `x-cron-secret` header at the top
3. Register the job on cron-job.org with the full URL and header
4. Document it in SETUP.md cron table

---

*End of HOW-IT-WORKS.md*
