# Liravo Forensic Bug Report
Date/Time: May 14, 2026 04:35 AM UTC

1: BUG-001: Payout request endpoint allows invalid monetary input and can persist zero-value payout intents.
   FILES: /workspace/liravo/src/app/api/earnings/request-payout/route.ts
   FIX: Enforce strict decimal schema validation (positive, minimum threshold, max precision/scale), reject empty/defaulted amounts, and normalize/round at the server before persistence.

2: BUG-002: Tip creation endpoint lacks mandatory idempotency protection, enabling duplicate charges/records on retries.
   FILES: /workspace/liravo/src/app/api/tips/create/route.ts, /workspace/liravo/src/lib/idempotency.ts
   FIX: Require Idempotency-Key, hash and bind key to authenticated user + canonical payload, cache final result, and replay prior success response on duplicate submissions.

3: BUG-003: Financial and side-effect writes are not atomic in tip flow (partial failure risk).
   FILES: /workspace/liravo/src/app/api/tips/create/route.ts
   FIX: Move financial writes into a transactional DB boundary (or RPC), and emit non-critical side effects (XP/notifications) through durable async jobs with retries.

4: BUG-004: Webhook replay handling is fail-open if replay backend is degraded/unavailable.
   FILES: /workspace/liravo/src/app/api/subscriptions/webhook/route.ts, /workspace/liravo/src/lib/webhook-security.ts
   FIX: Fail closed for payment webhooks when replay state cannot be confirmed, and enforce DB unique constraints on provider event IDs for hard idempotency.

5: BUG-005: Distributed lock acquisition is non-atomic (SETNX + EXPIRE split), creating deadlock risk.
   FILES: /workspace/liravo/src/lib/locks.ts
   FIX: Use atomic lock acquisition (`SET key value NX EX ttl`) and safe compare-and-delete unlock; add lock metrics/alerts for stale lock detection.

6: BUG-006: Lock owner token generation uses non-cryptographic randomness.
   FILES: /workspace/liravo/src/lib/locks.ts
   FIX: Replace Math.random tokening with `crypto.randomUUID()` or secure random bytes.

7: BUG-007: CSRF protection is incomplete for state-changing requests when Origin is absent.
   FILES: /workspace/liravo/src/middleware.ts
   FIX: Require trusted Origin or Referer/Sec-Fetch-Site validation for mutating routes; reject ambiguous browser-originated writes by default.

8: BUG-008: High-risk write/payment endpoints are not consistently rate-limited with strict buckets.
   FILES: /workspace/liravo/src/app/api/tips/create/route.ts, /workspace/liravo/src/app/api/earnings/request-payout/route.ts, /workspace/liravo/src/app/api/subscriptions/create/route.ts
   FIX: Apply per-user + per-IP limits, endpoint-specific burst ceilings, and return 429 with retry metadata.

9: BUG-009: Webhook signature verification appears generic and may miss provider canonicalization/version checks.
   FILES: /workspace/liravo/src/app/api/subscriptions/webhook/route.ts, /workspace/liravo/src/lib/webhook-security.ts
   FIX: Implement provider-specific canonical message construction, signature version parsing, and strict timestamp skew enforcement.

10: BUG-010: Request path includes synchronous secondary side effects, increasing latency and thundering-herd risk.
    FILES: /workspace/liravo/src/app/api/tips/create/route.ts, /workspace/liravo/src/services/notifications.ts, /workspace/liravo/src/services/xp.ts
    FIX: Shift heavy side effects to queue workers with exponential backoff + jitter and bounded concurrency.

11: BUG-011: Missing immutable, correlation-friendly audit logging for critical monetary transitions.
    FILES: /workspace/liravo/src/app/api/tips/create/route.ts, /workspace/liravo/src/app/api/subscriptions/webhook/route.ts, /workspace/liravo/src/app/api/earnings/request-payout/route.ts
    FIX: Add append-only audit/ledger entries with actor, event ID, idempotency key, source, and correlation ID.

12: BUG-012: Payout endpoint accepts multiple body types without robust payload-size and parser-hardening guards.
    FILES: /workspace/liravo/src/app/api/earnings/request-payout/route.ts
    FIX: Restrict accepted content types, enforce body-size limits, and reject malformed payloads consistently.

