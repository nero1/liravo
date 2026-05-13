# Liravo Test Suite

## Structure

```
tests/
  README.md           — This file
  financial.test.ts   — Financial calculation tests (Decimal.js, no external test runner)
  api.test.ts         — API endpoint existence checks (scaffold)
```

## Running Tests

### Financial Tests
Uses Node's built-in `assert` module. No Jest or other test runner required.

```bash
npx tsx tests/financial.test.ts
```

Or with Node directly (requires ts-node or tsx):
```bash
node --loader ts-node/esm tests/financial.test.ts
```

### API Endpoint Tests
These are scaffold tests that verify endpoints exist and return expected status codes. Requires a running server.

```bash
LIRAVO_BASE_URL=http://localhost:3000 npx tsx tests/api.test.ts
```

## Test Philosophy

- **Financial tests**: All financial calculations use `Decimal.js` for precision. These tests verify platform fee calculations (10%), referral commission calculations (10% of platform gross), and subscription price math. Run in CI before every deploy.
- **API tests**: Smoke tests that verify critical routes return the expected HTTP status codes. Not a replacement for integration tests — they confirm the routes are registered and respond.

## Adding New Tests

### Financial Tests
Add a new `test()` block in `financial.test.ts`. Each test uses `assert.strictEqual` or `assert.ok` from Node's `assert` module.

### API Tests
Add a new entry to the `endpoints` array in `api.test.ts` with the path, method, and expected status.

## CI Integration

Add to your GitHub Actions workflow:
```yaml
- name: Run financial tests
  run: npx tsx tests/financial.test.ts
```
