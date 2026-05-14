import { describe, expect, it } from 'vitest';
import Decimal from 'decimal.js';

describe('Financial calculations', () => {
  describe('Platform fee (10% of tip)', () => {
    it('calculates $10.00 tip → $1.00 platform fee', () => {
      const tip = new Decimal('10.00');
      expect(tip.mul('0.10').toFixed(2)).toBe('1.00');
    });

    it('rounds $4.99 tip fee half-up to $0.50', () => {
      const tip = new Decimal('4.99');
      expect(tip.mul('0.10').toFixed(2)).toBe('0.50');
    });

    it('ensures fee + creator amount equals tip total', () => {
      const tip = new Decimal('7.77');
      const fee = tip.mul('0.10');
      const creator = tip.minus(fee);
      expect(fee.plus(creator).toFixed(2)).toBe(tip.toFixed(2));
    });
  });

  describe('Referral commission', () => {
    it('calculates referral commission from platform gross', () => {
      const platformGross = new Decimal('50.00');
      expect(platformGross.mul('0.10').toFixed(2)).toBe('5.00');
    });

    it('sums commission across multiple transactions', () => {
      const transactions = ['4.99', '9.99', '4.99', '14.99'];
      const totalGross = transactions.reduce(
        (acc, amount) => acc.plus(new Decimal(amount).mul('0.10')),
        new Decimal(0)
      );
      const commission = totalGross.mul('0.10');
      expect(totalGross.toFixed(2)).toBe('3.50');
      expect(commission.toFixed(2)).toBe('0.35');
    });
  });

  describe('Subscription price math and precision', () => {
    it('computes annualized USD subscription from monthly price', () => {
      const monthly = new Decimal('4.99');
      expect(monthly.mul(12).toFixed(2)).toBe('59.88');
    });

    it('avoids native floating-point precision traps', () => {
      const sum = new Decimal('0.1').plus(new Decimal('0.2'));
      expect(sum.toFixed(1)).toBe('0.3');
      expect(0.1 + 0.2).not.toBe(0.3);
    });
  });
});
