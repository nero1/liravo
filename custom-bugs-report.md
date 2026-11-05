# Custom Bugs Report

Date/time: 05 November 2026, 03:38 PM WAT (Africa/Lagos)

Audited source: `4fb2410b8f311422dc2b542b32d60fcb15cb1d84`. Status: ✅ fixed and verified; 🟡 partial; 🔵 pending. Original findings remain below; STATUS records describe the verified changes.

## One-line findings

1: 🔵 BUG-20261105-001: [High] Installed dependencies have critical and high security advisories
2: ✅ BUG-20261105-002: [High] Supabase browser reads bypass profile and shelf privacy
3: ✅ BUG-20261105-003: [High] Author readers expose profile fields without follower authorization
4: 🟡 BUG-20261105-004: [High] Web-push endpoints permit server requests to private network targets
5: 🟡 BUG-20261105-005: [High] Device push registrations survive logout and can belong to two accounts
6: 🟡 BUG-20261105-006: [High] Outbox events finish before external push delivery completes
7: ✅ BUG-20261105-007: [High] Supabase middleware drops earlier refreshed authentication cookie chunks
8: 🟡 BUG-20261105-008: [Medium] Push registration endpoints acknowledge failed database writes
9: ✅ BUG-20261105-009: [Medium] Middleware consumes multipart uploads before enforcing route size limits
10: 🟡 BUG-20261105-010: [Medium] Native authentication destroys valid sessions during temporary outages
11: ✅ BUG-20261105-011: [Medium] Sensitive administrative SQL routines accept deleted administrators
12: ✅ BUG-20261105-012: [Medium] Onboarding follow buttons call a nonexistent endpoint
13: 🔵 BUG-20261105-013: [Medium] Computed book recommendations use a column absent from the schema
14: ✅ BUG-20261105-014: [Medium] Author inspiration shelves query a nonexistent reading-list title
15: ✅ BUG-20261105-015: [Medium] Quote pagination loses records with matching timestamps
16: 🔵 BUG-20261105-016: [Medium] Writing leaderboards aggregate truncated or unbounded client-side result sets
17: 🔵 GAP-20261105-017: [Medium] Similar-book computation scales quadratically and never resumes past its cap
18: 🔵 BUG-20261105-018: [Medium] Several cron jobs report success after database failures
19: 🟡 BUG-20261105-019: [Medium] Unavailable tone classifiers are reported as safe or neutral
20: 🟡 BUG-20261105-020: [Medium] Failed mutation intent caches grow without bounds or account cleanup
21: 🟡 BUG-20261105-021: [Medium] Native notification taps never navigate to their destination
22: 🟡 GAP-20261105-022: [Medium] AI writing feedback ignores the selected language
23: 🔵 GAP-20261105-023: [Medium] Account export omits several categories of user-authored data
24: 🔵 GAP-20261105-024: [Medium] Account exports build the entire history in database and application memory
25: 🔵 BUG-20261105-025: [Medium] Sitemaps include noncanonical/private entries and silently truncate the catalog
26: 🔵 BUG-20261105-026: [Low] Robots and root social metadata hard-code the production domain
27: 🔵 GAP-20261105-027: [Medium] Author posts and reading-session history have no continuation cursor
28: 🔵 GAP-20261105-028: [Medium] Nonfinancial operational data grows without an archival policy
29: 🔵 GAP-20261105-029: [Medium] Direct PostgreSQL has no application query deadline or queue budget
30: 🔵 GAP-20261105-030: [Medium] Drizzle coverage is zero and database contracts bypass TypeScript checking
31: 🔵 BUG-20261105-031: [Medium] Redis lease loss does not stop the previous worker
32: ✅ BUG-20261105-032: [Medium] The health endpoint reports HTTP success when all dependencies fail
33: 🟡 GAP-20261105-033: [Low] Production CSP still permits arbitrary inline scripts and eval
34: 🟡 GAP-20261105-034: [Medium] Two AI routes bypass the existing shared request deadline
35: ✅ BUG-20261105-035: [Medium] Direct PostgreSQL mode hides public book and author pages behind login

## Detailed findings

### 1: 🔵 BUG-20261105-001: [High] Installed dependencies have critical and high security advisories

FILES: `package.json`, `package-lock.json`, `mobile/package.json`, `mobile/package-lock.json`