13: BUG-013: Test runner configuration/suites are inconsistent, causing Vitest to report failed suites despite printed assertions.
    FILES: /workspace/liravo/tests/api.test.ts, /workspace/liravo/tests/financial.test.ts, /workspace/liravo/package.json
    FIX: Convert console-based scripts into proper `describe/it/expect` suites, add a `test` script, and fail CI only on real assertion failures.

14: BUG-014: Defense-in-depth gaps around monitoring, retry governance, and incident visibility for financial paths.
    FILES: /workspace/liravo/src/app/api/tips/create/route.ts, /workspace/liravo/src/app/api/subscriptions/webhook/route.ts, /workspace/liravo/src/lib/retry.ts
    FIX: Add structured metrics (success/failure/retry/replay), circuit-breaker behavior for dependencies, and alerting thresholds.

## Detailed Findings

1) BUG-001 details:
The payout flow currently permits weak amount parsing behavior that can create invalid financial rows (including silent defaulting behavior in edge cases). This undermines accounting integrity and payout reconciliation. Recommended approach: strict Zod/Decimal validation, explicit min threshold, bounded precision, and rejection of zero/negative values.

2) BUG-002 details:
Tip creation can be replayed by client/network retries. Without strict idempotency binding, duplicate pending transactions are possible, which can cascade into duplicate downstream actions. Add mandatory Idempotency-Key and deterministic replay handling.

3) BUG-003 details:
Financial state changes and side effects occur in sequence without all-or-nothing boundaries. If a later write fails, records become partially applied. Use transaction scope for money writes and outbox/queue for eventual side effects.

4) BUG-004 details:
Replay detection relying only on a volatile backend can fail open during outages and permit duplicate webhook processing. Protect via DB uniqueness on event IDs and fail-safe processing semantics.

5) BUG-005 details:
A crash between SETNX and EXPIRE can leave orphaned locks indefinitely, blocking throughput. Replace with atomic lock primitives and add lock TTL observability.

6) BUG-006 details:
Predictable/weak lock tokens reduce ownership guarantees and can create unlock safety issues under contention. Use CSPRNG-based tokens.

7) BUG-007 details:
Origin-based checks alone are insufficient for all browser write contexts. Missing/stripped Origin scenarios should still be rejected unless Referer/Sec-Fetch-Site pass strict trust validation.

8) BUG-008 details:
Payment- and payout-adjacent endpoints need tighter abuse controls than generic routes. Use dedicated limit policies, including stricter per-account write caps and velocity checks.

9) BUG-009 details:
Payment providers often sign canonical strings with versioning/timestamp semantics. Generic HMAC checks can be wrong and vulnerable. Align implementation exactly with provider signature specs.

10) BUG-010 details:
Inline synchronous side effects (XP/notification writes) amplify latency under load and can cause failure fan-out during dependency slowness. Queueing with jittered retries improves resilience and scalability.

11) BUG-011 details:
Without immutable audit records and correlation identifiers, forensics and dispute response become expensive and error-prone. Add append-only event logging with reconciliable identifiers.

12) BUG-012 details:
Permissive body parsing without strict type/size gates invites malformed traffic and ambiguity between parser paths. Harden content-type and size policy.

13) BUG-013 details:
Current tests print “PASS” messages but Vitest still fails due missing recognized suites, weakening CI confidence and allowing regressions to slip. Convert to true test suites and add npm-level test command.

14) BUG-014 details:
Resilience controls (retry metrics, failure budgets, webhook anomaly alerts) appear incomplete. Add observable retry/backoff behavior and operational alarms to reduce MTTR.

## Overall Rating and Review
Current codebase rating (as-is): **6.3/10** for security/financial integrity/scalability readiness.

Brief review:
- Positive: feature breadth is substantial, and there is evidence of intent around integrity (locks, retry, idempotency helpers, webhook utilities).
- Major risks: transactional integrity gaps, webhook/idempotency hardening gaps, inconsistent abuse controls, and insufficient operational observability in critical money flows.
- Scalability posture: moderate for normal traffic, but likely fragile under high concurrent write pressure without queueing and strict limit policies.

Projected rating after recommended fixes: **8.8/10**.

Footer/Signature: Generated on May 14, 2026 04:35 AM UTC
