# Custom Bugs Report
Date/Time: May 23, 2026 09:39 PM UTC

Verification updated 26 October 2026: ✅ resolved/verified; 🟡 partial; 🔵 not fixed. Current evidence and remaining work: `custom-bugs-verification.md`.

## Critical (one-line list)
✅ 1: BUG-001: IDOR risk in user-specific mutation endpoints because route `id` is not consistently enforced against authenticated user identity.
✅ 2: BUG-002: Cron authentication contract mismatch (`authorization: Bearer` in code vs `x-cron-secret` in setup) can cause failed jobs or unsafe ad-hoc bypass patterns.
✅ 3: BUG-003: Financial payout flow is vulnerable to race conditions because balance verification and payout creation are not guaranteed atomic.
🟡 4: BUG-004: Payment/webhook financial integrity has non-transactional side effects (state and audit/event writes can diverge).
✅ 5: BUG-005: AI cache and response handling can leak cross-user inference context if keys/outputs are insufficiently tenant-scoped and sanitized.

## High (one-line list)
✅ 6: BUG-006: Middleware protects `/admin` but not `/(app)/admin` route-group URLs, allowing UI-level admin pages to rely only on page-level guards.
✅ 7: BUG-007: CSRF defense is partial (origin/referer heuristic) and does not uniformly require anti-CSRF tokens for cookie-auth mutating routes.
✅ 8: BUG-008: Several money/auth endpoints trust raw forwarding headers for client identity; this can enable rate-limit bypass.
✅ 9: BUG-009: Retry logic can still classify non-transient failures too broadly by message substring matching, raising retry-storm risk.
✅ 10: BUG-010: Idempotency usage is inconsistent across side-effecting endpoints (likes/follows/notifications/XP), enabling duplicate outcomes under retries.
✅ 11: BUG-011: Setup docs schedule multiple jobs more than once daily despite Vercel Hobby constraint requirement from stakeholder note.
✅ 12: BUG-012: Cron endpoints lack a single centralized runner policy (timeout, lock, and overlap controls), increasing thundering-herd/overlap risk.

## Medium (one-line list)
✅ 13: BUG-013: SEO metadata coverage is inconsistent across dynamic pages; several pages may miss canonical/OG/Twitter structured metadata.
✅ 14: BUG-014: Cursor pagination is not consistently used across list/feed-style APIs, risking slow scans and pagination drift.
✅ 15: BUG-015: Observability is incomplete for security/finance paths (limited correlation IDs and error taxonomies).
✅ 16: BUG-016: JSDoc/documentation coverage for critical utility modules is inconsistent, raising maintenance and misuse risk.
✅ 17: BUG-017: Large cron fan-out loops are sequential in places and may time out on Hobby compute windows.
🟡 18: BUG-018: i18n coverage is partial; some UX/admin flows and messages are likely hardcoded in English only.

## Low (one-line list)
✅ 19: BUG-019: Setup guidance includes endpoint names not present in repository (operational drift).
✅ 20: BUG-020: Defensive bot-abuse controls are present but fragmented; no single policy doc/tuning matrix per endpoint class.
✅ 21: BUG-021: Backup/restore runbook exists but lacks explicit periodic restore-drill checklist and verification criteria.

---

## Detailed Findings

✅ 1: BUG-001: IDOR risk in user-specific mutation endpoints because route `id` is not consistently enforced against authenticated user identity.
   FILES: src/app/api/users/[id]/reading-goal/route.ts, src/app/api/users/[id]/follow/route.ts, src/app/api/users/locale/route.ts, src/app/api/users/delete-account/route.ts
   FIX: In every user-targeted mutating route, require `auth.user.id === params.id` unless explicitly admin; if admin path is allowed, enforce DB-backed `is_admin` check via trusted query/RPC, not client/session claim only. Add a shared guard helper and test matrix for self/other/admin.

