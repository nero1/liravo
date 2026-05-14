# Liravo Bug Fix Plan
Date/Time: May 14, 2026 04:05 AM UTC

## Phase 1 — Financial Integrity & Idempotency (Highest Priority)
1. Implement strict money validators (decimal precision, min/max thresholds, non-zero) for payout and tip endpoints.
2. Add mandatory `Idempotency-Key` handling for tip creation and payout requests; persist keyed response snapshots.
3. Move critical financial mutations into transactional SQL RPCs with explicit failure rollback semantics.
4. Introduce append-only financial ledger + audit table with correlation IDs and actor/source metadata.

## Phase 2 — Webhook Hardening
5. Add DB uniqueness constraints for webhook event IDs (`provider + event_id`) and process status state-machine.
6. Replace generic signature checks with provider-specific canonical verification and signature-version support.
7. Change webhook replay/lock behavior to fail-closed on dependency outage for critical payment events.

## Phase 3 — Concurrency, Atomic Locks, and Retry Safety
8. Refactor Redis lock to atomic NX+EX acquisition and guarded release via Lua script.
9. Replace `Math.random()` lock token with CSPRNG (`crypto.randomUUID()`), and add lock contention metrics.
10. Ensure retry policies (exponential backoff + jitter + max attempts) are consistent across payment/notification workers.

## Phase 4 — Security & Abuse Resistance
11. Strengthen CSRF checks for mutating cookie-auth APIs using Origin + Referer/Sec-Fetch-Site enforcement.
12. Add per-route high-risk rate limits (tips, payouts, subscription create/webhook) with 429 response standards.
13. Enforce request body size/content-type policies to reduce parser abuse and malformed request classes.

## Phase 5 — Scalability/Observability
14. Introduce queue/outbox for non-critical side effects (notification, XP) with retry workers.
15. Add structured logging + tracing for financial routes and webhooks; emit counters for dedupe hits, lock waits, retries.
16. Add load tests for concurrent tip/payment flows and chaos tests for Redis/Supabase partial outages.

## Phase 6 — Verification & Release Gating
17. Add integration tests for idempotency replay, duplicate webhook delivery, and transaction rollback behavior.
18. Add security tests for CSRF bypass attempts and signature forgery scenarios.
19. Define SLOs (error rate, p95 latency, duplicate event rate) and block release if thresholds regress.

Footer/Signature: Generated on May 14, 2026 04:05 AM UTC
