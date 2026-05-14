# Liravo Bug Report
Date/Time: May 14, 2026 04:05 AM UTC

1: BUG-001: Payout request endpoint accepts arbitrary/invalid monetary amount as string and defaults to `0.00`.
   FILES: /workspace/liravo/src/app/api/earnings/request-payout/route.ts
   FIX: Use strict decimal validation (positive min amount, max precision/scale), reject zero defaults, enforce server-side minimum payout threshold, and persist amount in fixed-precision numeric type.

2: BUG-002: Tip creation flow is not idempotent and can double-charge/create duplicate pending tips on client retries.
   FILES: /workspace/liravo/src/app/api/tips/create/route.ts, /workspace/liravo/src/lib/idempotency.ts
   FIX: Require `Idempotency-Key` per payment-intent action, bind key to user+payload hash, store lock/result with TTL, and return prior response on replay.

3: BUG-003: Financial writes are non-atomic across multi-step operations (tip insert + notify + XP side effects).
   FILES: /workspace/liravo/src/app/api/tips/create/route.ts
   FIX: Move critical accounting writes into a DB transaction/RPC; decouple non-critical side effects (notifications/XP) to durable async queue with retries.

4: BUG-004: Subscriptions webhook replay guard is vulnerable to fail-open behavior if Redis is unavailable.
   FILES: /workspace/liravo/src/app/api/subscriptions/webhook/route.ts, /workspace/liravo/src/lib/webhook-security.ts
   FIX: Fail closed for payment webhooks when anti-replay backend is down, or require DB-level unique `event_id` constraint for hard idempotency.

5: BUG-005: Redis lock implementation is non-atomic (`SETNX` then `EXPIRE`) and can deadlock on process crash between calls.
   FILES: /workspace/liravo/src/lib/locks.ts
   FIX: Use atomic `SET key value NX EX ttl` command (or Lua script) and monotonic random token generation via crypto RNG.

6: BUG-006: CSRF origin check is incomplete (allows requests with missing `Origin` header for mutating API requests).
   FILES: /workspace/liravo/src/middleware.ts
   FIX: Enforce same-origin with strict allowlist and also validate `Sec-Fetch-Site`/`Referer` fallback; reject state-changing requests missing both trusted headers.

7: BUG-007: No visible per-route rate limiting for high-risk financial/payment/write endpoints.
   FILES: /workspace/liravo/src/app/api/tips/create/route.ts, /workspace/liravo/src/app/api/earnings/request-payout/route.ts, /workspace/liravo/src/app/api/subscriptions/create/route.ts
   FIX: Apply IP+user sliding-window limits + burst caps, return 429 with retry metadata, and separate strict buckets for payment and webhook entrypoints.

8: BUG-008: Webhook signature verification likely lacks provider-specific canonicalization/versioning checks.
   FILES: /workspace/liravo/src/app/api/subscriptions/webhook/route.ts, /workspace/liravo/src/lib/webhook-security.ts
   FIX: Implement provider-specific verification format (versioned signed payload, signature prefix handling, timestamp skew policy) per provider docs.

9: BUG-009: Potential thundering herd/scalability issue from direct sync external/API side effects in request path.
   FILES: /workspace/liravo/src/app/api/tips/create/route.ts, /workspace/liravo/src/services/notifications.ts, /workspace/liravo/src/services/xp.ts
   FIX: Use queue/outbox pattern for heavy secondary writes, with jittered retries and backpressure limits.

10: BUG-010: Lack of explicit audit trail + correlation IDs on critical financial transitions impairs forensic accounting.
   FILES: /workspace/liravo/src/app/api/tips/create/route.ts, /workspace/liravo/src/app/api/subscriptions/webhook/route.ts, /workspace/liravo/src/app/api/earnings/request-payout/route.ts
   FIX: Add immutable ledger/audit records with actor, source, idempotency key, provider event id, and request correlation ID.

11: BUG-011: Weak lock-owner token generation uses `Math.random()`.
   FILES: /workspace/liravo/src/lib/locks.ts
   FIX: Replace with `crypto.randomUUID()` or cryptographically secure random bytes.

12: BUG-012: Payout request endpoint accepts form and JSON but no content-length / payload guard.
   FILES: /workspace/liravo/src/app/api/earnings/request-payout/route.ts
   FIX: Enforce max payload size and strict schema parsing for both content types to avoid abuse and parser edge-case bypasses.

---

## Detailed Findings

1) BUG-001 details:
The payout endpoint parses `amount` as optional string and if absent silently writes `'0.00'` as pending payout. This is an accounting integrity risk (invalid requests become financial records) and can create reconciliation noise. Recommended: parse as Decimal string with regex + Zod refinement, reject empty/zero, enforce min/max payout range, and normalize precision server-side before insert.

2) BUG-002 details:
`tips/create` has no idempotency guard. If client retries due to timeout/network split, duplicate pending tips can be created. `ensureIdempotency` helper exists but is not applied. Recommended: require `Idempotency-Key` header and cache final response by key/user/payload hash.

3) BUG-003 details:
Tip insert, notification creation, and XP award happen in sequence without a transactional boundary. Failures after insert can leave partially applied side effects. Recommended: transactional RPC for financial record + ledger writes; emit async events for notification/XP with retry worker.

4) BUG-004 details:
Webhook anti-replay depends on Redis `detectReplay`. If Redis is degraded/unavailable, behavior is undefined and may permit duplicate event processing unless DB uniqueness exists. Recommended: enforce `unique(provider,event_id)` in DB and treat replay-check backend failure as processing توقف/5xx for safety.

5) BUG-005 details:
Current lock acquisition: `SETNX` then separate `EXPIRE`. If process dies between these calls, lock can persist forever, blocking future processing. Recommended: atomic lock command with TTL and best-effort unlock Lua check-and-del.

6) BUG-006 details:
Middleware only rejects when `Origin` is present and mismatched. Some browser/request paths omit Origin; these can slip through unless other controls apply. Recommended: reject mutating cookie-auth requests when neither trusted Origin nor trusted Referer/Sec-Fetch-Site is present.

7) BUG-007 details:
Auth rate limit utility exists, but payment/tip/payout endpoints do not visibly apply route-specific limits. This increases fraud/spam/DoS risk and cost amplification. Recommended: add dedicated rate-limit middleware for high-risk endpoints.

8) BUG-008 details:
Generic HMAC check may be insufficient if providers sign canonical string with prefixes/version fields (common in payment systems). Incorrect canonicalization causes false positives/negatives and bypass windows. Recommended: implement exact provider algorithm and include signature version checks.

9) BUG-009 details:
Synchronous side effects in request cycle reduce throughput under concurrency and can trigger thundering herd during dependency slowdown. Recommended: queue-based asynchronous processing and bounded retries with exponential backoff + jitter.

10) BUG-010 details:
Critical money-affecting routes lack explicit immutable audit events with correlation IDs. Incident response, dispute handling, and forensic verification become difficult. Recommended: append-only audit table and structured logs.

11) BUG-011 details:
`Math.random()` for lock token increases collision/predictability risk relative to CSPRNG tokens. Recommended: `crypto.randomUUID()`.

12) BUG-012 details:
Payout route accepts form/json without explicit payload-size bounds or strict content-type rejection. This can allow malformed abuse traffic and parser inconsistencies. Recommended: fixed accepted content types + max body size validation.

---
Footer/Signature: Generated on May 14, 2026 04:05 AM UTC
