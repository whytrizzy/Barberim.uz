import { describe, expect, it } from 'vitest';
import { clientOwesDeposit, depositFor, depositOutcome } from './deposits';

const at = (day: number) => new Date(Date.UTC(2030, 0, day, 10));

describe('the no-show cycle', () => {
  it('asks a deposit after a missed visit, until one is paid, and again after the next miss', () => {
    expect(clientOwesDeposit(null, null)).toBe(false);
    expect(clientOwesDeposit(at(5), null)).toBe(true);
    // Paid a deposit after missing: back to paying after the haircut.
    expect(clientOwesDeposit(at(5), at(6))).toBe(false);
    // Missed again after that deposit: a deposit again.
    expect(clientOwesDeposit(at(9), at(6))).toBe(true);
  });
});

describe('depositFor', () => {
  const rules = { amount: 50_000, afterNoShow: true };
  const ask = (over: Partial<Parameters<typeof depositFor>[1]> = {}) =>
    depositFor(rules, { hasProvider: true, masterRequires: false, clientOwes: false, ...over });

  it('asks for chosen masters and for clients who owe one', () => {
    expect(ask()).toBeNull();
    expect(ask({ masterRequires: true })).toBe(50_000);
    expect(ask({ clientOwes: true })).toBe(50_000);
  });

  it('asks nothing without a way to pay, an amount, or the no-show rule switched on', () => {
    expect(ask({ masterRequires: true, hasProvider: false })).toBeNull();
    expect(
      depositFor(
        { amount: 0, afterNoShow: true },
        { hasProvider: true, masterRequires: true, clientOwes: true },
      ),
    ).toBeNull();
    expect(
      depositFor(
        { amount: 50_000, afterNoShow: false },
        { hasProvider: true, masterRequires: false, clientOwes: true },
      ),
    ).toBeNull();
  });
});

describe('depositOutcome', () => {
  const start = at(10);
  const hoursBefore = (h: number) => new Date(start.getTime() - h * 3_600_000);

  it('refunds when the shop cancels, keeps it on a no-show', () => {
    expect(depositOutcome('shop_cancel', start, hoursBefore(1))).toBe('refund');
    expect(depositOutcome('no_show', start, start)).toBe('keep');
  });

  it('refunds a client who cancels a day ahead, not later', () => {
    expect(depositOutcome('client_cancel', start, hoursBefore(24))).toBe('refund');
    expect(depositOutcome('client_cancel', start, hoursBefore(23))).toBe('keep');
  });
});
