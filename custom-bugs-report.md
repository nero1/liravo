# Liravo Bug Report
Generated: May 14, 2026 12:28 AM UTC

1: BUG-001: Webhook authentication is weak and replay-prone (static shared secret header only, no signature/timestamp verification).
   FILES: src/app/api/subscriptions/webhook/route.ts, src/app/api/webhooks/promoted-listings/route.ts
   FIX: Implement provider-native HMAC signature verification over raw body, include timestamp tolerance, reject replays via nonce/idempotency store, and rotate secrets.

2: BUG-002: Subscription webhook updates are non-atomic and can leave payment/accounting state inconsistent.
   FILES: src/app/api/subscriptions/webhook/route.ts
   FIX: Wrap user premium-state update + subscription row update inside one DB transaction/RPC and require idempotency key/event id to make processing exactly-once.

3: BUG-003: Review like/unlike flow is race-condition prone and can drift counters.
   FILES: src/app/api/reviews/[id]/like/route.ts
   FIX: Replace read-then-write toggle with single SQL function that atomically upserts/deletes like and adjusts counter in same transaction; enforce unique(review_id,user_id) and idempotent behavior.

4: BUG-004: XP award constants appear semantically wrong for review-like actions (logic/financial-style integrity bug for gamification ledger).
   FILES: src/app/api/reviews/[id]/like/route.ts, src/constants/config.ts
   FIX: Use dedicated XP constants for like_given/like_received; prevent double-award by tying XP grants to immutable event log with unique action key.

5: BUG-005: Follow endpoint lacks target-user existence/eligibility check and may generate invalid relationships/notifications.
   FILES: src/app/api/users/[id]/follow/route.ts
   FIX: Validate target user exists, not suspended/deleted, and can be followed before insert; return 404/403 as appropriate.

6: BUG-006: Multi-step follow flow is non-transactional (follow insert, XP, notification) causing partial side effects on failure.
   FILES: src/app/api/users/[id]/follow/route.ts, src/services/xp.ts, src/services/notifications.ts
   FIX: Use transactional outbox/event-driven approach: commit follow once, then durable async jobs for XP/notifications with retry/backoff + dedupe keys.

7: BUG-007: Event ticket purchase flow can double-sell under concurrency.
   FILES: src/app/api/events/[id]/ticket/route.ts
   FIX: Enforce DB unique constraint on (event_id,user_id) and handle conflict explicitly; do not rely on pre-check query; make endpoint idempotent with client request id.

8: BUG-008: Ticket accounting flow inserts pending ticket before payment confirmation, without compensating rollback/expiry strategy.
   FILES: src/app/api/events/[id]/ticket/route.ts
   FIX: Separate payment intent table/state machine, auto-expire pending tickets, and only finalize ticket/ledger entries on verified payment webhook.

9: BUG-009: Missing defensive retries/backoff/circuit breaking around external AI/payment/book APIs.
   FILES: src/app/api/ai/recommendations/route.ts, src/app/api/ai/taste-profile/route.ts, src/app/api/write/ai-feedback/route.ts, src/services/books.ts
   FIX: Add bounded retries with exponential backoff + jitter, timeout budgets, provider fallback policies, and structured error classification.

10: BUG-010: Potential thundering-herd/load amplification due to sparse caching strategy for expensive endpoints.
   FILES: src/lib/redis.ts, src/app/api/feed/route.ts, src/app/api/leaderboards/route.ts, src/app/api/books/search/route.ts
   FIX: Add cache-aside with request coalescing/singleflight locks, stale-while-revalidate, and per-key jittered TTLs.

11: BUG-011: Rate-limit implementation lacks fail-open/fail-closed policy handling and resilience when Redis is unavailable.
   FILES: src/lib/rate-limit.ts, src/lib/redis.ts
   FIX: Wrap redis operations with explicit error strategy, fallback quotas, telemetry, and local short-lived circuit breaker to avoid global auth outage.

12: BUG-012: Service-role client usage is broad, increasing blast radius if endpoint authorization checks regress.
   FILES: src/lib/supabase/server.ts and multiple route handlers using createServiceClient()
   FIX: Minimize service-role usage, isolate privileged actions in tightly scoped RPCs with explicit input validation and audit logs.

13: BUG-013: Inconsistent error handling/observability; many DB writes ignore returned errors and no centralized structured telemetry.
   FILES: src/app/api/reviews/[id]/like/route.ts, src/app/api/users/[id]/follow/route.ts, src/app/api/subscriptions/cancel/route.ts, src/services/xp.ts
   FIX: Check and propagate all write errors, attach correlation IDs, emit structured logs/metrics/traces, and instrument SLO alerts.

14: BUG-014: Potential CSRF/session abuse risk on cookie-authenticated mutating endpoints without explicit origin checks.
   FILES: src/app/api/**/route.ts (POST/PUT/PATCH/DELETE handlers)
   FIX: Enforce same-site strategy plus Origin/Referer validation and CSRF token for state-changing requests from browsers.

15: BUG-015: Input validation is uneven; some endpoints trust params/body too much (injection/business-rule bypass risk).
   FILES: src/app/api/subscriptions/webhook/route.ts, src/app/api/events/[id]/ticket/route.ts, src/app/api/users/[id]/follow/route.ts
   FIX: Standardize schema validation (Zod) for all params/body/query, strict enums, length/range checks, and reject unknown fields.

---

## Detailed Analysis

