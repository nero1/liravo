# Bug Fix Verification Audit
Updated: 26 October 2026

Scope: independent code review and execution against the 21 findings in `custom-bugs-report.md`; the previous 15/15, 100% claim is invalid.

## Status Summary
- ✅ Resolved or verified false positive: 17/21
- 🟡 Partial: 4/21
- 🔵 Untouched: 0/21

## Per-Issue Verification

| Issue | Status | Evidence / remaining work |
|---|---|---|
| BUG-001 | ✅ | Verified ownership checks; reading goals deny other users, follow intentionally targets another user. Added profile privilege-field enforcement, private-column/RPC ACL checks, safe auth response serialization and escalation tests. |
| BUG-002 | ✅ | All 12 cron routes use one Bearer-authenticated wrapper; legacy x-cron-secret rejected. |
| BUG-003 | ✅ | Service-only atomic reserve RPC; no fallback. Real PostgreSQL race: one reservation, one insufficient-balance rejection, one audit record. |
| BUG-004 | 🟡 | Webhook state, audit and outbox intent now commit together. Subscription initiation/cancellation now have transactional intents/audits; outbox leases recover and DB consumers commit once. Outbox drain also reports missing payouts/audits/outbox records and stalled/failed deliveries. Native provider adapters now use Paystack SHA-512 and Dodo Standard Webhooks; tests cover tampering, stale signatures, underpayment and event order. Recurring billing cancellation, refunds and ambiguous gateway reconciliation still need completion and sandbox verification. |
| BUG-005 | ✅ | Authenticated recommendation ownership, user/model/policy cache scope, schema and unsafe-text checks, real premium gating. System/user instructions are separated, unsafe/malformed output is rejected, cache decoding is validated, and a foreign-user request test returns 403 before DB/cache access. Live-provider adversarial testing is still a release check. |
| BUG-006 | ✅ | Route-group URL allegation is false: /(app) never appears in URLs. Added shared server admin layout guard; kept Node sessions out of Edge middleware. |
| BUG-007 | ✅ | Double-submit cookie/header tokens, native form inputs, origin checks and Bearer auth without cookie fallback. Client fetch and form integrations updated. Removed the helpfulness GET mutation; its client now uses authenticated POST with durable intents. |
| BUG-008 | ✅ | Untrusted forwarding headers ignored; authenticated money quotas use user identity and trusted ingress. Explicit deployment trust contract documented. |
| BUG-009 | ✅ | Status/code taxonomy, capped jittered retries, provider circuit, retry budget and timeouts; shared AI/book callers integrated. Regression tests reject permanent/programmer-error retries. |
| BUG-010 | 🟡 | Durable follow/like intents, atomic counts/rewards/notifications, no XP farming, and client keys implemented. All XP producers now use durable business keys; generic client XP farming is rejected. Migration 032 now commits durable intents and reward outbox records with reviews, quotes, buddy reads, Q&A and reading sessions; 033 serializes reading/writing streaks, and 034 covers book/helpfulness toggles. Real PostgreSQL tests exercise concurrent creates, rollback, deleted-record replay, capacity races and reward replay. Other creation/editing paths still need the same request contract. |
| BUG-011 | ✅ | Vercel schedules are daily or weekly; setup table aligned and external scheduler latency documented. |
| BUG-012 | ✅ | Shared authentication, renewable atomic lease ownership, overlap/failure metrics and 60-second Vercel runtime limit on every cron route. |
| BUG-013 | ✅ | Book JSON-LD renders as escaped script; book/list/profile/author canonical, OG and Twitter metadata added. Private/banned profiles are noindex with no bio/image disclosure. Language alternates resolve through validated middleware, with an actual default OG image and regression tests. |
| BUG-014 | ✅ | Composite feed/notification cursors and indexes, bounded own-list pagination, PostgreSQL compound filters and deterministic sorting. Followed lists use a public-only keyset RPC and independent cursor. Real PostgreSQL tests cover equal timestamps, page boundaries and private-list exclusion. |
| BUG-015 | 🟡 | Finance/cron correlation IDs and structured errors plus alert runbook added. Deployment dashboards and replay/reconciliation alerts are not provisioned. |
| BUG-016 | ✅ | Concise retry, idempotency, lock and outbox contracts added, including units and at-least-once semantics. |
| BUG-017 | ✅ | Digest uses four concurrent users/40 per invocation, a 35-second scheduling deadline, six-second Mailgun timeout and cursor. Weekly DB receipts prevent successful sends replaying; definite failures retry at most three times, ambiguous sends require reconciliation. Real PostgreSQL tests cover concurrent claims, retry exhaustion and stale claims. Other cron workloads still need scaling measurements. |
| BUG-018 | 🟡 | Locale selection honors NEXT_LOCALE; migration 028 fixes the missing profile column, and an ownership test verifies cookie persistence. Premium checkout is localized in all three catalogs, including pending-payment status and price formatting; catalog parity/ICU tests run in CI. Login is now translated, missing auth keys are corrected, and CI checks literal translation references across source plus untranslated labels on localized login screens. Hardcoded UI strings elsewhere, complete translations and the wider accessibility sweep remain. |
| BUG-019 | ✅ | Setup cron table references only real endpoints, GET/POST support and actual deployed schedules. |
| BUG-020 | ✅ | Atomic rate windows, per-account AI/social risk tiers, trusted-ingress rules and tuning/escalation matrix documented. |
| BUG-021 | ✅ | Quarterly restore SOP includes RPO/RTO, checksum, financial/ownership verification and sign-off. A production backup drill was not executed. |

## Validation

- ESLint and web TypeScript checks pass; production build passed after fixing Node-only Edge imports, schema typing, ONNX workers and the incomplete npm lockfile.
- 118 tests pass, including the full PostgreSQL migration rehearsal; one live API suite is explicitly skipped without LIRAVO_BASE_URL. Runtime smoke: login 200, missing CSRF 403, unsigned webhook 401, generated PNG 200. Follow-up smoke: French login 200 without missing translation keys; GET helpfulness 405. Health is degraded because database/Redis bindings are absent.
- PostgreSQL 16: full ordered migration rehearsal passed with isolated Supabase auth stubs. Separate backend sessions competed for one balance: exactly one payout and audit committed. No production data or credentials used.
- Additional verified migration defects fixed: affiliate seed columns, premature subscription index, missing buddy notes/moderation audit tables, and canonical buddy/prompt collection names. Migration 023 preserves legacy collection data without dropping old tables; 024–034 add the XP ledger, outbox recovery, subscription intents, list pagination, locale, private-column/RPC permissions operational reconciliation, durable content intents, atomic streaks and book interactions.
- Supabase/Upstash, Mailgun and payment-provider live integration remain untested: bindings are absent. PGlite fixtures and local PostgreSQL do not replace staging provider tests.
- PR #23 merged after GitHub tests/lint/typecheck/build passed. Vercel preview failed because the commit author lacks project access; no access check was bypassed. GitHub API access now works. PR/check/merge results are reported with the task result. Remaining partial findings and absent provider bindings prevent claiming production readiness.
