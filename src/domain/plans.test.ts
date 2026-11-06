import { describe, expect, it } from 'vitest';
import { hasFeature, planLimits, PRO_FEATURES } from './plans';

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
