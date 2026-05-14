# Liravo Bug Fix Plan
Generated: May 14, 2026 12:28 AM UTC

## Phase 0 — Safety Rails (Day 0-1)
1. Freeze high-risk payment/subscription releases until webhook/auth hardening is shipped.
2. Add temporary anomaly alerts for duplicate tickets, duplicate likes, and premium-status mismatches.
3. Enable DB backups + point-in-time recovery verification.

## Phase 1 — Integrity & Security Critical (Day 1-5)
1. Implement signed webhook verification + replay defense (BUG-001).
2. Create transactional subscription activation/cancellation DB function with idempotency (BUG-002).
3. Add DB uniqueness constraints and conflict handling for likes/follows/tickets (BUG-003, BUG-007).
4. Add CSRF/origin protections for mutating routes (BUG-014).
5. Standardize strict schema validation for route params/body/query (BUG-015).

## Phase 2 — Consistency & Atomicity (Day 5-10)
1. Refactor like toggle into atomic SQL/RPC operation (BUG-003).
2. Refactor follow workflow into outbox + background workers with retries (BUG-006).
3. Introduce payment intent state machine and pending-ticket expiry cleanup job (BUG-008).
4. Correct XP action mapping and enforce XP event dedupe ledger (BUG-004).

## Phase 3 — Reliability & Scale (Day 10-15)
1. Build reusable external-call wrapper with timeout, retry/backoff/jitter, and circuit breaker (BUG-009).
2. Add cache stampede controls (singleflight locks, SWR, jittered TTLs) to hot endpoints (BUG-010).
3. Add Redis failure fallback behavior for rate limiting and document fail-open/fail-closed policy (BUG-011).

## Phase 4 — Least Privilege & Observability (Day 15-20)
1. Audit all createServiceClient() usage; migrate to user-scoped clients where possible (BUG-012).
2. Move privileged writes into audited, validated DB RPCs (BUG-012).
3. Standardize structured logging, trace IDs, and metrics with SLO dashboards/alerts (BUG-013).
4. Enforce “check every DB write result” lint/checklist in CI (BUG-013).

## Verification Checklist
1. Concurrency test suite (k6/Artillery) for like/follow/ticket idempotency under parallel load.
2. Security tests: webhook signature/replay, CSRF, authz regression, and RLS bypass attempts.
3. Chaos tests: Redis/API provider outages to validate graceful degradation.
4. Financial reconciliation tests for subscription and ticket ledgers.

## Expected Outcome
- Immediate reduction of exploitable security vectors.
- Stronger accounting and payment integrity.
- Improved behavior under high concurrency and partial failures.
- Better monitoring and faster incident response.

Footer: Completed on May 14, 2026 12:28 AM UTC.
