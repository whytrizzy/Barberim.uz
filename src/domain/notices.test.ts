import { describe, expect, it } from 'vitest';
import { canSayLate, canSayNextUp, noticeStillUseful } from './notices';

const start = new Date('2030-01-08T09:00:00Z');
const minutes = (n: number) => new Date(start.getTime() + n * 60_000);
const visit = (status = 'CONFIRMED') => ({ status, startAt: start });

describe('running late', () => {
  it('can be said from three hours before until half an hour after the start', () => {
    expect(canSayLate(visit(), minutes(-181))).toBe(false);
    expect(canSayLate(visit(), minutes(-180))).toBe(true);
    expect(canSayLate(visit('PENDING'), minutes(-5))).toBe(true);
    expect(canSayLate(visit(), minutes(30))).toBe(true);
    expect(canSayLate(visit(), minutes(31))).toBe(false);
  });

  it('is only for a visit that is still on', () => {
    for (const status of ['COMPLETED', 'NO_SHOW', 'CANCELLED_CLIENT', 'CANCELLED_SHOP']) {
      expect(canSayLate(visit(status), minutes(0))).toBe(false);
    }
  });
});

describe('your turn is next', () => {
  it('is for a confirmed visit within the hour', () => {
    expect(canSayNextUp(visit(), minutes(-61))).toBe(false);
    expect(canSayNextUp(visit(), minutes(-60))).toBe(true);
    expect(canSayNextUp(visit(), minutes(10))).toBe(true);
    // A request the shop hasn't accepted isn't anyone's turn.
    expect(canSayNextUp(visit('PENDING'), minutes(-10))).toBe(false);
  });
});

describe('noticeStillUseful', () => {
  it('drops a notice once the visit is well under way', () => {
    expect(noticeStillUseful(start, minutes(30))).toBe(true);
    expect(noticeStillUseful(start, minutes(31))).toBe(false);
  });
});
