# Liravo — Product Requirements Document (PRD)
**Version:** 1.1  
**Status:** Draft for Developer  
**URL:** liravo.org  
**Last Updated:** 1 June 2026

---

## Table of Contents

1. [Product Overview](#1-product-overview)
2. [Target Audience](#2-target-audience)
3. [User Personas](#3-user-personas)
4. [Core Architecture Philosophy](#4-core-architecture-philosophy)
5. [Technical Stack](#5-technical-stack)
6. [Platform and Device Support](#6-platform-and-device-support)
7. [Feature Specifications](#7-feature-specifications)
8. [Monetisation Architecture](#8-monetisation-architecture)
9. [Gamification System](#9-gamification-system)
10. [Virality and Shareability](#10-virality-and-shareability)
11. [AI Layer](#11-ai-layer)
12. [Moderation Architecture](#12-moderation-architecture)
13. [Admin Panel](#13-admin-panel)
14. [Seed Content Strategy](#14-seed-content-strategy)
15. [Security Requirements](#15-security-requirements)
16. [Performance and Scalability](#16-performance-and-scalability)
17. [Internationalisation (i18n)](#17-internationalisation-i18n)
18. [UI and Design System](#18-ui-and-design-system)
19. [SEO Requirements](#19-seo-requirements)
20. [Testing Requirements](#20-testing-requirements)
21. [MVP Build Sequence](#21-mvp-build-sequence)
22. [Documentation Requirements](#22-documentation-requirements)
23. [Known Constraints and Mitigations](#23-known-constraints-and-mitigations)

---

## 1. Product Overview

**Liravo** (liravo.org) is a global book discovery and recommendation social network. It serves readers, professional authors, emerging writers, newbie writers, and book content creators. Every interaction on the platform is designed to drive affiliate-linked book discovery and Audible plan signups via the Amazon Associates program.

A book on Liravo is not just a thing to read. It is a social object. A review, a shelf addition, a quote card, a challenge completion, or a writing prompt response all resolve to a book title with an affiliate link attached.

**Core value propositions:**

- For readers: Discover books through people whose taste you trust, not algorithms you cannot see.
- For authors: Build a direct reader community and promote titles in an environment built for books.
- For newbie writers: Find community, structured challenges, craft resources, and feedback in a dedicated writing growth track.
- For creators: Publish book content, grow a following, and earn when readers act on your recommendations.

---

## 2. Target Audience

### Geographic Priority

**Tier 1 (launch markets):** United States, Canada, United Kingdom  
**Tier 2 (early expansion):** Australia, Ireland, New Zealand, English-speaking EU countries  
**Tier 3 (later expansion):** France, Germany, Spain, Italy, Japan — countries with active Amazon Associates programs

All tiers are prioritised by the existence and quality of their Amazon Associates program, since affiliate revenue is the primary monetisation mechanism at launch.

### Language Priority

- Phase 1: English only
- Phase 2: French, German
- Phase 3: Spanish, Italian, Japanese (aligned with Tier 3 geographic expansion)

---

## 3. User Personas

### 3.1 The Reader

**Who they are:** A book lover who reads regularly, tracks what they have read, and wants better recommendations than Amazon's generic engine. They may use Goodreads but find it dated, slow, and antisocial.

**What they need:** A fast, beautiful social reading tracker. A discovery feed based on people they trust. Easy ways to share their reading life.

**Monetisation touchpoints:** Book buy clicks (affiliate), Audible plan signups (affiliate).

---

### 3.2 The Author

**Who they are:** A professional author — self-published or traditionally published — with one or more titles. They want to grow their reader base, communicate with fans, and promote new releases.

**What they need:** A verified creator profile, tools to announce new releases, an ARC (advance reader copy) distribution tool, and authentic reader interaction.

**Monetisation touchpoints:** Paid promoted listings. Paid ARC distribution. Revenue share on tips.

---

### 3.3 The Newbie Writer

**Who they are:** Someone who wants to learn to write — short fiction, essays, long-form nonfiction, blog posts, newsletters, or novels. They range from absolute beginners to writers who have been practising for a few years but have not published. They are not yet publishing anything commercially but are actively developing their craft.

**What they need:** Structured writing challenges, daily prompts, community of fellow learners, feedback mechanisms, access to resources recommended by established writers, and a path from learner to emerging author.

**Monetisation touchpoints:** Affiliate links to writing craft books. Premium tier for personalised AI writing guidance and challenges.

---

### 3.4 The Book Content Creator

**Who they are:** A BookToker, book YouTuber, book podcast host, or literary newsletter writer. They already produce book content for an external audience and want a platform that recognises and rewards their influence on reading decisions.

**What they need:** A creator dashboard, analytics showing how many "want to read" actions their reviews triggered, and ways to monetise their influence.

**Monetisation touchpoints:** Platform fee on tips received. Creator presence drives more book clicks and affiliate revenue.

---

### 3.5 The Casual Social Reader

**Who they are:** Someone who does not read heavily but participates because friends are on the platform or a reading challenge caught their eye. Perhaps 3–6 books per year.

**What they need:** Low-friction onboarding, fun gamification that makes reading feel rewarding, social hooks.

**Monetisation touchpoints:** Occasional book purchase. Audible plan (audiobooks lower the barrier for lighter readers).

---

## 4. Core Architecture Philosophy

- **Zero-cost MVP deployment** on Vercel Hobby Plan. No premium infrastructure until revenue justifies it.
- **No SMS anywhere.** No OTP via SMS, no phone number collected at any point.
- **Mobile-first** interface that also renders correctly on desktop.
- **Offline-friendly.** The app must load and display cached data with no internet. Actions requiring network access must degrade gracefully with clear user feedback.
- **PWA scaffold** from day one. Service worker, web app manifest, installable on home screen.
- **Low-bandwidth optimised.** Lazy loading, image compression, minimal render-blocking resources.
- **Modular architecture.** Each feature area independently deployable and testable.
- **Privacy-aware.** No unnecessary data collection. GDPR-ready from day one.
- **Minimal admin burden.** The platform should run itself day to day. Admin time is reserved for maintenance, high-level decisions, and escalated moderation. Community moderators and community-based moderation handle the daily load.

---

## 5. Technical Stack

### Framework and Deployment

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (App Router) |
| Language | TypeScript throughout |
| Deployment | Vercel (Hobby Plan for MVP) |
| CI/CD | GitHub Actions auto-deploy to Vercel |
| Database | PostgreSQL — provider-selectable via `DATABASE_PROVIDER` env var (Supabase · DigitalOcean · Railway) |
| Auth | Supabase Auth (Supabase mode) or custom Redis/cookie sessions (direct PostgreSQL mode) + Google OAuth + Telegram OAuth |
| Cache / Sessions | Redis — ioredis (self-hosted) or Upstash, selected by `REDIS_PROVIDER` env var |
| Payments | Paystack (Nigeria) + Dodopayments (global) |
| Storage | Supabase Storage (Supabase mode) or S3-compatible object store — Cloudflare R2, DigitalOcean Spaces, AWS S3, Backblaze B2 (direct PostgreSQL mode) |
| AI (primary) | DeepSeek API |
| AI (fallback) | Gemini API |
| On-device AI | Transformers.js or ONNX Runtime Web (target: 2–4 GB RAM mobile devices) |
| Financial math | Decimal.js |
| Cron (built-in) | Vercel Cron (once daily, Hobby Plan limit) |
| Cron (external) | cron-job.org (sub-daily jobs hitting protected Next.js API routes) |

### AI Model Configuration

All model names and versions are defined in a single central file at `src/constants/ai.ts`. No model string appears anywhere else in the application code. When a model is deprecated, only this file needs updating.

```typescript
// src/constants/ai.ts
export const AI_MODELS = {
  PRIMARY_PROVIDER: process.env.AI_PRIMARY_PROVIDER || 'deepseek',
  DEEPSEEK_MODEL: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
  GEMINI_MODEL: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
  ONDEVICE_MODEL: process.env.ONDEVICE_MODEL || 'Xenova/distilbert-base-uncased',
} as const;
```

### Database Abstraction Layer

The database layer is provider-agnostic. All application code talks to a single abstraction; the concrete PostgreSQL provider is selected at runtime via the `DATABASE_PROVIDER` environment variable. Switching providers requires only environment variable changes — no application code changes.

**Supported providers**

| Provider | `DATABASE_PROVIDER` value | Notes |
|---|---|---|
| Supabase | `supabase` | Default. Managed PostgreSQL + built-in auth + Supabase Storage. Easiest setup for MVP. |
| DigitalOcean App Platform | `digitalocean` | Direct PostgreSQL with PgBouncer connection pooling, SSL required. Auth via custom Redis/cookie sessions. Storage via S3-compatible object store. |
| Railway | `railway` | PostgreSQL with PgBouncer transaction pooling (`DATABASE_URL`) and direct URL for migrations (`DATABASE_DIRECT_URL`). Auth and storage same as DigitalOcean mode. |

**Architecture files (all in `src/lib/db/`)**

| File | Responsibility |
|---|---|
| `provider.ts` | Reads `DATABASE_PROVIDER` env var. Exports `getProvider()`, `isDirectPostgres()`, `isSupabase()`, `isDigitalOcean()`, `isRailway()`. All provider-branching logic routes through this file. |
| `pg.ts` | Singleton `postgres` client (npm `postgres` package) used in direct PostgreSQL mode. |
| `query-builder.ts` | `PgQueryBuilder<T>` — fluent query builder that mirrors the Supabase client API surface: `.select()`, `.eq()`, `.neq()`, `.gt()`, `.gte()`, `.lt()`, `.lte()`, `.in()`, `.is()`, `.or()`, `.insert()`, `.update()`, `.delete()`, `.upsert()`, `.order()`, `.limit()`, `.range()`, `.single()`, `.maybeSingle()`, `.returning()`. Returned builders are Thenable (`await builder` works). Factory: `getPgQueryBuilderFactory()` returns an object with `.from(table)` and `.rpc(fnName, params)`. |
| `unified-client.ts` | Drop-in Supabase server client for direct PostgreSQL mode. `createDoClient()`, `createDoServiceClient()`, `createDoSession()`, `destroySession()`. Used so the Supabase client interface is satisfied in non-Supabase environments. |

**Supabase client layer (`src/lib/supabase/`)**

`server.ts` and `client.ts` inspect `isDirectPostgres()` and return either the real Supabase SDK client or the unified-client drop-in. The rest of the application imports from `src/lib/supabase/` and never knows which is active.

**Auth abstraction (`src/lib/auth/getCurrentUser.ts`)**

- Supabase mode: delegates to Supabase Auth (supports Google and Telegram OAuth out of the box).
- Direct PostgreSQL mode: custom session management using Redis + signed httpOnly cookies. Google and Telegram OAuth still works; session is written to Redis rather than Supabase's session store.

**Storage abstraction (`src/lib/storage/provider.ts`)**

`StorageProvider` interface with `upload(bucket, path, body, opts)`, `remove(bucket, paths)`, and `getPublicUrl(bucket, path)`. Factory: `getStorageProvider()` returns either the Supabase Storage adapter or the S3-compatible adapter based on the active database provider.

S3-compatible storage is configured by `S3_ENDPOINT`, `S3_REGION`, `S3_KEY`, `S3_SECRET`, and `S3_CDN_URL`. Any S3-compatible service (Cloudflare R2, DigitalOcean Spaces, Backblaze B2, AWS S3) works without code changes.

**Environment variables for the three supported providers**

```bash
# Provider selection
DATABASE_PROVIDER=supabase          # or: digitalocean | railway
NEXT_PUBLIC_DATABASE_PROVIDER=supabase

# Supabase only
NEXT_PUBLIC_SUPABASE_URL=https://...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...

# DigitalOcean / Railway — direct PostgreSQL
DATABASE_URL=postgresql://user:pass@host:PORT/dbname?sslmode=require
DATABASE_DIRECT_URL=...             # Railway only: non-pooled URL for migrations
DATABASE_POOL_MAX=5
DATABASE_SSL=true

# S3-compatible storage (direct PostgreSQL mode)
S3_ENDPOINT=https://...
S3_REGION=auto
S3_KEY=...
S3_SECRET=...
S3_CDN_URL=https://cdn.example.com
```

**Adding a new database provider**

To add a fourth provider (e.g. Neon, PlanetScale, Render):

1. Add a detection helper in `src/lib/db/provider.ts` (e.g. `isNeon()`).
2. Add a branch in `src/lib/db/pg.ts` if the connection string format or SSL options differ.
3. Add a case in `src/lib/supabase/server.ts` to return `createDoServiceClient()` for the new provider.
4. Add auth session handling in `src/lib/auth/getCurrentUser.ts` if the provider has its own auth SDK; otherwise the existing direct-PostgreSQL Redis session path works unchanged.
5. Add a storage branch in `src/lib/storage/provider.ts` if the provider ships its own storage SDK; otherwise the existing S3 adapter works.
6. Document the required environment variables in SETUP.md.

No query-builder code needs to change — `PgQueryBuilder` speaks standard PostgreSQL and works with any provider that accepts standard SQL over a `postgres` (npm) connection.

### Redis Configuration

Both ioredis (self-hosted Redis) and Upstash (serverless Redis) supported, selectable via `REDIS_PROVIDER` env var (`ioredis` or `upstash`). The Redis client is abstracted behind a single interface so the rest of the application does not care which provider is active.

### Cron Architecture

Vercel Hobby Plan supports one cron trigger per day. Sub-daily jobs use cron-job.org to call Next.js API route endpoints protected by a `CRON_SECRET` header. All cron endpoints must validate this header before executing. This is documented in detail in SETUP.md.

---

## 6. Platform and Device Support

### Web

Accessible in any modern browser. Must pass Core Web Vitals targets.

### Mobile-First

All layouts designed at 375px width first, scaled to desktop. Fixed bottom navigation toolbar on mobile (icons and labels): Home, Discover, Write, Shelf, Profile. On desktop, this converts to a left sidebar or top navigation.

### PWA

- Web app manifest: name, icons, theme colour, `display: standalone`.
- Service worker for caching app shell, static assets, and recent feed.
- Install prompt: dismissible banner, not intrusive.

### Offline Behaviour

- App shell and recent cached feed load without network.
- Network-dependent actions show clear offline state and queue for retry on reconnect.
- Book metadata and covers cached after first load.

### Low-Bandwidth

- All images served via Next.js Image with WebP conversion and responsive sizes.
- Lazy loading on all below-the-fold content.
- Cursor-based pagination throughout.
- Minimal third-party JS.

---

## 7. Feature Specifications

### 7.1 Authentication and Onboarding

**Sign-in methods:**
- Google OAuth
- Telegram OAuth
- Admin can toggle which providers are available via the admin panel (e.g. disable Google login, or disable Telegram login independently).

**No email/password login at sign-up.** Social auth only. Email collection happens post-onboarding as an optional recovery measure (see below).

**Post-sign-in onboarding flow:**
1. Choose a username (auto-suggested from OAuth display name, editable).
2. Select user type: Reader / Author / Newbie Writer / Creator. Users can hold multiple types; this selection sets their default home experience and surfaces relevant features.
3. Select 5 or more genres of interest (seeds discovery feed).
4. Optionally import reading history from Goodreads (CSV upload).
5. Optionally set a 4-digit PIN for additional security on sensitive actions.

**Post-onboarding: optional account hardening (periodic prompts):**

After onboarding, the platform periodically (non-intrusively) encourages the user to:

- **Add an email address** for account recovery purposes. This is optional. Email is not used for marketing. A verification link is sent to confirm the address.
- **Set a password** associated with their email (optional, only if they added an email).
- **Enable 2FA** via an authenticator app (Google Authenticator, Authy, etc.). Optional but prominently recommended. No SMS 2FA at any point.

These prompts appear:
- Once during onboarding (skippable).
- Again on the 7th day after sign-up if not completed.
- Again on the 30th day if still not completed.
- Visible as a dismissible banner in account settings at all times until completed.

The goal is friction-free sign-up with gradual security hardening as the user invests more in their account.

**Account access recovery:**
- If only Google auth: user recovers via Google account recovery.
- If only Telegram auth: user recovers via Telegram account recovery.
- If email was added: email-based recovery link sent.
- If PIN was set: PIN required for sensitive operations.
- If 2FA was enabled: authenticator app required.
- Admin-assisted recovery: user submits a recovery request form with account details. Admin verifies and manually re-links auth. Process documented in SETUP.md.
- Recovery codes: generated when 2FA is enabled. User downloads single-use codes. Consuming a recovery code bypasses 2FA.

**Optional 4-digit PIN:**
- Stored hashed (bcrypt).
- Prompted before: changing linked email, initiating a payout, accessing recovery codes, and other sensitive operations.
- Not mandatory. Users without a PIN skip the PIN step on sensitive operations (and see a reminder to set one).

---

### 7.2 User Profiles

**Profile components:**
- Avatar and banner image
- Display name and username
- User type badges (Reader, Author, Newbie Writer, Creator)
- Verified badge for confirmed published authors
- Bio (280 characters)
- Country (optional, shown at country level only — no city)
- Up to 3 external links (personal site, Substack, YouTube, podcast, etc.)
- Reading stats: books read this year, all-time, current streak
- XP level and title
- Badge collection
- Public shelves
- Recent reviews
- Reading lists

**Profile privacy settings:**
- Public (default)
- Followers-only (shelf and activity visible to followers only)
- Shelf visibility can be toggled independently of overall profile visibility.

---

### 7.3 Shelf and Library System

**Default shelves (every user):**
- Currently Reading
- Have Read
- Want to Read

**Custom shelves:**
- Unlimited on paid tiers. Free tier: max 10.
- Each shelf is public or private.

**Reading progress tracker:**
- Log progress by page or percentage.
- Optional reading session log (start/end time, pages covered — used for streaks and XP).
- Progress bar on book card within the shelf.

**Annual reading goal:**
- Set at any time.
- Public progress bar on profile.
- Feed updates at 25%, 50%, 75%, and 100%.

**Goodreads import:**
- Accept Goodreads CSV export.
- Auto-map to default shelves.
- Handle duplicates gracefully.
- Show import summary.

---

### 7.4 Book Pages and the Book Catalogue

Every book has a canonical page on Liravo.

**Book data sources (in priority order):**
1. Liravo internal database (manually added or previously cached)
2. Google Books API (primary lookup)
3. Open Library API (fallback)

All metadata fetched from external APIs is saved to the local database on first lookup. Subsequent requests are served from the database, not the API.

**Book page components:**
- Cover image, title, author, publisher, year, ISBN, genre tags
- Average rating and rating distribution
- Community reviews (paginated, sorted by recency or helpfulness)
- Community quotes
- Currently reading count and want to read count
- Author's Liravo profile link (if they are on the platform)
- Reading lists that include this book
- Similar books (AI-powered, computed nightly)

**Book availability and buy links:**

Liravo aims to send users to the best available purchase or access point for each book. The logic is:

1. **Amazon affiliate link:** If the book is available on Amazon in the user's locale, show a "Buy on Amazon" button with the affiliate tag. Use the correct regional Amazon domain and affiliate tag for the user's country (e.g. amazon.com for US, amazon.co.uk for UK, amazon.com.au for AU).
2. **Audible affiliate link:** If an audiobook version exists on Audible, show a "Listen on Audible" button with the affiliate tag.
3. **Other affiliate stores (future):** As additional affiliate programs are added (Book Depository, Kobo, Barnes and Noble, Thriftbooks, etc.), their links are inserted here. The affiliate store registry is managed by admin and is extensible without code changes — stores are rows in a `affiliate_stores` table with their URL templates and tags.
4. **Non-affiliate external link:** If the book exists on a non-affiliate store, a library, an open-access repository (Project Gutenberg, Standard Ebooks, Internet Archive), or the author's own site, show a clearly labelled non-affiliate external link (e.g. "Available free on Project Gutenberg" or "Find at your library via WorldCat"). These links use `rel="nofollow noopener"` and are clearly not presented as primary CTAs.
5. **No link available:** Show a "Not yet available online — check your local library" message with a WorldCat search link.

All link clicks are logged (book_id, link_type, affiliate/non-affiliate, store, user country) for reporting. This data guides future affiliate program priority.

The affiliate store system must be designed so new stores can be added by admin without a code deployment.

---

### 7.5 Reviews and Reactions

**Review types:**
- Short review (up to 280 characters) — designed for social sharing
- Long-form review (rich text, no length limit) — supports spoiler tags
- One-line review (single sentence, displayed as a callout on the book page)

**Review components:**
- Star rating (1–5, required)
- Mood tags (Dark, Cozy, Mind-bending, Funny, Emotional, Slow-burn, Fast-paced, Educational, Inspiring, Disturbing, Romantic, Intense)
- Spoiler toggle
- Read date (optional)
- Edition read (optional)

**Reactions:**
- Like
- "Want to read" (adds book to reactor's Want to Read shelf; credits the reviewer with XP)
- Reply (threaded comments)
- Share (generates shareable card)
- Report (sends to moderation queue)

**Helpfulness votes:** Reviewers can be voted helpful or not. Score used in ranking.

---

### 7.6 Quotes

- Users submit a quote from any book.
- Displayed on the book page.
- Styled into a shareable image card using the book cover's colour palette.
- Quote cards are a primary virality mechanism for Instagram, X/Twitter, and WhatsApp.

---

### 7.7 Discovery and Feed

**Home feed:**
- Activity from followed users: reviews, shelf additions, list creations, reading milestones, challenge completions.
- Ranked by recency with a light engagement boost.
- Cursor-based pagination, load more on scroll.

**Discover tab:**
- Trending books (past 7 days, by shelf additions and reviews)
- Trending in your country
- New releases from followed authors
- "Readers like you also loved" (shelf-overlap, computed nightly)
- Mood-based search: type a mood, AI returns matched books
- Hidden gems: books with fewer than 50 ratings but high scores from trusted readers
- Genre streams

**Search:**
- Full-text search on book titles, authors, ISBNs
- User search
- Tag/genre search
- Reading list search

---

### 7.8 Reading Lists

- Curated lists created by any user.
- Title, description, cover image (auto from first book or custom upload).
- Public or private.
- Other users can follow (get notified of additions) or fork (copy to their own lists).
- Every book in a list carries its appropriate buy link (affiliate or non-affiliate fallback as per Section 7.4).
- "Buy all on Amazon" bulk CTA for lists where all books are Amazon-available.
- Lists have SEO-friendly public URLs.

---

### 7.9 Author Features

Authors get an enhanced version of the standard profile.

**Additional author features:**
- Verified author badge (admin-granted after verification)
- Full book catalog with buy links (affiliate where available)
- "Books that inspired me" shelf (affiliate-linked — high-value placement)
- "From the Author" posts (updates, writing process content, book news)
- Reader Q&A (fans submit, author answers publicly)
- ARC distribution (author uploads file, sets eligibility criteria, platform identifies and notifies eligible readers)
- New release announcements (in-app notification to followers)
- Event hosting (Section 7.13)

**Author verification:**
- Author submits verification request with one or more ISBNs associated with their name.
- System cross-references against Google Books / Open Library.
- Moderator (not necessarily admin) reviews and approves or rejects.
- Verified badge applied.

---

### 7.10 Newbie Writer Track

A dedicated feature set for users who select Newbie Writer as their type, accessible from the Write tab.

**Writing Challenges:**
- **Daily prompts:** 100–300 word responses. AI-generated from a seed topic list, pre-generated in batches and stored in the database (not generated per-request). Free tier: access to daily prompts. Paid tier: personalised daily prompts based on the user's writing goals and history.
- **Weekly challenges:** Short story, essay, flash fiction, personal essay.
- **Monthly long-form challenge:** E.g. write the first chapter of a novel.
- Community voting on submitted entries.

**AI-assisted guidance (paid tier only):**
- After a user submits a writing challenge response, a paid-tier feature runs an AI review: noting strengths, one area to work on, and a specific next exercise. This AI call is triggered on submit (DeepSeek primary, Gemini fallback) and stored in the database as the user's feedback record.
- Personalised weekly writing plan: based on the user's goals, past challenges, and areas for improvement, the AI generates a 7-day plan. Generated once per week via cron for paid-tier Newbie Writer users.
- These features are sparingly AI-powered (one AI call per submit, one per week per user) to keep costs manageable.

**Craft Resources Section:**
- Curated reading lists of craft books: plotting, sentence-level writing, memoir, dialogue, screenwriting, etc.
- All books in these lists are affiliate-linked.
- Community-sourced craft tips from established writers on the platform.

**Writing Workshop Rooms:**
- Small groups (max 8) read and critique each other's writing submissions.
- Structured feedback format enforced: What worked / What to improve / One specific suggestion.
- Created by any user with Newbie Writer or Author type.

**Progress Tracking:**
- Words written (self-reported per session, optionally extracted from submitted challenge responses).
- Challenge completions on profile.
- Writing streak (separate from reading streak).

**Ask a Writer:**
- Newbie Writers post craft questions publicly.
- Any verified Author or experienced Newbie Writer can respond.
- Best answer marked by the asker.

**Writing Resource Library:**
- Standalone page linking to the best craft books across genres and writing types.
- All affiliate-linked.
- Curated by admin and community moderators.
- High SEO value — target queries like "best books on how to write a novel".

---

### 7.11 Social and Community Features

**Following system:** Follow any user or author. Suggested follows on sign-up.

**Buddy reads:**
- Invite one other user to read a book together.
- Private discussion thread shared between participants.
- Expandable to group reads (up to 20).

**Reading Together Rooms:**
- Group read a single book, divided into chapter milestones.
- Room creator sets the reading schedule.
- Discussion thread per milestone, locked until that milestone's date.
- Public or invite-only.

**Book Debates:**
- User posts a provocative claim about a book.
- Others vote agree/disagree and add arguments.
- Debate cards are shareable.

**Notifications (in-app):**
- Follows, likes, want-to-reads, replies, mentions, challenge completions, ARC grants, buddy read invites, author Q&A answers.
- Notification preferences configurable per type.

**Email notifications (paid tiers only):**
- Free tier: no email notifications. Account-critical transactional emails only (e.g. email verification link, recovery link if email added, 2FA recovery code delivery).
- Paid tier: opt-in weekly activity digest, new release alerts from followed authors, challenge reminder emails.
- Every email has a one-click unsubscribe link.
- No marketing or promotional email to free users.

---

### 7.12 Content Creator Features

**Creator profile:**
- Creator badge
- Up to 3 external platform links
- Featured video review (embedded iframe from YouTube or podcast)
- Creator analytics: reviews posted, want-to-reads triggered, profile visits, follower growth

**Creator content types:**
- Video review (embedded)
- Written review
- Reading list
- Newsletter excerpt (short teaser with external link to full issue)

**Tip button:**
- Available once creator reaches 500 followers.
- Tips via Dodopayments (global) or Paystack (Nigerian users).
- Platform fee: 10% of tip value.
- Creator receives 90%.
- All calculations use Decimal.js.

**Creator leaderboard:**
- Top creators by want-to-reads triggered this week.
- Top creators by follower growth this week.
- Featured on the Discover page.

---

### 7.13 Events

- Author or creator hosts a reading event or Q&A.
- Free events: open RSVP.
- Paid events: ticketed via Dodopayments or Paystack. Platform fee: 10%.
- Event page includes book recommendations with affiliate links.
- MVP: events link to external hosting (Zoom, StreamYard, etc.). Native streaming is post-MVP.

---

### 7.14 Referral System

**Referral link format:**

Each user gets a unique referral code that is a numeric UUID variant — a 12-digit number derived from a UUID (e.g. `ref=471370973642`). This is generated on account creation from a truncated, collision-checked UUID. It does not contain the username or any PII. The same user can generate a new referral code from settings if they wish (old code remains valid for 30 days after rotation).

**Referral link:** `https://liravo.org/join?ref=471370973642`

**Referral benefits for the referrer:**

- 200 XP per confirmed sign-up.
- **10% commission** on all paid transactions completed by any user they referred, for as long as that user remains on the platform. This applies to: premium subscription payments, tips sent to others (the 10% is of the platform's gross take, not of the full tip amount), promoted listing purchases, paid event ticket purchases, and any other future paid product on the platform.
- Referral commission is credited to the referrer's earnings balance. Withdrawable once it reaches a minimum threshold (suggested: $10).
- "Brought to Liravo by [username]" shown on the referred user's public profile (toggleable by the referred user from their settings).
- Referral leaderboard: top referrers by confirmed sign-ups and by total commission earned (two separate lists).
- Milestone badges: Connector (10 referrals), Ambassador (50 referrals), Liravo Builder (200 referrals).

**Referral benefits for the referred user (joining incentive):**
- Bonus 100 XP on first book added to shelf.
- Bonus 100 XP on first review posted.
- Shown a personalised welcome message: "Welcome to Liravo — you were invited by [username]."

**Commission accounting:**
- A `referral_commissions` table tracks every commission credit: referrer_id, referred_user_id, transaction_id, transaction_type, gross_transaction_amount, platform_fee_amount, commission_rate, commission_amount, credited_at.
- All commission calculations use Decimal.js.
- Commissions are non-reversible once credited unless the underlying transaction is refunded (in which case commission is reversed atomically).
- Idempotency keys prevent double-crediting on webhook retries.

---

## 8. Monetisation Architecture

### 8.1 Amazon Affiliate Links

All book buy CTAs carry Liravo's Amazon Associates tag.

**Implementation:**
- Amazon Product Advertising API 5.0 for dynamic link generation.
- Fallback: static Amazon search URL with affiliate tag if the PA API is unavailable or not yet approved.
- Regional routing: different affiliate tags per country. Configured in a `affiliate_tags` table (country_code, store_domain, affiliate_tag). Admin-managed without code deployment.
- All affiliate link clicks logged (book_id, user_id hashed, link_type, country, timestamp).
- Nightly cron refreshes affiliate link health for the top 500 most-clicked books.

**Placement:** Book pages, reading lists, author catalogs, author "Books that inspired me" shelf, Discover page, Newbie Writer craft resource sections, challenge completion screens, Wrapped summary.

### 8.2 Audible Affiliate

- "Listen on Audible" CTA on all audiobook-tagged titles.
- "Start your Audible free trial" CTA in the onboarding flow for users who indicate they prefer listening.
- Commissions tracked via the Amazon Associates dashboard.

### 8.3 Non-Affiliate Book Links

As specified in Section 7.4, books not available on Amazon get a clearly labelled non-affiliate external link. These links are tracked to inform future affiliate program partnerships. Admin can see which stores are receiving the most non-affiliate clicks and prioritise seeking an affiliate relationship with those stores.

### 8.4 Extended Affiliate Store Registry

A `affiliate_stores` table allows admin to add new affiliate stores without code changes:

| Column | Description |
|---|---|
| id | UUID |
| name | Store display name (e.g. "Kobo", "Barnes and Noble") |
| countries | Array of ISO country codes where this store is relevant |
| url_template | URL with `{isbn}` placeholder |
| affiliate_tag | Affiliate tag appended to the URL |
| is_active | Toggle on/off |
| priority | Integer, lower = higher priority in the UI |

When a book page is rendered, the server checks this table for the user's country and constructs buy links accordingly. Amazon always has the highest priority when available. Other stores fill in below it.

### 8.5 Promoted Listings

- Authors pay to feature a book in the Discover feed as a "Featured" card.
- Pricing (suggested defaults, configurable by admin):
  - 1 week: $29
  - 4 weeks: $99
  - Genre-targeted boost: +$20
- Payment via Dodopayments or Paystack.
- Phase 1 (MVP): payment confirmation triggers admin notification; admin manually activates. Phase 6: activation is automated on payment confirmation via webhook.

### 8.6 Platform Premium Subscription

**Free tier:** Full social features, reading tracking, reviews, shelves (up to 10 custom), gamification, community access.

**Premium tier (suggested $4.99/month or $39/year):**
- Email digests (weekly activity, new release alerts, challenge reminders)
- Advanced reading statistics dashboard (pace, genre distribution over time, seasonal patterns)
- Unlimited custom shelves
- AI taste profile analysis (generated on demand, refreshed when reading history changes significantly)
- AI-powered personalised writing challenges and weekly plan (for Newbie Writer users on premium)
- Priority matching in buddy read finder
- Exclusive seasonal badge designs
- Export reading history as PDF or CSV
- Early access to new features

**Payment:** Dodopayments (global, Stripe-powered).

### 8.7 Tips to Creators and Authors

- Minimum tip: $1.
- Platform fee: 10%.
- Creator / author receives 90%.
- Payout: creator initiates withdrawal from their earnings dashboard.
- All calculations in Decimal.js.
- Referral commission (10% of platform's gross take) credited to referrer at the time of the transaction.

### 8.8 Events (Paid)

- Ticketed events: platform fee of 10% of ticket price.
- Free events: no fee.

### 8.9 Earnings and Payouts

All platform earnings (tips, event tickets, referral commissions) are tracked in an `earnings` table per user. Users can see their running balance in their account dashboard. Payout is initiated by the user once they reach the minimum threshold ($10). Payouts processed via Dodopayments or Paystack depending on user's country.

---

## 9. Gamification System

### 9.1 XP and Levels

| Action | XP Earned |
|---|---|
| Finish a book (logged) | 50 XP |
| Write a short review | 20 XP |
| Write a long-form review | 40 XP |
| Post a quote | 10 XP |
| Complete a reading challenge | 100 XP |
| Complete a writing challenge (free) | 80 XP |
| Complete a writing challenge (AI-guided, paid) | 120 XP |
| Get a "want to read" on your review | 5 XP per reaction |
| Refer a confirmed new sign-up | 200 XP |
| Refer milestone: 10 referrals | 500 XP bonus |
| Refer milestone: 50 referrals | 2,000 XP bonus |
| Start a buddy read | 25 XP |
| Daily login | 3 XP |
| 7-day login streak bonus | 50 XP |
| 30-day login streak bonus | 200 XP |
| Follow a user | 2 XP |
| Receive a new follower | 5 XP |
| Submit a writing prompt response | 15 XP |

### 9.2 Level Titles

| XP Range | Title |
|---|---|
| 0–499 | Page Turner |
| 500–1,499 | Bookmarked |
| 1,500–3,999 | Chapter Chaser |
| 4,000–7,999 | Spine Cracker |
| 8,000–14,999 | Literary Nomad |
| 15,000–24,999 | Wordsmith |
| 25,000–49,999 | Bibliophile |
| 50,000+ | Legend of the Shelf |

### 9.3 Badges

**Reading milestones:** First Book, 10 Books, 50 Books, 100 Books, 365-Day Streak.

**Genre badges** (at 5, 20, and 50 books per genre): Horror Head, Romance Reader, Sci-Fi Scholar, Fantasy Wanderer, Nonfiction Thinker, Mystery Maven, Historical Traveller, Literary Devotee.

**Social badges:** Connector (10 referrals), Ambassador (50 referrals), Liravo Builder (200 referrals), Influencer (100 want-to-reads triggered), Spark (first review received a want-to-read), Author's Favourite (replied to by a verified author), Bookclub Host (hosted a Reading Together Room).

**Writing badges:** First Draft (first writing challenge completed), Workshop Regular (5 workshops participated in), Prompt Runner (30 daily prompts completed), Craft Scholar (purchased or shelved 10 craft books).

**Speed badges:** Sprint Reader (book finished in under 3 days), Weekend Warrior (book finished in one weekend), Marathon Reader (5+ hour session, self-reported).

**Seasonal and event badges:** Limited edition per seasonal community event. New Year Pledge badge for users who set a public reading goal in January.

**Referral badges:** Connector (10 referrals), Ambassador (50 referrals), Liravo Builder (200 referrals).

### 9.4 Leaderboards

- Most books read this month (global, national, friend circle)
- Top reviewers by helpfulness votes (weekly)
- Most influential readers by want-to-reads triggered (weekly)
- Top creators by follower growth (weekly)
- Writing challenge leaderboard (most challenges completed)
- Top referrers by confirmed sign-ups (monthly)
- Top referrers by commission earned (monthly)

Leaderboards refresh nightly via cron.

### 9.5 Reading Streaks

- Streak increments on each day the user logs at least one reading session.
- Streak flame icon on profile. Visual intensity increases at 7, 30, and 100-day milestones.
- Streak freeze tokens: 1 token awarded at 7-day milestone, 1 more at 30-day milestone. Auto-consumed on a missed day to preserve streak.
- Streak lost notification sent in-app.

### 9.6 Seasonal Events

- Community-wide reading events with start and end dates.
- Admin creates events via admin panel (name, theme, reading list, badge).
- Examples: "Summer of Thrillers", "Black History Month Reads", "January Nonfiction Challenge".
- Participating users see a progress tracker on their home feed.

---

## 10. Virality and Shareability

### 10.1 Shareable Cards (Server-Side Image Generation)

Generated using `@vercel/og` (satori-based) as a server-side PNG.

**Card types:**
- Finished book card: "I just finished [Title] by [Author]" — cover, rating, one-line review, avatar.
- Review card: short review text over book cover background.
- Quote card: quote text over book cover colour palette. Book and author attribution.
- Reading Wrapped card: annual summary. 9:16 aspect ratio option for Instagram Stories.
- Shelf snapshot card: 6 most recent book covers in a grid.
- Challenge completion card: "I completed the [Challenge] on Liravo."
- Writing challenge card: "I completed [Writing Challenge] — 30 days, 9,000 words."

All cards include the Liravo wordmark and a URL back to the relevant page on liravo.org.

### 10.2 Reading Wrapped

Generated in December and on annual reading goal completion.

**Data points:** Total books read, estimated total pages, favourite genre, favourite author, longest book, shortest book, peak streak, most active month, personalised reader title.

Available in 16:9 (standard share) and 9:16 (Instagram Stories) formats.

### 10.3 Challenges and Trends

**Weekly community challenge:** Single hashtag, themed prompt, shareable completion card.

**Monthly genre spotlight:** Community focuses on one genre. Genre leaderboard for the month. Featured reading lists and author spotlights.

**Pass the Book chain:** One reader nominates the next publicly. Viral thread where each node links to the book page.

### 10.4 Referral System

As specified in Section 7.14. The referral link uses a numeric code for privacy (no username in the URL).

---

## 11. AI Layer

### 11.1 Provider Architecture

All AI calls go through a single service wrapper at `src/services/ai.ts`. This wrapper:
- Tries DeepSeek first.
- Falls back to Gemini if DeepSeek returns an error or times out after 8 seconds.
- Circuit breaker: if DeepSeek fails 3 times within 5 minutes, all requests route to Gemini for 10 minutes before retrying DeepSeek.
- Logs provider used, model version, and latency per call.

### 11.2 AI Feature Inventory

AI is used sparingly. Every AI call must have a clear user value justification and a cost estimate. The following is the complete list of AI-powered features:

| Feature | Trigger | Tier | Model |
|---|---|---|---|
| Mood-based book discovery | User submits mood query | Free | Server-side (DeepSeek/Gemini) |
| Platform-wide daily challenge generation | Nightly cron, batch generate 7 days of prompts | Platform | Server-side |
| Personalised daily writing challenge | Nightly cron, paid Newbie Writer users only | Paid | Server-side |
| Personalised weekly writing plan | Weekly cron, paid Newbie Writer users only | Paid | Server-side |
| AI writing feedback on challenge submission | On submit, paid Newbie Writer users only | Paid | Server-side |
| AI taste profile | On demand or annually | Paid | Server-side |
| Shelf-overlap recommendations | Nightly cron batch pre-compute | Free | Database query + light ranking |
| Review tone / moderation pre-screen | On review submit | Platform | On-device (Transformers.js) |
| Similar books computation | Nightly cron | Free | Server-side embedding similarity |

No AI feature is triggered on every page load. All AI outputs that can be pre-computed are pre-computed and stored in the database.

### 11.3 On-Device AI

Used where latency matters and server cost should be avoided.

- Review tone pre-screening before server-side moderation.
- Offline mood-to-genre mapping (simplified rule-based fallback when on-device model unavailable).

Target devices: 2–4 GB RAM Android/iOS. Model size cap: 50 MB. Use quantised ONNX or WASM-compiled models.

### 11.4 Prompt Injection Mitigation

- All user-supplied text passed to the AI is sanitised and wrapped in explicit system/user delimiters.
- System prompt instructs the model to disregard instructions embedded in user text.
- AI output is validated and sanitised before storage or display. Raw AI output is never rendered as HTML.

---

## 12. Moderation Architecture

The goal is a self-moderating community with minimal admin involvement in day-to-day moderation.

### 12.1 Moderation Tiers

**Tier 1 — Community self-moderation:**
- Report button on all user-generated content (reviews, quotes, posts, comments, profiles).
- A piece of content reported by N users (configurable threshold, default: 5) is automatically hidden pending moderator review.
- Community Notes (admin-toggleable feature): users with a sufficient trust score can add contextual notes to disputed content (e.g. factual corrections on a review, context on a controversial claim). Other users can rate a community note as helpful or not. Notes that reach a helpfulness threshold are shown publicly beneath the content.

**Tier 2 — Moderator review:**
- Trusted, dedicated community members can be granted Moderator role by admin.
- Moderators see the content report queue.
- Moderators can: approve reported content (dismiss the report), edit content, remove content, send a warning to a user, or escalate to admin.
- Moderators cannot: ban users, grant roles, or access financial data.
- Moderator role is granted and revoked by admin. Admin can see a moderator's action history.

**Tier 3 — Admin:**
- Admin handles escalations from moderators, user ban/unban, role management, and systemic issues.
- Admin does not need to review every reported post.

### 12.2 Community Notes

- Admin can toggle this feature on or off from the admin panel.
- Eligibility to write a community note: user has at least 50 reviews posted, account older than 30 days, no active warning on their account.
- Note visibility: shown only when the note reaches a minimum helpfulness threshold from ratings by eligible note-writers.
- Notes are not editable after posting. The author can delete their own note.

### 12.3 Automated Moderation

- Review tone classifier (on-device, Transformers.js) runs on every review submission. If the classifier returns a high confidence score for abusive content, the review is automatically held and added to the moderation queue (not published) pending human review.
- Spam detection: reviews or posts that are identical or near-identical to content already submitted by the same user in the past 24 hours are rejected with a message.
- Link spam: user-submitted external links are checked against a blocklist of known spam and malware domains.

### 12.4 Appeals

- Users can appeal a content removal or account warning via a form in their account settings.
- Appeal goes to a moderator (not the one who took the original action, if attributable).
- Admin reviews escalated appeals.

---

## 13. Admin Panel

Accessible at `/admin`. Every admin route verifies `is_admin = true` against the `users` table in the database server-side. Session data alone is never trusted for admin access.

### 13.1 Dashboard

- DAU / WAU / MAU
- New signups today and this week
- Shelf additions and reviews posted today
- Affiliate link clicks today (total and top books)
- Active seasonal events
- Pending author verification requests
- Moderation queue size
- Revenue summary (tips, subscriptions, promoted listings, events)
- AI usage and cost estimate for the current month
- System health indicators (Redis, DeepSeek, Gemini, Supabase, Paystack, Dodopayments)

### 13.2 User Management

- Search by username, email (if provided), display name.
- View profile, reviews, reports.
- Suspend, ban, or restore users.
- Grant or revoke roles: Admin, Moderator, Verified Author.
- View login history (IP hashed, timestamp, auth provider).

### 13.3 Moderation Queue

- View all flagged content (auto-flagged and user-reported).
- Actions: Approve (dismiss), Edit, Remove, Warn user, Escalate.
- View moderator action history.
- Grant and revoke moderator role.

### 13.4 Auth Provider Management

- Toggle Google OAuth availability on/off.
- Toggle Telegram OAuth availability on/off.
- At least one provider must remain active (system prevents disabling both simultaneously).

### 13.5 Book Catalogue

- Add books manually.
- Edit book metadata.
- Mark book as having an audiobook (enables Audible CTA).
- Manage affiliate links per book.
- Affiliate store registry management (add, edit, deactivate stores).

### 13.6 Promoted Listings

- View active, pending, and expired listings.
- Activate or deactivate.
- Set start and end dates.
- View click-through stats per listing.

### 13.7 Seasonal Events

- Create, edit, delete community events.
- Set name, theme, start/end dates, reading list, badge.
- Publish or unpublish.

### 13.8 Writing Challenges

- Create and manage daily prompts, weekly and monthly challenges.
- View submissions and trigger community voting.
- Award challenge completion badges.
- Manage the AI prompt seed topic list.

### 13.9 Theme and UI Configuration

- Toggle between Light, Dark, and custom themes.
- Upload and activate custom themes (CSS variable overrides stored in the database).

### 13.10 Feature Flags

- Toggle any major feature on or off without a deployment.
- Feature flags stored in the database, checked server-side and cached in Redis with short TTL.
- Community Notes toggle is a feature flag.

### 13.11 Affiliate and Revenue Configuration

- Manage affiliate store registry.
- Configure per-country Amazon affiliate tags.
- View affiliate link click reports.
- View earnings and payout records.

### 13.12 System and Cron Status

- Last run time and status of each cron job.
- AI provider health status.
- Redis connectivity.
- Payment gateway status.
- Manual trigger for any cron job (for testing or emergency refresh).

---

## 14. Seed Content Strategy

A social platform with no content at launch has no value. Seed content is required to ensure that a new user who signs up before the community grows still has a useful, engaging experience.

### 14.1 Book Catalogue Seed

Before launch, populate the Liravo book database with a curated set of at minimum 2,000 books spanning all supported genres. Source via:
- Google Books API batch fetch for bestseller and award-winner lists.
- Open Library API for public domain and classic titles.
- Manual additions for key titles important to the platform's identity.

Priority seed lists:
- NYT Bestseller lists (past 5 years)
- Goodreads Choice Awards winners (past 5 years)
- Classic literary fiction (Project Gutenberg catalogue)
- Top craft and writing books (for the Newbie Writer track)
- Top audiobooks on Audible

### 14.2 Seeded Reading Lists

Create 20–30 high-quality curated reading lists before launch. These should be optimised for:
- SEO value ("Best thriller books of 2024", "Best books for learning to write", "Top fantasy series to read in order")
- Affiliate click potential (all Amazon-available titles)
- Breadth of genres

These lists are attributed to a named "Liravo Editors" account (a seeded system account, not a real person account, clearly labelled as the editorial team).

### 14.3 Seeded Quotes

For each of the top 500 seeded books, add 1–3 notable community-style quotes. These are attributed to the "Liravo Editors" account initially, and are replaced or supplemented by real user quotes over time.

### 14.4 Seeded Reviews

For each of the top 200 seeded books, add 1–3 short reviews. Attributed to the "Liravo Editors" account. These must feel authentic and varied in tone — not marketing copy. They should read like real reader opinions.

These seeded reviews are clearly not AI-generated in tone. They should be written by the product team or a hired book reviewer. They serve as a floor, not a ceiling.

### 14.5 Seeded Writing Prompts

Pre-generate 60 days of daily writing prompts before launch so the Newbie Writer track is not empty. Use AI to generate these from the seed topic list and review them manually before publishing.

### 14.6 Seeded Challenges

Create 4 weeks of weekly writing challenges and 2 monthly reading challenges before launch. These serve as the default experience for the first month of operation.

### 14.7 Liravo Editors Account

A dedicated system account with username `@liravo` and display name "Liravo Editors" is created during the database seed. This account:
- Posts the seeded reading lists, reviews, and quotes.
- Is clearly labelled as the platform's editorial account.
- Cannot be followed (or can be followed for curated picks — product owner decides).
- Is not a real user account. It is created via seed script and managed by admin.

---

## 15. Security Requirements

### 15.1 Authentication and Session Security

- JWT access tokens (15-minute expiry) in httpOnly, Secure, SameSite=Strict cookies.
- Refresh tokens (7-day expiry) rotated on every use.
- Redis session store for invalidation on logout or suspicious activity.
- `is_admin` checked against the database on every admin route. Session claims alone are never trusted.
- Optional 4-digit PIN stored hashed (bcrypt, cost 12). Required before: linked email change, payout initiation, recovery code access.

### 15.2 Input Validation and Sanitisation

- All input validated server-side with Zod schemas.
- User HTML content (long reviews, bio) sanitised with DOMPurify before storage and rendering.
- File uploads validated for MIME type (not just extension) and size server-side.
- `dangerouslySetInnerHTML` is never used.

### 15.3 OWASP Top 10

- **Injection:** Parameterised queries exclusively. No raw SQL construction.
- **Broken Auth:** Short-lived JWTs, refresh token rotation, Redis invalidation.
- **Sensitive Data Exposure:** Passwords hashed with bcrypt (cost 12). No PII in logs. User IDs hashed in analytics tables.
- **Broken Access Control:** RLS enabled with complete policies on all Supabase tables (migration 012). Server-side ownership checks before every mutation in all database modes.
- **Security Misconfiguration:** All secrets in env vars. Security headers (CSP, HSTS, X-Content-Type-Options, X-Frame-Options) set in Next.js config.
- **XSS:** CSP header. DOMPurify on all user content.
- **Insecure Deserialisation:** No object deserialisation from user input.
- **Known Vulnerable Components:** Dependabot alerts enabled. Regular `npm audit`.
- **Logging:** All security events (login, failed auth, lockout, admin actions) logged to `security_events` table.

### 15.4 CSRF Protection

- CSRF token on all state-changing API routes.
- SameSite=Strict on auth cookies.

### 15.5 Rate Limiting

- Redis sliding window counter on all API routes.
- Auth endpoints: max 5 attempts per 15 minutes per IP, then 30-minute lockout.
- Rate limit headers returned (`X-RateLimit-Remaining`, `X-RateLimit-Reset`).

### 15.6 Bot and Abuse Mitigation

- Honeypot fields on sign-up.
- hCaptcha (free tier) on sign-up and after 3 failed auth attempts.
- Anomalous activity detection (bulk shelf additions, review spam) triggers hold and moderator flag.
- User-agent analysis on API requests.

### 15.7 AI Prompt Injection

- User content passed to AI is sanitised and wrapped in explicit delimiters.
- System prompt instructs the model to disregard embedded instructions in user text.
- AI output validated and sanitised before storage or display.

### 15.8 Payment Integrity

- All payment amounts calculated server-side.
- Idempotency keys on all payment API calls.
- Webhook signatures verified before processing (Paystack and Dodopayments both provide signature headers).
- All financial calculations use Decimal.js.
- Tip and payout flows are transactional (atomic database operations).
- Referral commissions credited atomically with the parent transaction.

### 15.9 Row Level Security (RLS)

**Supabase mode:** All tables have RLS enabled with default deny. Explicit allow policies cover all 50+ user-facing tables. Policies are keyed on `auth.uid()` — the Supabase-injected function that extracts the authenticated user's UUID from the request JWT. Two system tables (`outbox_events`, `financial_audit_log`) are intentionally policy-free (default deny) and accessible only via the service_role. The service role key is used exclusively in server-side API routes and cron jobs — never exposed to the client. Full policy definitions are in `supabase/migrations/012_rls_enforcement.sql`.

**Direct PostgreSQL mode (DigitalOcean / Railway):** `auth.uid()` is a Supabase-specific function and returns `null` in a direct PostgreSQL connection. Consequently, Supabase RLS policies do not enforce access control in these modes. The connecting database role also typically holds superuser or BYPASSRLS privileges in default managed PostgreSQL configurations, meaning PostgreSQL-level enforcement is bypassed even if policies are technically present.

Data isolation in these modes is enforced at the **application layer**: every API route calls `getCurrentUser()` (which reads the Redis session) and explicitly scopes all queries with ownership filters (`.eq('user_id', user.id)`, etc.) before executing.

**`withUserContext` (DO/Railway hardening):** `src/lib/db/pg.ts` exports `withUserContext(userId, fn)` which wraps queries in a PostgreSQL transaction and sets `SET LOCAL app.current_user_id = '<userId>'`. To achieve database-level enforcement in these modes: (1) create a low-privilege application database role with BYPASSRLS revoked, and (2) add PostgreSQL RLS policies that check `current_setting('app.current_user_id', true)::uuid`. With `withUserContext` already setting this session variable in every route, the database will enforce isolation automatically — no further application-code changes required.

### 15.10 Data Privacy

- GDPR-ready data export from account settings.
- Account deletion: soft-delete flag, 30-day recovery window, then hard delete via cron.
- Affiliate link clicks logged with hashed user IDs.
- No third-party analytics that collect PII in MVP.

---

## 16. Performance and Scalability

### 16.1 Caching Strategy

- Redis namespaced keys: `book:{id}`, `feed:{user_id}:cursor:{cursor}`, `leaderboard:weekly`, `affiliate_link:{book_id}:{country}`.
- Feed cache: 5-minute TTL.
- Book metadata: 24-hour TTL.
- Leaderboards: 1-hour TTL.
- Affiliate links: 24-hour TTL.
- Feature flags: 60-second TTL.
- Cache invalidation on write (update book → invalidate `book:{id}`).

### 16.2 Database Performance

- Connection pooling via Supabase PgBouncer.
- Cursor-based pagination on all list queries.
- Indexes on `user_id`, `book_id`, `created_at` on all high-read tables.
- Full-text search via `tsvector` columns on `books.title`, `books.author_name`.
- `EXPLAIN ANALYSE` run on all queries expected to handle > 10,000 rows before production.

### 16.3 Thundering Herd Mitigation

- Feed pre-computed nightly for active users. Not generated on request.
- Cache stampede prevention: Redis `SET NX EX` pattern. One request regenerates while others wait on a short lock.
- Jitter added to cron job scheduling where multiple jobs exist.

### 16.4 Race Condition Prevention

- Shelf additions, XP credits, streak increments use atomic PostgreSQL `UPDATE ... WHERE` with version checks.
- Tip and payout flows use Supabase transactions.
- Idempotency keys on all payment operations.
- Referral commission crediting is part of the same transaction as the parent payment.
- Retry logic with exponential backoff and jitter on all external API calls.

### 16.5 Scalability Targets

Architecture must be able to scale to 50,000 concurrent users without structural change, and to 1 million registered users with infrastructure upgrades only (Vercel Pro, Supabase Pro, Upstash paid). All API routes are stateless to allow horizontal scaling.

---

## 17. Internationalisation (i18n)

- `next-intl` for all UI strings from day one.
- All strings in locale JSON files. No hardcoded English strings in components.
- Default locale: `en-US`.
- Date/time via `Intl.DateTimeFormat`.
- Logical CSS properties throughout (`margin-inline-start` not `margin-left`) to support future RTL expansion.
- Amazon affiliate tag routing per country: `affiliate_tags` table keyed by ISO country code.

---

## 18. UI and Design System

### 18.1 Design Principles

- Mobile-first. All components at 375px, scaled to 1440px.
- No gradients in the primary UI.
- No purple hues in the colour palette.
- Light mode and dark mode from launch.
- Admin-configurable themes: admin uploads and activates custom themes (CSS variable overrides stored in the database).

### 18.2 Bottom Mobile Toolbar (5 tabs)

| Icon | Label | Destination |
|---|---|---|
| Home | Home | Social feed |
| Compass | Discover | Discovery and search |
| Feather | Write | Newbie Writer hub |
| Bookshelf | Shelf | User shelves |
| Person | Profile | User profile |

On desktop: left sidebar navigation rail or top navigation.

### 18.3 Colour System

CSS custom properties for all colour values. No hardcoded colours in component CSS. Light and dark theme files at `/styles/themes/light.css` and `/styles/themes/dark.css`.

### 18.4 Typography

Distinctive display font for headings. System-friendly variable font for body (self-hosted or `font-display: swap` to prevent render blocking). No generic fallbacks like Arial or Inter as the primary type choice.

### 18.5 Accessibility

- Minimum contrast ratio 4.5:1 (WCAG AA).
- Full keyboard navigation.
- `aria-label` on all icon-only buttons.
- Visible focus indicators.

---

## 19. SEO Requirements

- All book pages, author profile pages, and reading list pages server-side rendered with unique `<title>` and `<meta description>`.
- `og:image` on all shareable pages using server-side generated images.
- Dynamic XML sitemap including all public book pages, author profiles, and reading lists.
- `robots.txt` configured.
- Canonical URLs on all pages.
- JSON-LD structured data: `Book` schema on book pages, `Person` schema on author profiles.
- LCP target: under 2.5 seconds on 3G mobile.
- Writing Resource Library pages optimised for long-tail queries ("best books on how to write a novel", "top craft writing books for beginners").

---

## 20. Testing Requirements

### 20.1 End-to-End Tests (Playwright — Priority)

- User sign-up via Google OAuth and Telegram OAuth.
- Full onboarding flow (username, user type, genre selection).
- Add a book to shelf and log reading progress.
- Write and submit a review.
- Follow a user and verify feed update.
- Complete a reading challenge.
- Generate and share a book finished card.
- Author verification request and moderator approval.
- Newbie Writer submits a writing challenge response.
- Referral link generation and referral sign-up attribution.
- Tip a creator and verify commission split.
- Premium subscription activation and feature gate check.
- Admin activates a promoted listing.
- Community report flow through to moderator resolution.

### 20.2 Financial and Payment Tests

- Tip calculation (Decimal.js — verify 10% platform fee, 90% creator payout, 10% referral commission of platform's gross take).
- Premium subscription activation and access enforcement.
- Paystack webhook signature verification.
- Dodopayments webhook signature verification.
- Duplicate payment prevention (idempotency key test).
- Referral commission crediting and reversal on refund.
- Payout withdrawal minimum threshold enforcement.

### 20.3 Load Tests (k6 or Artillery)

- 1,000 concurrent users loading the discovery feed.
- 500 concurrent users submitting reviews simultaneously.
- Cache stampede simulation.
- Leaderboard refresh under concurrent read load.
- Referral code generation under concurrent sign-up load.

### 20.4 Unit Tests (Jest or Vitest)

- All financial calculation functions (Decimal.js wrappers).
- XP and level calculation.
- Affiliate link generation and fallback logic.
- Streak increment and freeze token logic.
- Referral code generation (uniqueness, no PII).
- Referral commission calculation.
- AI provider fallback and circuit breaker logic.
- Feature flag resolution logic.

---

## 21. MVP Build Sequence

### Phase 1 — Foundation

**Goal:** Deployable skeleton with authentication, user profiles, and basic book data.

- Project scaffold: Next.js 14, TypeScript, database abstraction layer (`DATABASE_PROVIDER` — Supabase · DigitalOcean · Railway), Redis client abstraction (ioredis/Upstash), S3-compatible storage abstraction.
- GitHub Actions CI/CD to Vercel.
- Authentication: Google OAuth and Telegram OAuth (Supabase Auth in Supabase mode; Redis/cookie sessions in direct PostgreSQL mode). Auth provider toggle in admin.
- User onboarding: username, user type selection, genre selection.
- Post-onboarding email and 2FA prompt system (periodic, non-blocking).
- User profile: create, edit, avatar upload.
- Mobile bottom toolbar (5 tabs).
- Light and dark mode toggle.
- PWA manifest and service worker scaffold.
- Book search via Google Books API with local database caching.
- Book page (metadata, buy links using affiliate store registry with static fallback).
- Affiliate store registry (admin-managed, extensible). Amazon primary. Non-affiliate external link fallback.
- i18n scaffold (next-intl, English only).
- RLS on all Supabase tables.
- Security headers and CSRF protection.
- Feature flags system.
- SETUP.md and HOW-IT-WORKS.md scaffolded in `/docs`.

**Deliverable:** A logged-in user can search for a book, view its page, and click an affiliate buy link. Admin can toggle auth providers.

---

### Phase 2 — Core Social Features

**Goal:** Reading tracker, reviews, feed, and following system.

- Shelf system (default and custom shelves, privacy controls).
- Reading progress tracker and session logging.
- Annual reading goal with public progress bar.
- Review submission (short, long-form, one-line, mood tags, spoiler toggle).
- Social feed (activity from followed users, cursor-based pagination).
- Follow / unfollow.
- Like and "want to read" reactions.
- In-app notification system.
- Goodreads CSV import.
- Quote posting and display.
- Basic XP system.
- Level titles on profiles.
- Shareable finished-book card (server-side image generation with `@vercel/og`).
- Report content (sends to moderation queue).

**Deliverable:** Users can track reading, write reviews, follow others, and share finished-book cards.

---

### Phase 3 — Discovery, Gamification, and Virality

**Goal:** Robust discovery, full gamification, and viral mechanics.

- Discover tab: trending books, country trending, mood-based AI search.
- AI recommendation layer (DeepSeek/Gemini) — mood matching.
- Nightly cron: shelf-overlap recommendation pre-computation.
- Full badge system.
- Leaderboards (global, national, friend circle).
- Reading streaks and freeze tokens.
- Reading lists (create, follow, fork, share).
- Community challenges (weekly and monthly reading challenges).
- Shareable challenge completion cards.
- Reading Wrapped (activate for first December after launch, or on goal completion).
- Pass the Book chain.
- Referral system (numeric referral code, 200 XP + 10% commission, referral leaderboard).
- Referral badges (Connector, Ambassador, Liravo Builder).
- Book Debates.
- Seasonal events admin tools and first seasonal event.

**Deliverable:** Discovery and social engagement are self-sustaining. Viral and referral loops are active.

---

### Phase 4 — Moderation and Community Trust

**Goal:** Community moderation infrastructure so the platform can scale without admin bottleneck.

- Moderator role (grant/revoke via admin).
- Moderation queue (moderator and admin views).
- Report queue processing (approve, edit, remove, warn, escalate).
- Community Notes (admin-toggleable).
- Automated moderation: on-device tone classifier on review submit.
- Spam detection on repeated submissions.
- Appeal form in account settings.
- Moderator action log.

**Deliverable:** The platform can handle content moderation without admin reviewing every report.

---

### Phase 5 — Author and Creator Tools

**Goal:** Activate the author and creator personas.

- Author profile enhancements (catalog, Q&A, from-the-author posts, ARC distribution).
- Author verification (moderator-reviewed, admin-approved).
- Creator profile with analytics dashboard.
- Tip button (Dodopayments + Paystack, 10% platform fee, referral commission).
- Creator leaderboard.
- Buddy reads (two-person and group).
- Reading Together Rooms.
- Promoted listings (admin-activated for now).
- Events system (free and paid, 10% platform fee).
- Email digests (paid tier only): welcome, weekly activity, new release alerts.

**Deliverable:** Authors can build audiences. Creators can earn tips. Promoted listings are live.

---

### Phase 6 — Newbie Writer Track

**Goal:** Activate the Newbie Writer persona and associated affiliate revenue.

- Write tab and Newbie Writer hub.
- Daily prompts (AI pre-generated in batches, stored in database).
- Weekly and monthly writing challenges.
- Writing Workshop Rooms (small group critique).
- Writing progress tracker (words, challenge completions, writing streak).
- Craft book recommendation sections (affiliate-linked).
- Writing Resource Library page (SEO-optimised).
- Writing badges.
- Ask a Writer feature.
- Writing challenge shareable card.
- AI-powered personalised writing challenge and weekly plan (paid tier, nightly cron).
- AI writing feedback on challenge submission (paid tier, triggered on submit).

**Deliverable:** Newbie Writers have a full feature set. Craft book affiliate revenue stream is active. Paid tier has a clear value proposition for writers.

---

### Phase 7 — Monetisation Polish and Full Admin Tooling

**Goal:** All revenue streams reliable, admin has full operational control.

- Premium subscription tier (Dodopayments) with full feature gating.
- Reading statistics dashboard (premium).
- AI taste profile generation (premium, on demand + annual refresh).
- Unlimited custom shelves gate (free: 10, premium: unlimited).
- Full admin panel completion (all sections in Section 13).
- Affiliate link health monitoring (nightly cron for top 500 books).
- Amazon Product Advertising API integration (replacing static fallback links when PA API access is granted).
- Promoted listings automation (payment webhook triggers activation, removing manual admin step).
- Referral commission payout processing in the earnings dashboard.
- Earnings dashboard for all users (tips, commissions, event revenue).
- Complete test suite (E2E, financial, load tests).
- Final documentation pass (SETUP.md and HOW-IT-WORKS.md completed to full spec).
- Seed content fully loaded before public launch.

**Deliverable:** All revenue streams operational. Seed content in place. Platform ready for public launch.

---

### Phase 8 — Internationalisation and Expansion

**Goal:** Expand beyond English-speaking markets.

- French localisation.
- German localisation.
- Locale-specific Amazon affiliate tag routing (per country affiliate tag via `affiliate_tags` table).
- Country-specific trending and leaderboards for Tier 2 and Tier 3 markets.
- Audible regional CTAs (Audible.fr, Audible.de, etc.).
- RTL layout support scaffold.
- Additional affiliate store partnerships for non-Amazon markets.

---

## 22. Documentation Requirements

Documentation in `/docs` at the root of the repository.

### SETUP.md

Assume a developer who has not deployed a Next.js app before. Cover in full:

- Project overview and architecture summary.
- Complete environment variable reference: every variable, what it does, where to get the value, required vs optional.
- Where to place env vars: `.env.local` for local dev, Vercel dashboard for production.
- **Database provider selection:** how to choose between Supabase, DigitalOcean, and Railway; the `DATABASE_PROVIDER` env var; which other env vars are required for each provider.
- **Supabase setup:** create project, run migrations, configure RLS, configure Google and Telegram auth providers, Supabase Storage setup.
- **DigitalOcean setup:** create managed PostgreSQL cluster, configure PgBouncer connection pooling, set `DATABASE_URL` with SSL, run migrations via `DATABASE_DIRECT_URL`, configure S3-compatible storage bucket.
- **Railway setup:** provision PostgreSQL service, obtain `DATABASE_URL` (PgBouncer) and `DATABASE_DIRECT_URL` (direct), run migrations, configure S3-compatible storage.
- **Adding a new database provider:** walkthrough of the five-step process in Section 5 (provider.ts → pg.ts → server.ts → getCurrentUser.ts → storage/provider.ts).
- Redis setup: ioredis (self-hosted on Railway or Render free tier) and Upstash (free tier).
- Google OAuth setup (Google Cloud Console walkthrough, step by step).
- Telegram OAuth setup (BotFather walkthrough, step by step).
- Amazon Associates account setup and affiliate tag configuration.
- Amazon Product Advertising API access: how to apply, the 3-sale requirement, and how to switch from the static fallback to the dynamic API.
- Affiliate store registry: how to add a new store from the admin panel.
- Paystack: account creation, API keys, webhook configuration and secret.
- Dodopayments: account creation, API keys, webhook configuration and secret.
- Transactional email (Resend or equivalent free tier): account setup, domain verification.
- Vercel: link GitHub repo, configure env vars in dashboard, domain setup for liravo.org.
- cron-job.org: how to set up each sub-daily cron job, the `CRON_SECRET` header pattern, and which endpoints to target.
- How to seed the database (running the seed script, Liravo Editors account creation).
- Protecting secrets: what must never be committed.
- **Secret rotation runbook:** step-by-step for rotating JWT secret, payment webhook secrets, AI API keys — with zero downtime procedure.
- **Backup and restoration runbook:** Supabase scheduled backup configuration, how to restore from a backup, point-in-time recovery procedure.
- **Deployment and rollback runbook:** how to deploy an updated version via GitHub Actions, how to roll back a failed deployment on Vercel, how to run database migration rollbacks.

### HOW-IT-WORKS.md

Detail every feature, technical decision, and operational process. Cover:

- All user-facing features by persona.
- Admin panel features and every workflow.
- Moderation architecture (tiers, community notes, automated moderation, appeals).
- Monetisation flows (affiliate links including non-affiliate fallback, subscriptions, tips, promoted listings, events, referral commissions).
- Gamification system (XP, levels, badges, streaks, leaderboards, seasonal events).
- Referral system (code format, attribution, commission accounting, payout).
- AI layer (provider selection, circuit breaker, model config, on-device AI, which features use AI and when).
- Seed content: what was seeded, the Liravo Editors account, and how to add to it.
- Affiliate store registry: how it works, how to add a store, priority logic.
- Book availability logic (Amazon affiliate → other affiliate stores → non-affiliate external links → no link).
- Caching architecture and invalidation.
- Feed generation and pre-computation.
- Session and token flow (JWT, refresh rotation, Redis invalidation).
- Payment flows (tip, subscription, promoted listing, event ticket, referral commission).
- Cron job schedule (which job does what, how often, which service runs it).
- Feature flag system.
- i18n architecture: how to add a new locale, how to add a new Amazon affiliate region.
- Database schema overview with key relationships.
- **Multi-database architecture:** how the abstraction layer works, the role of each file in `src/lib/db/`, how provider detection flows through the supabase client layer, auth, and storage, and the step-by-step process for adding a new provider.
- How to add a new theme.
- How to add a new badge type.
- How to add a new affiliate store.
- Security architecture overview.

---

## 23. Known Constraints and Mitigations

| Constraint | Mitigation |
|---|---|
| Vercel Hobby Plan: 1 cron job per day | Sub-daily jobs via cron-job.org hitting `CRON_SECRET`-protected API route endpoints. Documented in SETUP.md. |
| Vercel Hobby Plan: no background jobs | Long-running tasks (CSV import, Wrapped generation) broken into chunks via sequential API calls or Supabase Edge Functions. |
| Vercel Hobby Plan: 10-second function timeout | All API routes complete under 10 seconds. Long AI calls use streaming or async job queues. |
| Amazon PA API: requires 3 qualifying sales before full access | Launch with static affiliate link fallback (Amazon search URL + affiliate tag). Apply for PA API immediately. Transition to dynamic links on approval. |
| Supabase free tier: 500 MB database, 2 GB bandwidth | Nightly pruning cron for old notifications, expired leaderboard snapshots, stale feed caches. Supabase CDN for image serving. |
| Google Books API: rate limits | All metadata cached in local database after first fetch. Never call the API for a book already in the database. |
| DeepSeek API: occasional unavailability | Gemini fallback fully implemented. Circuit breaker: 3 failures in 5 minutes routes to Gemini for 10 minutes. |
| On-device AI: 50 MB model size cap | Quantised ONNX / WASM models. MobileBERT or DistilBERT variants for classification. |
| No SMS: account recovery | Google and Telegram native recovery, optional email recovery, optional 2FA recovery codes, admin-assisted recovery. All documented and accessible in the UI. |
| Email only for paid tiers | All transactional email infrastructure still needed (email verification link, recovery links). Use Resend free tier which covers transactional volume. Marketing/digest email gated behind paid tier in the product logic. |
| AI cost management | All AI features are pre-computed in batch (nightly cron) wherever possible. Per-request AI calls limited to paid tier features. On-device models used for free-tier inference where quality is acceptable. |
| Books not on Amazon | Non-affiliate external link system covers this from day one. Click data on non-affiliate links informs future affiliate program priorities. Admin can add new affiliate stores via the registry without code changes. |
| Database vendor lock-in | Database abstraction layer (`src/lib/db/`) isolates all provider-specific code. Supabase is the default and lowest-friction starting point. Switching to DigitalOcean or Railway requires only environment variable changes. Adding a further provider (Neon, Render, PlanetScale) requires editing five files and no application-layer code. |
| Supabase free tier PostgreSQL limits | The database abstraction means the team can migrate to a paid managed PostgreSQL provider (DigitalOcean, Railway) by changing `DATABASE_PROVIDER` — no code changes and no data migration (same PostgreSQL schema). |

---

*End of Liravo PRD v1.1*

### Development verification update (26 October 2026)

Financial webhooks and payout reservations now commit state and audit records atomically; browser roles cannot alter administrative, premium or XP fields. Social retries use durable intents and one reward per actor/target/action. Browser mutations require CSRF tokens. Cron jobs share Bearer authentication, renewable overlap locks and 60-second Vercel runtime limits; Hobby schedules are daily or less. The current verification matrix in `custom-bugs-verification.md` distinguishes completed fixes from remaining gaps; it supersedes the earlier 100% claim.

XP is now awarded from verified activity and a durable per-user event ledger; client-supplied activity names alone cannot mint rewards. Subscription intents and cancellation update state/audit atomically; gateway adapters still require sandbox verification.

Billing returns users to an entitlement-checked pending-confirmation page; browser redirects never activate Premium. Locale preferences now persist in the profile and browser, and Premium checkout has English/French/German catalogs and locale-aware prices. Full UI translation remains tracked separately.

Development audit: migrations 029–031 restrict private profile data and RPC access, add weekly digest receipts, and expose service-only financial reconciliation counts through outbox drain. Public metadata honors profile privacy and supported language URLs. The audit retains unresolved work explicitly; provider sandbox validation is required before enabling live billing.

Content retry handling: primary content, lists, rooms, events, author content, workshop drafts/feedback, reports and appeals commit durable replay snapshots with their records. Workshop capacity, free-event RSVP, list forks and final debate votes are transactional; private discussions enforce membership. Badge awards commit XP/notifications once, and author announcements deliver through a paged outbox. Author replies/verification, ARC decisions, moderation and book-chain passes now commit durable responses and effects together; ARC slots are serialized, appeals require an independent reviewer, and list-follow counts use desired-state transactions. Book/helpfulness toggles, buddy capacity and streak updates are transactional. Login text is localized, with source-reference and untranslated-label checks in CI. Wider translation and provider lifecycle gaps remain tracked in the audit.

Admin operations now keep cron credentials server-side, show integrity alerts, and use localized controls. Concurrent provider changes preserve one enabled sign-in provider. Referral binding/reward/notification commit together, and browser profile writes cannot replace referral identity. These paths are included in the database rehearsal.

Tip checkout redirects to the payment provider and displays pending/failed/confirmed status from verified webhooks. Subscription cancellation remains pending until provider confirmation; paid access continues until its verified expiry. Admin operations show financial integrity alerts and thresholded security/payment/cron counters in all supported locales.

Writer submissions, joins, votes and best-answer selection now commit durable replay results with their counters and rewards. Daily prompt publication recovers partial saves. Prompt/challenge pages use all supported locales and expose pending, error and selected states accessibly.

Google Play billing binds purchases to opaque registered app accounts before opening the billing sheet. Verified V2 state/expiry drives access; acknowledgement follows the durable entitlement commit. Authenticated RTDN deliveries retry dependency failures and reject conflicting replay. Complimentary grants and paid providers contribute independently to premium access. Google Play cancellation is managed in the Play Store and preserves the paid period.

Creator payouts now use the reservation ledger through settlement. Balances stay separate by currency, destinations are captured per request, and approval races safely with user cancellation. Confirmed Paystack transfers or audited manual bank receipts finalize payouts; ambiguous responses retain funds for reconciliation. The admin dashboard exposes approval, settlement and historical reconciliation, and both web and native earnings forms send explicit amounts.

Capture-linked refunds now adjust creator credit, commissions and tip XP atomically. Partial refunds preserve paid service until expiry; full refunds revoke only that payment’s period. Duplicate charges do not duplicate benefits and remain visible for reconciliation. Paystack provides a 30-day pass; Dodo cancellation stops renewal while preserving paid time. Premium and tip receipts show verified periods/refund state.