✅ 2: BUG-002: Cron authentication contract mismatch (`authorization: Bearer` in code vs `x-cron-secret` in setup) can cause failed jobs or unsafe ad-hoc bypass patterns.
   FILES: src/app/api/cron/email-digest/route.ts, docs/SETUP.md
   FIX: Standardize on one header scheme for all cron routes (recommended: `Authorization: Bearer <CRON_SECRET>`), document exactly once, and add a shared `validateCronRequest()` utility used by every cron handler.

✅ 3: BUG-003: Financial payout flow is vulnerable to race conditions because balance verification and payout creation are not guaranteed atomic.
   FILES: src/app/api/earnings/request-payout/route.ts
   FIX: Move funds-availability check + reservation + payout row insert into one SERIALIZABLE transaction or locked RPC. Add idempotency key on payout intent and unique constraints preventing duplicate in-flight requests.

🟡 4: BUG-004: Payment/webhook financial integrity has non-transactional side effects (state and audit/event writes can diverge).
   FILES: src/app/api/subscriptions/webhook/route.ts, src/app/api/tips/webhook/route.ts, src/lib/outbox.ts
   FIX: Use transactional outbox pattern strictly: persist business state + outbox event in same DB transaction, then async dispatch. Add reconciliation job and alerting for orphaned financial state transitions.

✅ 5: BUG-005: AI cache and response handling can leak cross-user inference context if keys/outputs are insufficiently tenant-scoped and sanitized.
   FILES: src/app/api/write/ai-feedback/route.ts, src/app/api/ai/recommendations/route.ts
   FIX: Scope cache keys by user/tenant + model + policy version; avoid caching sensitive prompts unless encrypted/anonymized; apply output schema validation and redact unsafe artifacts before caching/returning.

✅ 6: BUG-006: Middleware protects `/admin` but not `/(app)/admin` route-group URLs, allowing UI-level admin pages to rely only on page-level guards.
   FILES: src/middleware.ts, src/app/(app)/admin/page.tsx
   FIX: Normalize route checks against actual resolved paths (e.g., `/admin`) and include route-group aliases/segments used by App Router. Add deny-by-default admin layout guard with server-side role check.

✅ 7: BUG-007: CSRF defense is partial (origin/referer heuristic) and does not uniformly require anti-CSRF tokens for cookie-auth mutating routes.
   FILES: src/middleware.ts, src/app/api/**/route.ts
   FIX: Add double-submit or synchronizer token for state-changing routes using cookie auth; keep origin checks as secondary layer. Exempt only truly stateless token-auth endpoints.

✅ 8: BUG-008: Several money/auth endpoints trust raw forwarding headers for client identity; this can enable rate-limit bypass.
   FILES: src/app/api/tips/create/route.ts, src/app/api/earnings/request-payout/route.ts, src/app/api/subscriptions/create/route.ts
   FIX: Derive client IP via trusted platform abstraction only; ignore spoofable headers unless proxy chain is validated. Couple rate limits to user-id + device fingerprint + IP.

✅ 9: BUG-009: Retry logic can still classify non-transient failures too broadly by message substring matching, raising retry-storm risk.
   FILES: src/lib/retry.ts
   FIX: Replace message heuristics with explicit error classes/status codes (429/5xx/network timeout). Add circuit-breaker and per-provider retry budgets.

✅ 10: BUG-010: Idempotency usage is inconsistent across side-effecting endpoints (likes/follows/notifications/XP), enabling duplicate outcomes under retries.
    FILES: src/lib/idempotency.ts, src/app/api/reviews/[id]/like/route.ts, src/app/api/users/[id]/follow/route.ts, src/services/xp.ts
    FIX: Require idempotency key for all non-read POST/PATCH with side effects; enforce unique DB constraints keyed to business event identity.

✅ 11: BUG-011: Setup docs schedule multiple jobs more than once daily despite Vercel Hobby constraint requirement from stakeholder note.
    FILES: docs/SETUP.md
    FIX: Revise docs to daily-or-less schedules only; document use of external orchestrator with staggered daily windows and separate endpoints if needed.

