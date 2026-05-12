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
1. User initiates via Dodopayments
2. Webhook confirms subscription start
3. Feature gates unlocked immediately

### Promoted Listings
Phase 1: Admin manually activates after payment.
Phase 7: Webhook triggers automatic activation.

### Payouts
User initiates withdrawal from earnings dashboard once balance ≥ $10. Processed via Dodopayments or Paystack.

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
| Weekly prompts | Sunday 02:00 | cron-job.org | AI-generate writing prompts |
| Monthly Wrapped | Dec 1 | cron-job.org | Generate Reading Wrapped data |
| Affiliate health | 03:00 UTC | cron-job.org | Validate top 500 book links |
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

Accessible at `/admin`. `is_admin` verified against DB on every request.

Sections:
- **Dashboard**: DAU/WAU/MAU, revenue summary, affiliate clicks, system health
- **User Management**: search, suspend, ban, grant roles
- **Moderation Queue**: flagged content, moderator actions
- **Auth Providers**: toggle Google/Telegram on/off
- **Book Catalogue**: add/edit books, manage affiliate links
- **Promoted Listings**: activate/deactivate, view CTR stats
- **Seasonal Events**: create and manage community events
- **Writing Challenges**: manage prompts and challenges
- **Theme Configuration**: light/dark/custom themes
- **Feature Flags**: toggle features without deployment
- **Affiliate & Revenue**: store registry, country tags, click reports
- **System & Cron Status**: last run times, manual triggers

---

## i18n Architecture

Uses `next-intl`. All strings in `messages/{locale}.json`. No hardcoded English strings in components.

Default locale: `en-US`. Phase 2: French, German.

### Adding a New Locale
1. Create `messages/{locale}.json` with all keys
2. Add the locale to `src/i18n.ts`
3. Update `affiliate_tags` table for the new country's Amazon tag

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
