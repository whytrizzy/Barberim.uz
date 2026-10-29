import { describe, expect, it } from 'vitest';
import { isRootPath, parentPath } from './routes';

describe('isRootPath', () => {
  it('knows the entry screens and staff tabs', () => {
    expect(isRootPath('/')).toBe(true);
    expect(isRootPath('/staff/today')).toBe(true);
    expect(isRootPath('/shop/ustoz')).toBe(false);
  });
});

describe('parentPath', () => {
  it('drops the last segment', () => {
    expect(parentPath('/shop/ustoz/book')).toBe('/shop/ustoz');
    expect(parentPath('/staff/more/services')).toBe('/staff/more');
  });

  it('uses overrides where the plain parent has no page', () => {
    expect(parentPath('/booking/123')).toBe('/bookings');
    expect(parentPath('/shop/ustoz')).toBe('/discover');
  });

  it('falls back to home', () => {
    expect(parentPath('/design')).toBe('/');
    expect(parentPath('/design/')).toBe('/');
  });
});
