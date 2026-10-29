# Custom Bugs Fix Plan
Date/Time: May 23, 2026 09:39 PM UTC

Updated 28 October 2026. Section status summarizes its bullets; individual verified findings and remaining work are in `custom-bugs-verification.md`.

✅ 1. Identity and authorization invariants (Critical)
- ✅ Verify self/admin guards for `/api/users/*` mutations; retain verified cross-user social targets.
- ✅ Enforce DB-backed `is_admin` verification via service-side query/RPC.
- ✅ Add regression tests: self access, cross-user denial, admin override.
- ✅ Enforce real second-factor login, session-bound enrollment, one-time recovery, encrypted secrets and Supabase session policies.
- ✅ Add private purpose-bound email confirmation/recovery; preserve current email, enforce PINs and retain 2FA.

🟡 2. Financial correctness and integrity (Critical)
- ✅ Implement transactional payout reserve RPC (check available balance + reserve + create payout atomically).
- ✅ Enforce unique idempotency constraints for payouts/tips/webhook events.
- ✅ Move financial audit/event writes into same transaction (transactional outbox).
- ✅ Enforce Google Play account/receipt ownership, authenticated RTDN replay and paid-period access.
- ✅ Unify creator reservations/settlement, immutable destinations, confirmed transfers and audited manual/legacy reconciliation.
- ✅ Add capture-linked refunds, cumulative credit/commission adjustments, XP reversal and paid-period access.
- ✅ Recover missed checkout/renewal captures, persist provider session identities and audit manual promotion controls/clicks.
- ✅ Add paid-ticket checkout, serialized capacity, verified host/referral settlement and recoverable refunds.
- ✅ Retain mismatched captures, queue their return and prevent checkout retries from charging again.
- ✅ Correct subscription referral principals and transaction currencies; repair verified historical commissions with refund-aware audits.
- ✅ Enforce configured PINs for payout/bank intents with transaction-time proof checks and audited destinations.
- 🟡 Complete staging-provider validation.

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
- ✅ Scope AI caches/profiles by user, source data, locale, models and policy; classify full review text.
- ✅ Validate model outputs and stored profiles, enforce paid seven-day Newbie Writer plans, and reject malformed results without fabricated success.
- ✅ Add prompt-injection filtering and unsafe-output redaction.

🟡 7. SEO, i18n, accessibility, and UX quality (Medium)
- ✅ Add metadata/canonical/OG coverage to major dynamic pages.
- 🟡 Complete English/French/German coverage across web/native screens, system messages and metadata; enforce translated user-visible strings in CI.
- ✅ Translate and verify shared web components, named controls, navigation state, native report-dialog focus, failure recovery and notification pagination.
- ✅ Persist native language selection with device fallback; translate navigation/main tabs, settings and referral screens.
- ✅ Persist and enforce notification preferences; translate stored messages and push delivery.
- ✅ Preserve the selected language when creating email/social accounts.
- ✅ Show earned badges consistently on owned and public profiles.
- ✅ Translate native writing and workshop screens; repair workshop contracts, counters, pagination and retry handling.
- ✅ Repair and translate web writing progress/resources, complete weekly totals and exact-ISBN catalog links.
- ✅ Complete translated web/native writer question threads and answer selection.
- ✅ Repair ARC catalog/review pagination, complete private counts, inactive-reader decisions and web/native translations.
- ✅ Repair buddy-read catalogs/detail contracts, edition selection, discussion pagination, native chapter/notes/replies and web/native translations.
- 🟡 Complete the remaining page/native accessibility sweep.
- ✅ Repair native SDK/build dependencies, stateless authentication, account-cache isolation, verified reading/AI API contracts, atomic onboarding and role/genre editing.

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
- ✅ Keep browser inference out of server functions and enforce the uncompressed bundle budget during builds.
- ✅ Escape authored text in structured metadata and retain valid JSON values.
- ✅ Verify remaining content tables, durable creates, group capacity, private discussions, badge rewards and paged author notifications.
- ✅ Make admin theme/store/seasonal configuration atomic and repair partial/repeated content seeds through shared API/CLI routines.
- ✅ Unify profile/onboarding API validation across providers and commit optional PINs with onboarding.
- ✅ Validate and stage avatar uploads; commit owned media with profiles and clean abandoned objects.
- ✅ Verify Telegram signatures, resolve social identities atomically and enforce configured CAPTCHA on web/native authentication.
- ✅ Attribute review-driven want-to-reads once, award influence badges and share accurate creator statistics across web/native.
- ✅ Enforce feed privacy before stable pagination and share authenticated web/native feed contracts.
- ✅ Validate book-link identities and record clicks atomically with replay-safe receipts.
- ✅ Commit owned live completion rewards once, exclude imported history and deliver reviewer-conversion XP through the outbox.
- ✅ Bind reading-session XP and streaks to recorded dates, including delayed deliveries and reload-safe retries.
- ✅ Make buddy chapter/notes atomic and verify bounded, replay-safe Goodreads imports on web/native.
- ✅ Make author/ARC/moderation/role/book-chain decisions atomic; verify private-list access, follow counters and appeal restoration.
- ✅ Repair authenticated native account exports and the shared export ISBN/tip queries; reject incomplete exports.
- ✅ Align native referral statistics, currency totals and commission wording with the verified API/ledger.
- 🔵 Deploy behind feature flags and canary with rollback criteria.

✅ 11. Work and edition catalog integrity
- ✅ Separate canonical works from editions while preserving existing book links and reading history.
- ✅ Resolve edition-specific ISBN/provider identities without combining unrelated editions; expose edition selection on web/native.
- ✅ Verify imports, seeds, search, reviews, shelves and purchase links against the edition model.
- ✅ Aggregate complete visible review statistics, page reviews and preserve catalog rating sources.
- ✅ Share bounded, ranked mood discovery across web/native with canonical edition aliases and visible-review filtering.
- ✅ Require staff-approved work ownership for author catalogs, ARC offers and post book links; cover coauthors, edition aliases, work merges, complete analytics and revocation.

Footer/Signature: Generated on May 23, 2026 09:39 PM UTC
