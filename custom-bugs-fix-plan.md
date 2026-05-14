# Liravo Bug Fix Plan
Date/Time: May 14, 2026 04:35 AM UTC

## Phase 1 — Financial Integrity & Idempotency (Highest Priority)
1. Add strict monetary validation and thresholds for payout creation.
2. Enforce idempotency keys for tip creation and all payment-intent endpoints.
3. Move financial writes into transactional boundaries (DB transaction or RPC).
4. Add immutable financial audit trail with correlation IDs.
5. Add DB uniqueness constraints for webhook/provider event IDs.

## Phase 2 — Security Hardening
6. Harden webhook signature verification to exact provider spec (version/timestamp/canonical payload).
7. Fail closed on replay-check dependency failure for webhook processing.
8. Strengthen CSRF enforcement for mutating routes with Origin + Referer/Sec-Fetch-Site policy.
9. Add endpoint-specific rate limiting for payment and write-heavy routes.
10. Restrict content-type/body-size parsing policies on sensitive endpoints.

## Phase 3 — Concurrency, Resilience, and Scalability
11. Replace non-atomic locking logic with atomic distributed lock primitives.
12. Replace weak lock token generation with cryptographic randomness.
13. Move synchronous side effects (notifications/XP/etc.) to outbox/queue workers.
14. Implement retry with exponential backoff + jitter and max-attempt governance.
15. Add thundering-herd mitigation (bounded worker concurrency, adaptive backpressure).

## Phase 4 — Testing & Quality Gates
16. Convert console-style verification scripts into formal Vitest suites.
17. Add `npm test` script and enforce test pass in CI.
18. Add tests for idempotency replay, duplicate webhook events, and transaction rollback safety.
19. Add adversarial tests for CSRF, rate limit bypass, malformed payloads, and injection attempts.
20. Add load/concurrency test scenarios for high-risk write paths.

## Phase 5 — Monitoring & Operations
21. Instrument structured metrics for financial route success/failure/retry/replay.
22. Add alerting on webhook replay spikes, payout anomalies, and lock-staleness.
23. Add dashboards for transaction latency/error rate and queue depth.
24. Define incident runbooks and reconciliation procedures for payment disputes.

## Recommended Execution Order
- Week 1: Phase 1
- Week 2: Phase 2 + critical Phase 3 items (11–13)
- Week 3: Remaining Phase 3 + Phase 4
- Week 4: Phase 5 and readiness verification

## Exit Criteria
- No duplicate financial records under retry/replay tests.
- All payment/webhook/payout routes covered by strict validation + rate limits.
- Queue/offline side effects resilient under dependency failures.
- CI executes deterministic tests with meaningful pass/fail outcomes.
- Monitoring and alerts in place for key financial integrity controls.

Footer/Signature: Generated on May 14, 2026 04:35 AM UTC
