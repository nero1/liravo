# Liravo Test Suite

## Structure

```
tests/
  README.md           — This file
  financial.test.ts   — Financial calculation tests (Decimal.js, Vitest)
  api.test.ts         — Live API contract checks (explicit opt-in)
```

## Running Tests

### Financial Tests
Uses Vitest and Decimal.js. Run all offline checks with `npm test`.

```bash
npm test -- tests/financial.test.ts
```

Transactional SQL regression checks (isolated PGlite fixtures):
```bash
npm test -- tests/financial-transactions.test.ts
```

### API Endpoint Tests
Requires a configured, healthy running server. The suite is explicitly skipped without `LIRAVO_BASE_URL`; a configured unreachable or degraded server fails.

```bash
LIRAVO_BASE_URL=http://localhost:3000 npm test -- tests/api.test.ts
```

## Test Philosophy

- **Financial tests**: All financial calculations use `Decimal.js` for precision. These tests verify platform fee calculations (10%), referral commission calculations (10% of platform gross), and subscription price math. Run in CI before every deploy.
- **API tests**: Smoke tests that verify critical routes return the expected HTTP status codes. Not a replacement for integration tests — they confirm the routes are registered and respond.

## Adding New Tests

### Financial Tests
Add a new `test()` block in `financial.test.ts`. Use Vitest assertions and test behavior rather than source text.

### API Tests
Add a new entry to the `endpoints` array in `api.test.ts` with the path, method, and expected status.

## CI Integration

Add to your GitHub Actions workflow:
```yaml
- name: Run financial tests
  run: npm test -- tests/financial.test.ts
```

`security.test.ts` covers CSRF, ownership, trusted ingress, provider signatures and retry budgets. `redis.test.ts` exercises the actual Upstash SDK against mocked transport responses. `migrations.test.ts` applies the full SQL sequence to an empty local PostgreSQL database with Supabase auth stubs. Set `MIGRATION_TEST_DATABASE_URL` to a dedicated loopback database; it refuses remote or nonempty databases and retains results for inspection. CI supplies PostgreSQL 16. Never point the rehearsal at application data.

`payment-webhooks.test.ts` verifies native Paystack and Dodo signatures/envelopes. `i18n.test.ts` validates catalog parity, interpolation and ICU output across all supported locales.

The PostgreSQL rehearsal also exercises content intent races, rollback/deleted-record replay, buddy capacity, vote counters, adapter mutation/count contracts and streak rewards. `mobile-api.test.ts` executes native transport against mocked fetch/store dependencies; it does not replace an Expo build. `i18n-usage.test.ts` checks source translation references and localized login labels.

Admin contract suites cover the cron broker, unavailable/partial statuses and flag requests. The migration rehearsal executes real admin query models, FK/nested relationships, provider-toggle races and referral attribution races. Localized admin labels join the i18n source checks.

Payment tests cover checked tip-product pricing, stable checkout references, cancellation confirmation/recovery, concurrent cancellation claims and audit replay. Operational counter tests cover alert thresholds, window boundaries and unavailable Redis; middleware tests verify correlation propagation on accepted and rejected requests.

Writer rehearsals cover concurrent publish/join/submit/vote/best-answer requests, edited-entry replay, deletion replay, computed word counts, ownership and one reward per question. Cron tests exercise cached partial-save recovery, malformed output and provider fallback; browser request-intent tests isolate concurrent controls.

Google Play suites exercise V2 state/expiry, OIDC identity, account ownership, acknowledgement ordering/retry, RTDN failure responses and actual monthly offer selection. PostgreSQL tests cover receipt/account races, stale observations, conflicting deliveries, linked tokens, paid-period cancellation and combined-provider/manual-grant expiry. Provider calls are mocked; Play sandbox and Android device validation remain release checks.

Payout suites check stable provider references, lost/pending responses, amount/currency/recipient binding and signed transfer dispatch. PostgreSQL rehearsals cover separate currency balances, bank snapshots, approval/cancellation races, terminal reversals and audited manual receipt replay. Earnings API tests reject false zero balances, missing authorization and implicit currency conversion.

Refund tests cover native identities, missing-capture recovery, immutable service periods, queued retries and checked recurring product pricing. PostgreSQL checks cumulative partial/full refunds, overlapping deliveries, over-refund rejection, commission/XP reversal, pending payout cancellation, negative balances, independent paid periods, duplicate charges and legacy refunded-data migration. Provider calls remain mocked.

Paid-ticket tests cover fixed product pricing, owned checkout/session persistence, reservation races, late/duplicate/underpaid captures, refund-before-payment order and currency-specific earnings. Refund return tests retain ambiguous acknowledgements, verify provider identities and exercise audited admin recovery. The real integrity snapshot must match the admin alert registry.

Notification suites cover owned boolean preferences, localized stored facts/badge names, independent release-email opt-in and Expo error receipts. PostgreSQL rehearses legacy backfill, category opt-outs, restricted browser writes, individual read ownership and outbox replay/context cleanup. Push transports are mocked; physical-device delivery remains unverified.

Review rehearsals cover complete distribution/averages, cursor ties and edition aliases, hidden/inactive authors, concurrent inserts and catalog-score preservation. Legacy rating repair retains an audit snapshot; structured metadata tests verify safe HTML embedding and multilingual JSON round trips.

Writing checks cover native workshop contracts/failure states, owned receipts and reopened prompt responses. PostgreSQL verifies workshop count repair, repeated/concurrent joins, private SQL/API access, cursor ties, owned recovery and browser write restrictions. Native receipts retain legacy keys while keeping long-entry persistence below the SecureStore size limit.

Writing progress rehearsals cover more than 1,000 submissions, Sunday/Monday boundaries, empty weeks, challenge words, feedback versus draft counts, writing versus reading streaks, earned badges, account guards and private responses. ISBN checks reject unrelated Google results and resolve local editions with providers offline.

Author-work checks cover legacy repair/audits, staff-only grants, coauthors, edition aliases/work merges, complete catalog pagination, full analytics, wrong-name denial, SQL/API write protection and replay-safe revocation. Native tests cover all catalog pages, failure states and owned ARC receipts; release email tests reject absent/unavailable ownership.

Writer-thread rehearsals cover complete question filters, 45 visible answers, cursor ties/scope, pinned best answers, inactive accounts, verified-author/XP boundaries, owned receipts, one-time rewards/notifications and opt-outs. Native tests cover thread navigation, eligibility and acknowledgement ownership; shared notification tests validate translated facts and safe question links.

ARC rehearsals cover complete catalogs and 45 applications, private aggregate counts, participant-only closed history, scoped cursors, inactive-reader denial, final-slot races, immutable decisions, rejection/replay and SQL permissions. Native tests verify full counts, inactive controls, error states and owned receipts.
