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
