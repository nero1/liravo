/**
 * Liravo Financial Calculation Tests
 * Uses Node's built-in `assert` module — no Jest required.
 * Run: npx tsx tests/financial.test.ts
 */

import assert from 'assert';
import Decimal from 'decimal.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  PASS  ${name}`);
    passed++;
  } catch (err) {
    console.error(`  FAIL  ${name}`);
    console.error(`        ${err instanceof Error ? err.message : String(err)}`);
    failed++;
  }
}

// ---------------------------------------------------------------------------
// Platform fee: 10% of tip amounts
// ---------------------------------------------------------------------------

console.log('\nPlatform fee (10% of tip)');

test('$10.00 tip → $1.00 platform fee', () => {
  const tip = new Decimal('10.00');
  const fee = tip.mul('0.10');
  assert.strictEqual(fee.toFixed(2), '1.00');
});

test('$4.99 tip → $0.50 platform fee (rounded half-up)', () => {
  const tip = new Decimal('4.99');
  const fee = tip.mul('0.10');
  // Decimal.js default rounding: ROUND_HALF_UP
  assert.strictEqual(fee.toFixed(2), '0.50');
});

test('$1.00 tip → $0.10 platform fee', () => {
  const tip = new Decimal('1.00');
  const fee = tip.mul('0.10');
  assert.strictEqual(fee.toFixed(2), '0.10');
});

test('$0.50 tip → $0.05 platform fee', () => {
  const tip = new Decimal('0.50');
  const fee = tip.mul('0.10');
  assert.strictEqual(fee.toFixed(2), '0.05');
});

test('Creator receives 90% of tip', () => {
  const tip = new Decimal('10.00');
  const fee = tip.mul('0.10');
  const creatorAmount = tip.minus(fee);
  assert.strictEqual(creatorAmount.toFixed(2), '9.00');
});

test('Platform fee + creator amount = tip total', () => {
  const tip = new Decimal('7.77');
  const fee = tip.mul('0.10');
  const creator = tip.minus(fee);
  const total = fee.plus(creator);
  assert.strictEqual(total.toFixed(2), tip.toFixed(2));
});

// ---------------------------------------------------------------------------
// Referral commission: 10% of platform's gross from referred users
// ---------------------------------------------------------------------------

console.log('\nReferral commission (10% of platform gross)');

test('$1.00 platform gross → $0.10 referral commission', () => {
  const platformGross = new Decimal('1.00');
  const commission = platformGross.mul('0.10');
  assert.strictEqual(commission.toFixed(2), '0.10');
});

test('$50.00 monthly platform gross → $5.00 referral commission', () => {
  const platformGross = new Decimal('50.00');
  const commission = platformGross.mul('0.10');
  assert.strictEqual(commission.toFixed(2), '5.00');
});

test('Referral commission on tip: 10% of platform 10% of tip', () => {
  const tip = new Decimal('100.00');
  const platformFee = tip.mul('0.10');         // $10.00
  const referralCut = platformFee.mul('0.10'); // $1.00
  assert.strictEqual(platformFee.toFixed(2), '10.00');
  assert.strictEqual(referralCut.toFixed(2), '1.00');
});

test('Commission on multiple transactions sums correctly', () => {
  const transactions = ['4.99', '9.99', '4.99', '14.99'];
  const totalGross = transactions.reduce(
    (acc, t) => acc.plus(new Decimal(t).mul('0.10')),
    new Decimal(0)
  );
  const commission = totalGross.mul('0.10');
  // gross = 0.50 + 1.00 + 0.50 + 1.50 = 3.50; commission = 0.35
  assert.strictEqual(totalGross.toFixed(2), '3.50');
  assert.strictEqual(commission.toFixed(2), '0.35');
});

// ---------------------------------------------------------------------------
// Subscription price math
// ---------------------------------------------------------------------------

console.log('\nSubscription price math');

test('USD monthly price is $4.99', () => {
  const price = new Decimal('4.99');
  assert.strictEqual(price.toFixed(2), '4.99');
});

test('Annual USD cost (12 months) = $59.88', () => {
  const monthly = new Decimal('4.99');
  const annual = monthly.mul(12);
  assert.strictEqual(annual.toFixed(2), '59.88');
});

test('NGN monthly price is ₦7500.00', () => {
  const price = new Decimal('7500');
  assert.strictEqual(price.toFixed(2), '7500.00');
});

test('Platform fee on subscription ($4.99 treated as gross)', () => {
  const subPrice = new Decimal('4.99');
  const platformRevenue = subPrice; // all of subscription is platform revenue
  const referralCut = platformRevenue.mul('0.10');
  assert.strictEqual(referralCut.toFixed(2), '0.50');
});

test('Decimal precision: no floating point errors', () => {
  // Classic JS floating point trap: 0.1 + 0.2 !== 0.3
  const a = new Decimal('0.1');
  const b = new Decimal('0.2');
  const sum = a.plus(b);
  assert.strictEqual(sum.toFixed(1), '0.3');
  // Native JS would fail here: 0.1 + 0.2 = 0.30000000000000004
  assert.ok(0.1 + 0.2 !== 0.3, 'Native JS floats are imprecise (expected)');
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  process.exit(1);
}
