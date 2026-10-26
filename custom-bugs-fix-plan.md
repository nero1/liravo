# Custom Bugs Fix Plan
Date/Time: May 23, 2026 09:39 PM UTC

Updated 26 October 2026. Section status summarizes its bullets; individual verified findings and remaining work are in `custom-bugs-verification.md`.

✅ 1. Identity and authorization invariants (Critical)
- ✅ Verify self/admin guards for `/api/users/*` mutations; retain verified cross-user social targets.
- ✅ Enforce DB-backed `is_admin` verification via service-side query/RPC.
- ✅ Add regression tests: self access, cross-user denial, admin override.

🟡 2. Financial correctness and integrity (Critical)
- ✅ Implement transactional payout reserve RPC (check available balance + reserve + create payout atomically).
- ✅ Enforce unique idempotency constraints for payouts/tips/webhook events.
- ✅ Move financial audit/event writes into same transaction (transactional outbox).

✅ 3. Cron hardening and Vercel Hobby compliance (Critical/High)
- ✅ Standardize cron auth helper (`Authorization: Bearer <CRON_SECRET>`).
- ✅ Add distributed lock + overlap prevention wrapper for all cron routes.
- ✅ Update setup docs to only daily-or-less schedules and external orchestrator instructions.

✅ 4. CSRF and abuse defense in depth (High)
- ✅ Add CSRF token validation for cookie-auth mutating APIs.
- ✅ Keep origin/referer/sec-fetch checks as secondary signal.
- ✅ Centralize rate-limit policy by route risk tier (auth, money, AI, social).

✅ 5. Retry/availability resilience (High)
- ✅ Replace retry message heuristics with status-class error taxonomy.
- ✅ Add circuit-breaker/budget for external dependencies.
- ✅ Introduce jitter and max concurrency caps for fan-out workloads.

✅ 6. AI privacy and prompt-injection controls (Critical/High)
- ✅ Scope AI cache keys by user/tenant and policy version.
- ✅ Validate model outputs against strict schema and reject malformed payloads.
- ✅ Add prompt-injection filtering and unsafe-output redaction.

🟡 7. SEO, i18n, accessibility, and UX quality (Medium)
- ✅ Add metadata/canonical/OG coverage to major dynamic pages.
- 🟡 Complete translation keys and enforce no hardcoded user-visible strings.
- 🟡 Add accessibility sweep for forms/navigation/ARIA labels.

✅ 8. Pagination and scalability cleanup (Medium)
- ✅ Standardize cursor pagination for high-volume endpoints.
- ✅ Add indexes aligned with cursor sort columns.
- ✅ Cap page sizes and include deterministic sort keys.

✅ 9. Observability, monitoring, and ops readiness (Medium/Low)
- ✅ Require correlation IDs on sensitive operations.
- ✅ Create dashboards/alerts for webhook replay conflicts, payout failures, cron overlaps.
- ✅ Add restore-drill SOP and backup verification checklist.

🟡 10. Validation rollout
- 🟡 Add concurrency/load tests for payout/webhook/cron paths.
- ✅ Add security tests (CSRF, replay, IDOR, abuse throttling).
- 🔵 Deploy behind feature flags and canary with rollback criteria.

Footer/Signature: Generated on May 23, 2026 09:39 PM UTC