PROBLEM: Fresh production dependency audits report 20 affected web packages (1 critical, 13 high) and 34 native packages (1 critical, 8 high). Next.js 14.2.35, DOMPurify 3.4.2 and Sharp 0.34.5 are installed in active application paths. The native critical result is transitive tar; install tooling and runtime exposure differ. Advisory counts establish dependency debt, not successful exploitation of every advisory or demonstrated RCE. Examples: [Next.js App Router DoS](https://github.com/advisories/GHSA-m99w-x7hq-7vfj), [Sharp/libvips](https://github.com/advisories/GHSA-f88m-g3jw-g9cj).

FIX: Upgrade affected direct dependencies and their dependency trees to supported patched releases. Review advisory applicability individually, including Next.js App Router and image processing, rather than forcing incompatible upgrades. Rebuild web and native bundles and exercise authentication, sanitization, uploads and navigation. Add dependency review to CI with an explicit process for time-limited exceptions.

### 2: ✅ BUG-20261105-002: [High] Supabase browser reads bypass profile and shelf privacy

FILES: `supabase/migrations/001_schema.sql:8461`, `supabase/migrations/001_schema.sql:9538`, `src/app/user/[username]/page.tsx`

PROBLEM: The users SELECT policy allows every row; shelf policies consider shelf.is_public without the owner's shelf_visibility. Using the complete schema and SET ROLE anon, a followers-only fixture exposed its private biography and private shelf contents. The application shelf reader rejected the same unrelated viewer. Explicit column/table grants make these reads reachable through the Data API; application page checks cannot close this alternate path.

FIX: Define consistent visibility rules for owner, followers and anonymous readers, including inactive owners. Apply them to RLS and privileged snapshot readers without recursive policies. Keep explicit least-privilege grants in the creating migration; do not grant blanket browser CRUD. Verify anonymous, unrelated, follower, owner and deactivated-account reads directly under database roles and through the Data API.

STATUS: ✅ Fixed in the foundation batch. Verified with browser-role SQL checks, handler/component regressions, and the full PostgreSQL/Redis-backed suite (639 passing tests).

### 3: ✅ BUG-20261105-003: [High] Author readers expose profile fields without follower authorization

FILES: `src/app/api/author/[username]/route.ts`, `src/app/(app)/author/[username]/page.tsx`, `src/lib/author-catalog.ts`

PROBLEM: The author API uses service credentials to return biography, banner and external links without reading profile_visibility or authorizing followers. The author page also omits that authorization, although its metadata explicitly treats nonpublic profiles as private. An isolated execution of the real API returned HTTP 200 and the fixture biography to an anonymous viewer. Fixing browser RLS alone leaves the privileged API exposed.

FIX: Share the normal profile visibility decision with author API and page readers before selecting private profile fields. Define any deliberately public author catalog fields separately from the private profile document. Return the same unavailable/private behavior across providers and verify anonymous, unrelated, follower and owner requests.

STATUS: ✅ Fixed in the foundation batch. Verified with browser-role SQL checks, handler/component regressions, and the full PostgreSQL/Redis-backed suite (639 passing tests).

### 4: 🟡 BUG-20261105-004: [High] Web-push endpoints permit server requests to private network targets

FILES: `src/app/api/users/web-push/route.ts`, `src/lib/push-notifications.ts`

PROBLEM: Subscription validation accepts arbitrary URL hosts and stores them for web-push.sendNotification. Registration accepted https://127.0.0.1:8443/private-admin with valid generated subscription keys; the actual web-push SDK also generated a request for it. When VAPID is configured, a later notification can send a blind server-side request to that target. No private network request was sent during this audit.

FIX: Validate supported HTTPS push-service origins at registration and delivery. Reject credentials, private/link-local/loopback addresses, unsafe DNS resolutions and redirects; enforce network egress restrictions where available. Validate key formats and endpoint lengths, cap subscriptions per account, rate-limit registration and set delivery deadlines. Test address variants and DNS changes without contacting internal services.

STATUS: 🟡 Push service origins, keys, destination DNS and IPv4/IPv6 ranges are validated at registration and connection. Regression checks reject private and transition addresses without contacting internal targets.

### 5: 🟡 BUG-20261105-005: [High] Device push registrations survive logout and can belong to two accounts

FILES: `mobile/hooks/useAuth.ts`, `mobile/hooks/usePushNotifications.ts`, `src/app/api/users/push-token/route.ts`, `supabase/migrations/001_schema.sql`

PROBLEM: Logout removes authentication but never unregisters the device push token. Registration updates only the current user, and users.push_token is not unique. The schema accepted the same fixture token on two accounts. After a shared device switches accounts, notifications for the previous account can still reach that device. Web subscriptions also need explicit logout lifecycle handling.

FIX: Represent subscriptions as owned device/session registrations. Atomically rebind a token when its account changes, revoke the current device registration during logout and handle failed revocation explicitly. Prevent stale asynchronous registration from attaching to a new account. Verify logout, account switching, reinstall/token rotation and notification delivery without deleting other active devices.

STATUS: 🟡 Session-owned registrations rebind atomically and are revoked independently of authentication cleanup. SQL and native regressions cover logout, stale registration and account changes.

### 6: 🟡 BUG-20261105-006: [High] Outbox events finish before external push delivery completes

FILES: `src/lib/outbox-worker.ts`, `src/lib/push-notifications.ts`, `supabase/migrations/001_schema.sql:4930`

PROBLEM: process_outbox_event_atomic commits processed status before sendPushToUser, which is started without awaiting it. The real worker returned processed:1, failed:0 while the fixture delivery remained pending. Serverless suspension or provider failure then loses delivery without an eligible outbox retry. Logging the rejected promise does not provide a durable delivery receipt.

FIX: Separate committed database effects from external delivery status. Claim and await bounded delivery attempts, persist success or retry/dead-letter receipts, and retain a stable event identity. Preserve existing once-only database effects when retrying delivery. Explicitly define duplicate-tolerant push semantics and test termination, provider failure and lost acknowledgements.

STATUS: 🟡 Database effects queue durable delivery children; the worker awaits bounded transport and per-device acknowledgements. SQL and worker regressions cover replay, retries and stale claims.

### 7: ✅ BUG-20261105-007: [High] Supabase middleware drops earlier refreshed authentication cookie chunks

FILES: `src/middleware.ts:93`, `src/lib/supabase/server.ts`

PROBLEM: Every cookie set/remove callback replaces NextResponse.next, discarding cookies previously written to the response. In an isolated real-middleware execution, refreshing sb-auth-token.0 and sb-auth-token.1 returned only the second chunk and the CSRF cookie. Chunked or multiple-cookie refreshes can therefore leave the browser with an unreadable or stale session.

FIX: Use the supported batch cookie API or accumulate all cookie mutations on one response, including deletions and redirect responses. Forward the refreshed request cookies consistently. Verify two or more chunks, old-chunk deletion, refresh followed by redirect, and the next request using the returned cookie jar.

STATUS: ✅ Fixed in the foundation batch. Verified with browser-role SQL checks, handler/component regressions, and the full PostgreSQL/Redis-backed suite (639 passing tests).

### 8: 🟡 BUG-20261105-008: [Medium] Push registration endpoints acknowledge failed database writes

FILES: `src/app/api/users/web-push/route.ts`, `src/app/api/users/push-token/route.ts`

PROBLEM: Both registration routes and their delete handlers discard mutation errors and return ok:true. The real web-push handler returned HTTP 200 when the database fixture rejected its upsert. Devices can believe registration or revocation succeeded while the stored delivery destination remains unchanged. The web-push DELETE handler also parses malformed JSON without a controlled response.

FIX: Validate each request, inspect mutation errors and confirm the intended account-owned result before acknowledging success. Return a retryable dependency failure when persistence fails. Make register/unregister idempotent and surface recoverable failures to clients; verify rejected writes, missing accounts and malformed deletion requests.

STATUS: 🟡 Registration and deletion validate bounded requests and persistence receipts. Failed writes return retryable errors instead of successful acknowledgements.

### 9: ✅ BUG-20261105-009: [Medium] Middleware consumes multipart uploads before enforcing route size limits

FILES: `src/middleware.ts:49`, `src/lib/profile-avatars.ts:11`, `src/app/api/users/avatar/route.ts`

PROBLEM: When the CSRF header is absent, middleware calls request.clone().formData() before route authentication and bounded avatar parsing. Rechecking against the actual 3 MB avatar limit, a 4 MB fixture caused the old middleware to consume 4,194,613 bytes before the bounded reader ran. Vercel ingress limits reduce the maximum exposure but do not enforce the application limit; self-hosted deployments depend on their proxy limits.

FIX: Require the CSRF header for binary uploads and reject oversized bodies before parsing them. Keep streamed byte limits and deadlines in upload handlers. If ordinary forms need a token fallback, use a tightly bounded parser. Verify absent/spoofed Content-Length, oversized multipart fields and slow uploads at middleware and route boundaries.

STATUS: ✅ Fixed in the foundation batch. Verified with browser-role SQL checks, handler/component regressions, and the full PostgreSQL/Redis-backed suite (639 passing tests).

### 10: 🟡 BUG-20261105-010: [Medium] Native authentication destroys valid sessions during temporary outages

FILES: `mobile/hooks/useAuth.ts`

PROBLEM: Initialization, provider-session exchange and fetchProfile catch every error by signing out. A stored valid-token fixture receiving HTTP 503 invoked signOut and cleared its session. Offline operation, timeouts and recoverable backend errors therefore behave like credential revocation and can repeatedly force users through login.

FIX: Distinguish confirmed unauthorized/revoked sessions from transport, timeout and server failures. Preserve valid stored credentials during temporary failures, expose a retry/offline state and retry with bounded backoff. Clear authentication only when revocation is established. Verify cold start offline, 503 recovery, expired credentials and account switching during retries.

STATUS: 🟡 Native verification preserves credentials during temporary outages, including initial provider recovery. Server session readers distinguish dependency failures from rejected credentials; retry and account-switch regressions pass.

### 11: ✅ BUG-20261105-011: [Medium] Sensitive administrative SQL routines accept deleted administrators

FILES: `supabase/migrations/001_schema.sql:3141`, `supabase/migrations/001_schema.sql:6629`, `supabase/migrations/001_schema.sql:6728`

PROBLEM: claim_payout_request, set_premium_override_atomic and settle_payout_request check is_admin and is_banned but omit deleted_at. The complete schema allowed a deleted administrator to grant premium and claim a manual payout. HTTP authentication checks inactive accounts earlier, so the exposed gap is database defense and deactivation between authentication and execution, not unrestricted access to these service-only routines.

FIX: Recheck the complete active-administrator predicate while holding the existing actor lock inside every sensitive routine. Keep automated provider settlement authorization separate from human administration. Verify deletion, banning and role revocation between request authentication and SQL execution, including both claim and settlement paths.

STATUS: ✅ Fixed in the foundation batch. Verified with browser-role SQL checks, handler/component regressions, and the full PostgreSQL/Redis-backed suite (639 passing tests).

### 12: ✅ BUG-20261105-012: [Medium] Onboarding follow buttons call a nonexistent endpoint

FILES: `src/components/auth/OnboardingFlow.tsx:90`, `src/app/api/users/[id]/follow/route.ts`

PROBLEM: The active onboarding follow handler sends POST/DELETE to /api/follows, but no such route exists. The implemented follow route is /api/users/[id]/follow. Route inventory and the rendered button callback confirm this is executable code, so suggested follows fail instead of creating the selected relationship.

FIX: Use the existing target-specific follow route and its expected method and acknowledgement contract. Keep the pending state and intended follow direction consistent during retries. Verify follow, unfollow, failed requests and completion of onboarding with persisted relationships.

STATUS: ✅ Fixed in the foundation batch. Verified with browser-role SQL checks, handler/component regressions, and the full PostgreSQL/Redis-backed suite (639 passing tests).

### 13: 🔵 BUG-20261105-013: [Medium] Computed book recommendations use a column absent from the schema

FILES: `src/app/api/cron/similar-books/route.ts:55`, `src/app/(app)/book/[id]/page.tsx:170`, `supabase/migrations/001_schema.sql:1317`

PROBLEM: similar_books_computed defines similar_ids, while the cron writes and book page selects similar_book_ids. Executing the select against the complete schema raised PostgreSQL 42703. Ignored query/upsert errors hide the failure behind fallback recommendations and successful processed counts. The page also uses maybeSingle across an edition family, which needs a defined selection rule when multiple computed rows exist.

FIX: Align writer, reader and typed schema on one field and canonical edition/work identity. Select one deterministic recommendation record or deliberately aggregate the family. Propagate persistence errors and verify the cron-to-page round trip, including aliases, merged editions, multiple records and empty results.

### 14: ✅ BUG-20261105-014: [Medium] Author inspiration shelves query a nonexistent reading-list title

FILES: `src/app/(app)/author/[username]/page.tsx:109`, `supabase/migrations/001_schema.sql`

PROBLEM: The author page selects id,title from reading_lists, whose display field is name. The complete schema raised PostgreSQL 42703 for that projection. The page discards the error and consequently omits the author's inspired_by shelf even when a valid public list and books exist.

FIX: Select the actual name field or omit the unused display field. Distinguish a missing inspiration list from a failed query and retain the appropriate privacy checks. Verify an author with a populated public inspiration list, an empty list and a database failure.

STATUS: ✅ Fixed in the foundation batch. Verified with browser-role SQL checks, handler/component regressions, and the full PostgreSQL/Redis-backed suite (639 passing tests).

### 15: ✅ BUG-20261105-015: [Medium] Quote pagination loses records with matching timestamps

FILES: `src/app/api/books/[id]/quotes/route.ts`

PROBLEM: The endpoint orders only by created_at and uses a strict timestamp-only cursor. With 21 quotes sharing a timestamp, page one returns 20 and page two returns zero, leaving one quote unreachable. Imported content and concurrent inserts commonly produce tied timestamps. Raw cursor strings also lack the validation used by newer pagination helpers.

FIX: Use a validated composite created_at/id cursor and matching deterministic ordering and index. Preserve the cursor across canonical edition-family reads. Verify tied timestamps, adjacent pages, inserts between requests, invalid cursors and an empty final page without omissions or duplicates.

STATUS: ✅ Fixed in the foundation batch. Verified with browser-role SQL checks, handler/component regressions, and the full PostgreSQL/Redis-backed suite (639 passing tests).

### 16: 🔵 BUG-20261105-016: [Medium] Writing leaderboards aggregate truncated or unbounded client-side result sets

FILES: `src/app/api/write/prompts/leaderboard/route.ts`, `src/app/api/write/challenges/[id]/route.ts`

PROBLEM: Both routes retrieve individual submissions and aggregate them in JavaScript. Supabase Data API response caps can truncate the input before ranking; direct PostgreSQL instead returns the full history and expands memory/network cost. Prompt leaderboard read errors also become an empty successful result. Rankings therefore depend on provider limits and data volume rather than complete submission totals.

FIX: Aggregate and rank in SQL with indexed period/challenge predicates and bounded output. Apply account visibility and inactive-user rules before ranking, validate period inputs and distinguish dependency errors from an empty leaderboard. Verify datasets above the configured Data API cap and equivalent results across providers.

### 17: 🔵 GAP-20261105-017: [Medium] Similar-book computation scales quadratically and never resumes past its cap

FILES: `src/app/api/cron/similar-books/route.ts`

PROBLEM: The cron compares every selected book against every other book, sorts each candidate set and writes sequential batches. At its 5,000-book cap that is about 25 million comparisons before sorting; books beyond the cap have no cursor or checkpoint. Supabase row caps may reduce the selected set further. There is no per-run work budget or resumable position.

FIX: Generate bounded candidates using indexed genre/language/author or similarity queries and compute top results per canonical work. Process stable cursor batches with a persisted checkpoint and deadline. Verify coverage above 5,000 books, partial-run recovery and measured cost within the configured hosting budget.

### 18: 🔵 BUG-20261105-018: [Medium] Several cron jobs report success after database failures

FILES: `src/app/api/cron/account-hardening/route.ts`, `src/app/api/cron/affiliate-health/route.ts`, `src/app/api/cron/similar-books/route.ts`, `src/lib/cron.ts`

PROBLEM: Account-hardening ignores user-query and notification-insert errors; affiliate-health ignores read/count/log errors; similar-books returns processed:0 on a failed read and ignores upsert results. Counters advance despite failed writes. Since the shared wrapper observes response.ok, these HTTP 200 responses suppress normal failure signals and scheduler retries.

FIX: Inspect every database result, count only acknowledged effects and return failure or an explicit partial/retryable result. Persist resumable progress where a batch can partially commit. Make notification/log writes idempotent under retries. Inject read, count and write failures and verify scheduler status, operational alerts and counters.

### 19: 🟡 BUG-20261105-019: [Medium] Unavailable tone classifiers are reported as safe or neutral

FILES: `next.config.mjs`, `src/lib/client/tone-classifier.ts`, `src/lib/tone-classifier.ts`, `src/app/api/books/[id]/reviews/route.ts`

PROBLEM: The browser classifier forces remote Hugging Face models, but connect-src excludes their host; load failure is permanently cached and returns safe. The server classifier returns neutral on provider failure, while review publication rejects only toxic results. Isolated executions reproduced safe and neutral during model failures. This makes unavailable moderation indistinguishable from an actual successful classification.

FIX: Represent classification unavailability explicitly. If moderation is required, queue content as pending for retry/review; if advisory, show unavailable rather than safe. Serve vetted model assets from an allowed origin or narrowly configure required origins without weakening the whole CSP. Verify CSP enforcement, model load failure and provider recovery.

STATUS: 🟡 Unavailable classifiers return an explicit unavailable state. Reviews remain private and pending until durable automated or staff moderation publishes them; SQL checks cover permissions, stale claims and once-only XP.

### 20: 🟡 BUG-20261105-020: [Medium] Failed mutation intent caches grow without bounds or account cleanup

FILES: `mobile/lib/api.ts`, `src/lib/client/csrf.ts`

PROBLEM: Implicit mutation keys are removed only after a successful acknowledgement. Fifty distinct permanent HTTP 422 failures retained 50 native Map entries and 50 browser sessionStorage entries. Native signatures retain serialized request content and sometimes the token when no user is loaded; browser signatures are not account-scoped. Neither implementation has bounded retention or logout cleanup.

FIX: Scope intents to the authenticated account, avoid retaining sensitive request/token material and bound entries by count and lifetime. Clear definitively rejected or abandoned operations and account-owned state on logout. Preserve keys for ambiguous committed operations and financial replay safety. Verify long sessions, permanent failures, interrupted acknowledgements and account switching.

STATUS: 🟡 Generic retry caches contain bounded, expiring hashes and clear on account changes or logout. Definitive failures are discarded while explicit financial proofs remain independent; stress and account-switch regressions pass.

### 21: 🟡 BUG-20261105-021: [Medium] Native notification taps never navigate to their destination

FILES: `mobile/hooks/usePushNotifications.ts`

PROBLEM: The registered notification-response listener reads data.url but executes no navigation. Push payloads contain destination URLs, so tapping an already-running app's notification cannot open the referenced book, tip or notification screen. Registration also starts an asynchronous promise without a rejection handler or account-lifecycle guard.

FIX: Route supported internal destinations through Expo Router, handling both response events and cold-start notification responses. Validate destinations against an internal allowlist. Catch registration failures and cancel/ignore stale account work. Verify foreground, background, cold-start, invalid-link and logout-during-registration cases on devices.

STATUS: 🟡 Native cold-start and live notification responses navigate through validated internal destinations with recipient checks, deduplication and listener cleanup. Regression checks pass.

### 22: 🟡 GAP-20261105-022: [Medium] AI writing feedback ignores the selected language

FILES: `src/app/api/write/ai-feedback/route.ts`, `src/app/api/ai/recommendations/route.ts`

PROBLEM: Unlike the recommendation route, writing feedback never reads the user's preferred locale or passes a requested response language to its model. Its cache key omits locale, so changing language can reuse the same response. The model may infer a language from submitted text, but the application does not honor or verify the user's selected language.

FIX: Resolve the supported account/request locale and include it in the model instruction, cache identity and returned receipt. Localize user-facing failure states through existing message catalogs. Verify English, French and German feedback, locale changes with an existing cache and fallback-provider responses.

STATUS: 🟡 Writing feedback uses the saved English/French/German locale in generation and cache identity. Locale, entitlement and dependency-failure regressions pass.

### 23: 🔵 GAP-20261105-023: [Medium] Account export omits several categories of user-authored data

FILES: `supabase/migrations/001_schema.sql:1678`, `src/app/api/users/export/route.ts`

PROBLEM: The account export includes reading history, reviews, quotes, reading sessions/goals, prompt submissions, XP and sent tips. It excludes owned workshop/challenge submissions, author posts and Q&A, debates and other authored records present in the schema. The current UI describes a limited subset, so this is a portability gap rather than evidence that the listed subset is falsely advertised.

FIX: Define the complete portable account-data contract and include all owned authored records and relevant financial history with stable identifiers and relationships. Exclude credentials, moderation secrets and other users' private data. Verify a fixture containing each supported content category and make the UI state any deliberate exclusions clearly.

### 24: 🔵 GAP-20261105-024: [Medium] Account exports build the entire history in database and application memory

FILES: `supabase/migrations/001_schema.sql:1678`, `src/app/api/users/export/route.ts`, `mobile/lib/account-export.ts`

PROBLEM: The export RPC performs unrestricted JSON aggregation of the account's histories. The API materializes and serializes the full document, even for CSV; native then parses and serializes it again. Large histories can exceed response, memory or request-duration limits despite per-account rate limiting. No resumable export or size-aware delivery path exists.

FIX: Produce exports in bounded, consistent-snapshot chunks or an asynchronous export job with a signed, expiring download. Stream file generation where supported and download directly to native storage. Retain ownership checks and cleanup. Verify large histories above hosting response limits, interrupted downloads and account changes during export.

### 25: 🔵 BUG-20261105-025: [Medium] Sitemaps include noncanonical/private entries and silently truncate the catalog

FILES: `src/app/sitemap.ts`, `src/app/(app)/book/[id]/page.tsx`, `src/app/user/[username]/page.tsx`

PROBLEM: Sitemap queries cap books at 5,000 and authors/lists at 2,000 without partitioning or cursors. Book aliases are included although their pages redirect to canonical editions. Author queries omit deleted/banned/profile visibility filters, and lists omit owner visibility checks. Query errors produce incomplete successful output. The static discover entry is also authentication-gated.

FIX: Generate indexed sitemap partitions using stable keyset pagination and explicit canonical/public visibility rules shared with readers. Exclude redirects, private/inactive owners and authentication-only pages. Surface generation failures, use actual modification dates and verify a catalog larger than every page/provider cap.

### 26: 🔵 BUG-20261105-026: [Low] Robots and root social metadata hard-code the production domain

FILES: `public/robots.txt`, `src/app/layout.tsx`, `src/constants/config.ts`

PROBLEM: robots.txt always advertises the liravo.org sitemap, and root Open Graph metadata hard-codes the same origin. Other URLs use NEXT_PUBLIC_APP_URL. Deploying to a supported custom domain therefore produces conflicting discovery and social URLs even when the application URL is configured correctly.

FIX: Generate robots metadata and root social URLs from the validated application origin already used for canonical URLs. Verify a custom-domain deployment and production separately, including sitemap discovery and absolute image/canonical URLs.

### 27: 🔵 GAP-20261105-027: [Medium] Author posts and reading-session history have no continuation cursor

FILES: `src/app/api/author/posts/route.ts`, `src/app/api/reading-sessions/route.ts`, `src/app/(app)/author/[username]/page.tsx`

PROBLEM: The author-post API returns only 20 records, the author page returns 10, and reading-session history returns 50. None returns a cursor to retrieve older records through that reader. Keeping a recent-items preview is reasonable, but there is no corresponding complete history path in these interfaces.

FIX: Keep bounded previews and add explicit history readers with composite timestamp/id cursors and load-more controls. Preserve owner and profile-visibility rules. Verify more records than each limit, tied timestamps, loading failures and access after account changes.

### 28: 🔵 GAP-20261105-028: [Medium] Nonfinancial operational data grows without an archival policy

FILES: `src/app/api/cron/affiliate-health/route.ts`, `src/lib/outbox-worker.ts`, `supabase/migrations/001_schema.sql`

PROBLEM: Processed outbox payloads, notifications and affiliate health logs have no bounded archival/retention job. Affiliate-health can append the same missing-click issue for 500 books every run without period deduplication. These histories accumulate indexes and storage indefinitely, increasing cheap-hosting pressure. Financial audit records and idempotency receipts require a different retention policy.

FIX: Define retention by record type, deduplicate repeated health findings and archive/purge eligible nonfinancial payloads in indexed batches. Monitor row counts and storage growth. Preserve immutable financial records and sufficient replay-prevention tombstones; verify that cleanup cannot re-enable duplicate payments or rewards.

### 29: 🔵 GAP-20261105-029: [Medium] Direct PostgreSQL has no application query deadline or queue budget

FILES: `src/lib/db/pg.ts`, `src/lib/db/query-builder.ts`, `.env.local.example`

PROBLEM: The direct driver configures connection and idle timeouts but no query/statement deadline or bounded waiting policy. DATABASE_POOL_MAX is parsed without validating its range, and each warm instance creates its own pool. An externally configured pooler helps connection count, but slow or locked queries can still occupy every local slot and accumulate waiting work.

FIX: Validate pool settings and enforce request-aware statement/lock deadlines, bounded queueing and dependency-failure handling. Size per-instance pools against the external pooler's total capacity and deployment concurrency. Avoid automatic retries of ambiguous writes. Verify lock contention, slow queries, pool exhaustion and recovery with measured concurrent traffic.

### 30: 🔵 GAP-20261105-030: [Medium] Drizzle coverage is zero and database contracts bypass TypeScript checking

FILES: `package.json`, `src/lib/db/query-builder.ts`, `src/lib/db/unified-client.ts`, `src/types/database.ts`

PROBLEM: No Drizzle dependency or import exists. The custom query builder accepts string table/column names, Database.Functions is Record<string,never>, and RPC calls commonly cast arguments to never. The confirmed similar_ids and reading-list field mismatches survive lint/type checks, demonstrating an actual contract gap. Zero Drizzle coverage also misses the explicitly requested coverage goal.

FIX: Generate accurate table and RPC contracts from the canonical schema and remove unchecked casts. Introduce typed Drizzle schema/query coverage for direct database access in measured stages, retaining transactional SQL routines for financial invariants. Track coverage explicitly and exercise contract queries against both direct PostgreSQL and Supabase.

### 31: 🔵 BUG-20261105-031: [Medium] Redis lease loss does not stop the previous worker

FILES: `src/lib/locks.ts`, `src/lib/cron.ts`, `src/app/api/ai/recommendations/route.ts`

PROBLEM: The heartbeat ignores compareExpire returning zero and suppresses renewal errors. The task keeps running after ownership is lost; an isolated execution completed its task after a zero renewal result. Once the lease expires, another worker may acquire it concurrently. Existing database financial claims limit their own effects, but raw cron writes and expensive generation do not gain that protection automatically.

FIX: Propagate lease loss through an abort signal and require fencing tokens or durable database claims for effects that must exclude stale workers. Make remaining effects idempotent and report renewal failures. Verify ownership replacement, prolonged Redis loss, overlapping invocations and cancellation before the next irreversible effect.

### 32: ✅ BUG-20261105-032: [Medium] The health endpoint reports HTTP success when all dependencies fail

FILES: `src/app/api/health/route.ts`

PROBLEM: The endpoint always returns HTTP 200. With both database and Redis failing, executing the real handler returned status:degraded with HTTP 200. Standard HTTP uptime checks therefore remain green unless configured to inspect JSON; monitoring the application's availability becomes dependent on a custom body rule.

FIX: Return HTTP 503 for failed readiness dependencies with Cache-Control:no-store, while keeping a separate lightweight liveness response if needed. Bound each probe and expose only minimal diagnostics. Verify healthy, single-dependency failure, total failure and recovery using ordinary HTTP status monitoring.

STATUS: ✅ Fixed in the foundation batch. Verified with browser-role SQL checks, handler/component regressions, and the full PostgreSQL/Redis-backed suite (639 passing tests).

### 33: 🟡 GAP-20261105-033: [Low] Production CSP still permits arbitrary inline scripts and eval

FILES: `next.config.mjs`

PROBLEM: The production script-src includes both unsafe-inline and unsafe-eval. These remove useful CSP containment if a separate injection defect is introduced. Existing sanitization and escaped JSON-LD are present; this finding is a defense-in-depth gap and does not establish a working XSS exploit.

FIX: Adopt per-response nonces or hashes for required scripts and remove broad eval permission after validating actual library requirements. If browser inference needs WebAssembly support, grant only the narrow capability required. Exercise Next.js hydration, Telegram, hCaptcha and inference under report-only CSP before enforcement.

STATUS: 🟡 Production CSP uses per-request nonces and restricted script capabilities. Theme, JSON-LD and offline scripts receive the nonce; final production browser verification is in progress.

### 34: 🟡 GAP-20261105-034: [Medium] Two AI routes bypass the existing shared request deadline

FILES: `src/app/api/write/ai-feedback/route.ts`, `src/app/api/ai/recommendations/route.ts`, `src/lib/retry.ts`, `src/lib/ai-client.ts`

PROBLEM: Feedback and recommendations implement their own provider calls using fetchWithRetry without an overall deadline. Each provider may make three 15-second attempts before falling back to another provider, approaching 90 seconds plus backoff. The shared AI client already supplies an 18-second budget, but these routes bypass it. Native requests time out after 25 seconds while server work can continue.

FIX: Route these calls through the shared AI client or give the entire primary/fallback chain one explicit deadline and cancellation signal. Keep retry budgets, token limits, output schemas and locale behavior consistent. Verify slow headers/bodies, transient errors, fallback timing and client cancellation without duplicate expensive work.

STATUS: 🟡 Recommendations and feedback use the shared AI client, with cancellation bounding the entire provider chain even when circuit storage stalls. Deadline and no-late-call regressions pass.

### 35: ✅ BUG-20261105-035: [Medium] Direct PostgreSQL mode hides public book and author pages behind login

FILES: `src/app/(app)/layout.tsx`, `src/app/(app)/book/[id]/page.tsx`, `src/app/(app)/author/[username]/page.tsx`

PROBLEM: The shared app layout unconditionally redirects anonymous direct-PostgreSQL visitors to /login. Book and author pages live under that layout, although they contain public metadata and optional-viewer behavior and are advertised by sitemaps. An isolated execution confirmed the layout redirect; a production smoke check also found an inner book-page login guard affecting both providers. Anonymous public content requires fixing both boundaries.

FIX: Separate public content layouts from authentication-required areas or apply authentication only to private pages and actions. Retain authorization at every mutation and private reader. Verify anonymous book, author and public-list access across providers, plus protected shelf/write/admin redirects and canonical alias behavior.

STATUS: ✅ Fixed in the foundation batch. Verified with browser-role SQL checks, handler/component regressions, and the full PostgreSQL/Redis-backed suite (639 passing tests).

## Verification

Three audit passes covered repository inventory/parsing, cross-layer route/schema/security contracts, and lifecycle/failure-path reinspection with isolated reproductions. All 813 tracked files were inventoried and reread by automated checks; 772 code files parsed without syntax diagnostics. Manual depth focused on active application paths, SQL routines and the findings above. This is not a claim of three manual line-by-line reviews of every file or proof that no further bugs exist.

The app uses Next.js App Router/React, TypeScript, Expo/React Native, PostgreSQL with Supabase or a direct driver, Redis, provider payment APIs and transactional SQL/outbox routines. The consolidated schema creates 121 public tables and 286 application functions. Existing reports/comments were not accepted as evidence.

- The complete canonical SQL executed in an isolated PostgreSQL-compatible PGlite database. Role-based privacy reads, deleted-admin operations, timestamp collisions and invalid columns were exercised against that schema.
- Executions of real TypeScript handlers/helpers used controlled dependency fixtures for failures and lifecycle transitions. They reproduced cookie loss, multipart overconsumption, false write acknowledgements, premature outbox completion, stale intent retention, transient-error logout, unavailable classification, lease loss, health status and the direct-provider public-page redirect.
- Subscription testing used generated fixture keys and the real web-push request generator. No internal endpoint, payment provider transaction, real account or user data was contacted or modified.
- Explicit service grants exist for all 120 active application tables. The unused email_verification_tokens table is intentionally sealed. Browser roles lack service-only RPC execution and sensitive credential columns. The demonstrated privacy defect concerns overly permissive read policies, not missing blanket grants.
- Root and native ESLint/TypeScript checks pass. Local tests: 622 passed; nine PostgreSQL, one Redis and one live-API test were skipped without configured prerequisites. The production build passes: 305 function traces, largest 57.08 MB against the 200 MB repository guard. Full service-backed checks and the native bundle remain required on the report PR.

Rechecked controls include monetary Decimal/SQL numeric handling, locked payout reservations, provider signature and payment identity binding, transactional replay receipts, factor-session checks, query identifier/value handling, sanitized content, escaped JSON-LD, avatar type/pixel limits, distributed counters, queue claims and dead-letter/operational signals. No additional demonstrated RCE, path traversal, direct double-payment, SQL injection or XSS finding emerged from those checks. This is a bounded verification result, not a security certification.

Vercel daily schedules are compatible with the stated external high-frequency scheduler and are not a finding. MEV is not applicable to the inspected non-blockchain payment flow. Live provider credentials, production traffic/load, device push delivery, backup restoration and deployed Data API behavior were not available for end-to-end verification. Restore and load drills remain release validation work.

## Ratings and proposed order

Engineering assessment, not a benchmark or security certification:

- Implementation: 6/10 now; approximately 8.5/10 after the fixes. Financial transactions are substantially guarded, but active UI/schema contracts still fail.
- Performance: 5/10 now; approximately 8/10 after bounded queries, job checkpoints, exports and retention. Thousands of concurrent users have not been load-tested.
- Structure: 7/10 now; approximately 8.5/10 after shared privacy/AI contracts and typed database coverage. Provider adapters and reusable services are useful, but unchecked SQL contracts and duplicated provider logic undermine consistency.
- Security: 4/10 now; approximately 8/10 after privacy, SSRF, session, delivery ownership and dependency remediation, followed by regression and deployed-role testing.

Proposed batches after plan review: first address findings 1–7 and 11 (dependencies, privacy, SSRF, sessions and sensitive authorization); then 8–10, 12–22 and 31–32 (correctness, delivery and failure handling); then 23–30 and 33–35 (portability, scale, typing, CSP and public navigation). Acceptance requires targeted regression checks, existing tests, lint/types, service-backed schema tests, production bundle limits and device/provider/restore/load checks where applicable. Ratings after remediation are estimates until those validations pass.

Report updated: 05 November 2026, 03:38 PM WAT (Africa/Lagos)
