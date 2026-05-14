# Custom Bugs Report
Date/Time: May 14, 2026 07:46 AM UTC

Scope note: Performed three forensic review passes across critical auth, payments, webhook, AI, moderation, concurrency, and data-integrity paths.

1: BUG-001: Webhook replay key is provider-scoped only, not user/subscription scoped, which can permit cross-tenant event-id collisions.
   FILES: src/app/api/subscriptions/webhook/route.ts
   FIX: Build replay key with provider + event_id + user_id (+ subscription_id when present), and persist provider event canonical hash to prevent accidental key collision denial/acceptance.

2: BUG-002: Webhook lock TTL (10s) is too short for DB retries/fallback path, enabling concurrent interleaving under slow DB/API conditions.
   FILES: src/app/api/subscriptions/webhook/route.ts, src/lib/locks.ts
   FIX: Increase lock TTL, add lock refresh/heartbeat during long critical sections, and include conflict-safe row versioning in DB transaction.

3: BUG-003: Monetary endpoints trust x-forwarded-for directly, allowing attacker-controlled IP spoofing and rate-limit bypass.
   FILES: src/app/api/tips/create/route.ts, src/app/api/earnings/request-payout/route.ts, src/app/api/subscriptions/create/route.ts
   FIX: Use trusted proxy headers only when verified by platform, otherwise use framework-provided client IP source and normalize private/reserved ranges.

4: BUG-004: Payout creation is not balance-atomic and can over-request funds if concurrent requests race before ledger settlement.
   FILES: src/app/api/earnings/request-payout/route.ts
   FIX: Enforce balance check + reserve in one transactional SQL/RPC call with row-level lock; reject when available balance minus pending payouts is insufficient.

5: BUG-005: Financial audit log writes are best-effort and not transactionally tied to money state changes, risking non-repudiation gaps.
   FILES: src/app/api/tips/create/route.ts, src/app/api/earnings/request-payout/route.ts, src/app/api/subscriptions/webhook/route.ts
   FIX: Move audit writes into same DB transaction/RPC for each state mutation; on failure, fail operation or dead-letter for mandatory reconciliation.

6: BUG-006: AI feedback cache key is global by text/type and not user-scoped, enabling cross-user inference/data leakage of premium outputs.
   FILES: src/app/api/write/ai-feedback/route.ts
   FIX: Include user ID (and tenant/project scope if applicable) in cache key, and avoid caching sensitive prompts/responses unless encrypted.

7: BUG-007: AI endpoints lack explicit prompt-injection hardening/response schema validation beyond loose parsing.
   FILES: src/app/api/ai/recommendations/route.ts, src/app/api/write/ai-feedback/route.ts
   FIX: Add strict structured output schema checks, safety guardrails, anti-injection system policies, and output sanitation/length caps before returning.

8: BUG-008: Retry wrapper retries all failures by default (including deterministic validation/4xx), increasing thundering-herd risk.
   FILES: src/lib/retry.ts, src/app/api/ai/recommendations/route.ts, src/app/api/write/ai-feedback/route.ts
   FIX: Default shouldRetry to transient classes only (network/429/5xx/timeouts), add jittered capped backoff tuned per integration.

9: BUG-009: Content-length checks can be bypassed with missing/incorrect headers; server still parses potentially large bodies.
   FILES: src/app/api/tips/create/route.ts, src/app/api/earnings/request-payout/route.ts
   FIX: Enforce runtime body size limit at framework/server layer and stream-parse with hard cap regardless of header correctness.

10: BUG-010: Follow/like side effects (XP/notifications) are not idempotent at domain-event level and can duplicate under race/retry edges.
    FILES: src/app/api/users/[id]/follow/route.ts, src/app/api/reviews/[id]/like/route.ts
    FIX: Emit immutable event IDs and process via idempotent outbox consumer keyed by event hash; ensure XP ledger unique constraints on (user, reason, entity, window).

11: BUG-011: Excessive `any` casting across API routes weakens type safety and can hide null/shape bugs in production.
    FILES: Multiple (notably src/app/api/**/route.ts, src/lib/outbox-worker.ts)
    FIX: Generate typed Supabase client/database types, remove `any`, and enforce no-explicit-any in API surface with exceptions reviewed.

12: BUG-012: Weak observability for critical money/security operations (no mandatory correlation propagation and incomplete error taxonomy).
    FILES: src/app/api/tips/create/route.ts, src/app/api/earnings/request-payout/route.ts, src/app/api/subscriptions/webhook/route.ts, src/lib/metrics.ts
    FIX: Require correlation/request IDs, standardized structured error codes, SLO metrics (p95 latency, duplicate rate, reconciliation drift), and alerting.

Footer/Signature: Generated on May 14, 2026 07:46 AM UTC
