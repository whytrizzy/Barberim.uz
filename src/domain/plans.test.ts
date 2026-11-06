import { describe, expect, it } from 'vitest';
import { effectivePlan, extendPlan, hasFeature, planLimits, PRO_FEATURES } from './plans';

describe('plans', () => {
  it('gives PRO every feature and FREE none of the PRO ones', () => {
    for (const feature of PRO_FEATURES) {
      expect(hasFeature('PRO', feature)).toBe(true);
      expect(hasFeature('FREE', feature)).toBe(false);
    }
  });

  it('keeps FREE to one person and a few portfolio photos', () => {
    expect(planLimits('FREE')).toEqual({ staff: 1, portfolioPhotos: 3 });
    expect(planLimits('PRO').staff).toBeGreaterThan(1);
    expect(planLimits('PRO').portfolioPhotos).toBe(12);
  });
});

describe('paid time', () => {
  const now = new Date('2030-01-10T12:00:00Z');
  const later = new Date('2030-01-20T12:00:00Z');

  it('keeps the stored plan while billing is off, and needs paid time once it is on', () => {
    expect(effectivePlan({ plan: 'PRO', planUntil: null }, false, now)).toBe('PRO');
    expect(effectivePlan({ plan: 'PRO', planUntil: null }, true, now)).toBe('FREE');
    expect(effectivePlan({ plan: 'FREE', planUntil: later }, true, now)).toBe('PRO');
    expect(effectivePlan({ plan: 'PRO', planUntil: now }, true, now)).toBe('FREE');
  });

  it('adds a payment after the time already paid, or from today', () => {
    expect(extendPlan(null, now)).toEqual(new Date('2030-02-09T12:00:00Z'));
    expect(extendPlan(later, now)).toEqual(new Date('2030-02-19T12:00:00Z'));
    expect(extendPlan(new Date('2029-12-01T00:00:00Z'), now)).toEqual(
      new Date('2030-02-09T12:00:00Z'),
    );
  });
});
