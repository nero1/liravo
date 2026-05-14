# Custom Bugs Fix Plan
Date/Time: May 14, 2026 07:46 AM UTC

1. Harden webhook integrity path
- Expand replay key composition and validate canonical event fingerprints.
- Extend lock TTL + heartbeat.
- Move final state transition to a single transactional routine where possible.

2. Repair financial atomicity and accounting integrity
- Add transactional payout reserve RPC (balance check + reserve + audit log).
- Enforce exactly-once semantics for tips/subscriptions via unique business keys.
- Make audit log write mandatory/transactional.

3. Strengthen abuse controls and edge trust
- Replace raw x-forwarded-for usage with trusted IP derivation.
- Add route-level and global rate limits with separate budgets for auth, money, AI.
- Enforce server-side body-size caps independent of request headers.

4. Add defense-in-depth for AI endpoints
- Add structured output validation and strict schema fail-closed behavior.
- Add prompt-injection mitigations (policy prompts + filtering + output constraints).
- Scope caches by user/tenant and avoid caching sensitive data by default.

5. Improve reliability/retry behavior under load
- Restrict retries to transient failures only.
- Add circuit-breakers per provider and backpressure behavior.
- Add thundering-herd protection for hot keys and batch queuing for spikes.

6. Make side effects idempotent and race-safe
- Route all XP/notification writes through outbox with idempotency keys.
- Add unique constraints for XP/event dedupe.
- Add compensating/reconciliation jobs for partial failures.

7. Raise type safety and code quality baseline
- Remove `any` from API critical paths.
- Introduce generated DB types and stricter lint rules.
- Add nullability guards and typed helper wrappers for Supabase RPC results.

8. Close observability and monitoring gaps
- Standardize structured logs with correlation IDs.
- Add security/finance dashboards and alert thresholds.
- Add periodic reconciliation reports for ledger vs aggregates.

9. Validation and rollout
- Add concurrency, fuzz, and property-based tests for money flows.
- Run penetration tests for OWASP top-10 and prompt-injection scenarios.
- Roll out behind feature flags with canary monitoring and rollback criteria.

Footer/Signature: Generated on May 14, 2026 07:46 AM UTC