### 1) BUG-001 details
Webhook handlers currently validate a static header secret only, which is insufficient against replay and header leakage. They do not cryptographically bind payload to sender identity, and no timestamp window is enforced. Attackers with leaked secret could replay old paid events.
Affected files: src/app/api/subscriptions/webhook/route.ts, src/app/api/webhooks/promoted-listings/route.ts.
Recommended fix: verify signed payload using provider docs (HMAC SHA-256 over raw body), require timestamp freshness (e.g., 5 minutes), store event id hash in Redis/DB for replay defense.

### 2) BUG-002 details
Subscription webhook updates user premium flag and subscription status in separate statements. A failure mid-flow can create split-brain state (user premium true but subscription not active, or vice versa).
Affected files: src/app/api/subscriptions/webhook/route.ts.
Recommended fix: use one transaction (or secure DB function) that atomically applies both updates and checks event ordering/version.

### 3) BUG-003 details
Like toggle uses read-then-write pattern and separate counter RPC calls. Concurrent requests may create lost updates/counter drift, especially under retries/timeouts.
Affected files: src/app/api/reviews/[id]/like/route.ts.
Recommended fix: perform atomic toggle in SQL with locking/upsert and deterministic return state; ensure counter derived from source-of-truth or updated in same transaction.

### 4) BUG-004 details
The endpoint awards XP constants tied to follow/want-to-read actions during review likes, suggesting business logic mismatch. This can distort reward economy.
Affected files: src/app/api/reviews/[id]/like/route.ts, src/constants/config.ts.
Recommended fix: define dedicated review-like XP constants and record grants in immutable XP ledger with unique event key to prevent accidental duplicates.

### 5) BUG-005 details
Follow POST inserts relation without validating target user existence and status; this can produce noisy errors or relationships against suspended/deleted accounts.
Affected files: src/app/api/users/[id]/follow/route.ts.
Recommended fix: fetch target user first (active, not self, not blocked) and only then insert follow.

### 6) BUG-006 details
Follow flow has three side effects (follow insert, XP grants, notification) without transactional guarantees. Partial failures can leave integrity gaps.
Affected files: src/app/api/users/[id]/follow/route.ts, src/services/xp.ts, src/services/notifications.ts.
Recommended fix: adopt outbox/jobs pattern with at-least-once delivery, idempotent consumers, and retry with exponential backoff.

### 7) BUG-007 details
Ticket purchase checks for existing ticket before insert. Under concurrent requests, both can pass pre-check and insert duplicates unless DB unique constraint blocks it.
Affected files: src/app/api/events/[id]/ticket/route.ts.
Recommended fix: enforce unique(event_id,user_id) at DB level; use insert ... on conflict handling and idempotency keys.

### 8) BUG-008 details
Ticket row is created with pending status before real payment completion. If user abandons payment, stale pending rows accumulate and may skew analytics/availability.
Affected files: src/app/api/events/[id]/ticket/route.ts.
Recommended fix: introduce payment intent lifecycle, timeout cleanup, and finalize only via signed payment webhook.

### 9) BUG-009 details
External API calls (AI and books) appear to be single-shot without robust retries/backoff/jitter or fallback budget control, increasing error rates and tail latency.
Affected files: src/app/api/ai/recommendations/route.ts, src/app/api/ai/taste-profile/route.ts, src/app/api/write/ai-feedback/route.ts, src/services/books.ts.
Recommended fix: reusable HTTP client with deadlines, retriable status map, capped exponential backoff, and provider failover.

### 10) BUG-010 details
Redis keys are defined but there is no clear systemic anti-stampede strategy for high-read endpoints. Large traffic spikes can hit DB directly.
Affected files: src/lib/redis.ts, src/app/api/feed/route.ts, src/app/api/leaderboards/route.ts, src/app/api/books/search/route.ts.
Recommended fix: add layered caching + request coalescing + stale-while-revalidate.

### 11) BUG-011 details
Rate limit logic assumes Redis availability. If Redis fails, auth endpoints may fail unexpectedly or lose protection depending on uncaught errors.
Affected files: src/lib/rate-limit.ts, src/lib/redis.ts.
Recommended fix: decide explicit fallback mode per endpoint, handle exceptions, and emit alarms.

### 12) BUG-012 details
Service-role client bypasses RLS and is used across endpoints. Any missed auth check becomes critical privilege escalation.
Affected files: src/lib/supabase/server.ts and service-client consumers.
Recommended fix: principle of least privilege—prefer user-scoped client; move privileged mutations to audited SQL functions.

### 13) BUG-013 details
Multiple write operations are performed without checking error returns, reducing debuggability and correctness guarantees.
Affected files: src/app/api/reviews/[id]/like/route.ts, src/app/api/users/[id]/follow/route.ts, src/app/api/subscriptions/cancel/route.ts, src/services/xp.ts.
Recommended fix: consistently check errors, return typed failure responses, and instrument logs/metrics.

### 14) BUG-014 details
State-changing endpoints relying on session cookies should validate request origin to reduce CSRF risk.
Affected files: all mutating route handlers under src/app/api.
Recommended fix: middleware-level origin/referer policy + CSRF token where browser form/API access exists.

### 15) BUG-015 details
Validation depth varies; some handlers accept broad input without strict schema enforcement, increasing risk of malformed data and business-rule bypass.
Affected files: src/app/api/subscriptions/webhook/route.ts, src/app/api/events/[id]/ticket/route.ts, src/app/api/users/[id]/follow/route.ts.
Recommended fix: enforce strict Zod schemas everywhere and reject unknown fields.

---
Footer: Completed on May 14, 2026 12:28 AM UTC.