✅ 12: BUG-012: Cron endpoints lack a single centralized runner policy (timeout, lock, and overlap controls), increasing thundering-herd/overlap risk.
    FILES: src/app/api/cron/**/route.ts, src/lib/locks.ts
    FIX: Add shared cron wrapper: auth, distributed lock, max runtime, overlap reject, structured result metrics, and jittered stagger behavior.

✅ 13: BUG-013: SEO metadata coverage is inconsistent across dynamic pages; several pages may miss canonical/OG/Twitter structured metadata.
    FILES: src/app/[username]/page.tsx, src/app/(app)/book/[id]/page.tsx, src/app/(app)/lists/[id]/page.tsx, src/app/layout.tsx
    FIX: Add `generateMetadata` for key dynamic pages, canonical URLs, OG images, locale alternates, and structured data where relevant.

✅ 14: BUG-014: Cursor pagination is not consistently used across list/feed-style APIs, risking slow scans and pagination drift.
    FILES: src/app/api/feed/route.ts, src/app/api/notifications/route.ts, src/app/api/lists/route.ts
    FIX: Standardize on cursor pagination for high-volume collections; allow offset only for small admin datasets.

✅ 15: BUG-015: Observability is incomplete for security/finance paths (limited correlation IDs and error taxonomies).
    FILES: src/lib/metrics.ts, src/app/api/subscriptions/webhook/route.ts, src/app/api/earnings/request-payout/route.ts
    FIX: Introduce required request correlation IDs, standardized error codes, and alert thresholds for financial anomalies and webhook replay/conflict rates.

✅ 16: BUG-016: JSDoc/documentation coverage for critical utility modules is inconsistent, raising maintenance and misuse risk.
    FILES: src/lib/retry.ts, src/lib/idempotency.ts, src/lib/locks.ts, src/lib/outbox-worker.ts
    FIX: Add concise JSDoc on API contracts, failure modes, expected units, and concurrency assumptions.

✅ 17: BUG-017: Large cron fan-out loops are sequential in places and may time out on Hobby compute windows.
    FILES: src/app/api/cron/email-digest/route.ts
    FIX: Process in bounded batches with concurrency limit + retry budget + checkpoint cursor/state; continue next run from saved cursor.

🟡 18: BUG-018: i18n coverage is partial; some UX/admin flows and messages are likely hardcoded in English only.
    FILES: messages/en.json, messages/fr.json, messages/de.json, src/app/(app)/admin/**, src/components/**
    FIX: Enforce translation key usage in UI, add missing locale keys, and create CI check for untranslated literals in user-facing components.
    ✅ Search, quote and review forms: EN/FR/DE, accessible labels/states, recoverable search and owned reload-safe submissions. Wider UI coverage remains 🟡.

✅ 19: BUG-019: Setup guidance includes endpoint names not present in repository (operational drift).
    FILES: docs/SETUP.md, src/app/api/cron/**/route.ts
    FIX: Align setup table strictly with implemented cron endpoints and method/header requirements.

✅ 20: BUG-020: Defensive bot-abuse controls are present but fragmented; no single policy doc/tuning matrix per endpoint class.
    FILES: src/lib/rate-limit.ts, src/lib/spam-detection.ts, src/middleware.ts
    FIX: Define endpoint risk tiers with specific quotas/challenges/escalation behavior; add runbook for tuning false positives.

✅ 21: BUG-021: Backup/restore runbook exists but lacks explicit periodic restore-drill checklist and verification criteria.
    FILES: docs/SETUP.md
    FIX: Add quarterly restore drill SOP: RTO/RPO targets, checksum verification, sampled business-critical table integrity checks, and sign-off logs.

---

## Overall Rating and Brief Review
- Current state rating (security + reliability + structure + scalability): **6.4/10**.
- After applying fixes in this report: **8.9/10**.
- Brief review: The codebase already has strong intent around RLS, idempotency helpers, and cron decomposition, but critical consistency gaps remain in authorization invariants, financial atomicity, cron hardening/documentation alignment, and cross-cutting operational controls. Closing those gaps will substantially improve correctness and resilience without requiring expensive infrastructure.

Footer/Signature: Generated on May 23, 2026 09:39 PM UTC
