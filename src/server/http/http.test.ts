import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AppError, errorResponse } from './errors';
import { rateLimit, resetRateLimits } from './rate-limit';
import { readJson, route } from './route';

beforeEach(() => resetRateLimits());

describe('rateLimit', () => {
  it('allows up to the limit per window, then answers rate_limited', () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 3; i++) rateLimit('k', 3, 60, t0);
    expect(() => rateLimit('k', 3, 60, t0)).toThrow(AppError);
    expect(() => rateLimit('other', 3, 60, t0)).not.toThrow();
    // A new window starts after it expires.
    expect(() => rateLimit('k', 3, 60, t0 + 61_000)).not.toThrow();
  });
});

describe('errors and routes', () => {
  it('maps AppErrors to status + stable code, and hides unknown errors', async () => {
    const forbidden = errorResponse(new AppError('forbidden'));
    expect(forbidden.status).toBe(403);
    expect(await forbidden.json()).toEqual({ error: { code: 'forbidden' } });

    const limited = errorResponse(new AppError('rate_limited', 'x', 42));
    expect(limited.headers.get('Retry-After')).toBe('42');

    const original = console.error;
    console.error = () => {};
    const unknown = errorResponse(new Error('db password is hunter2'));
    console.error = original;
    expect(unknown.status).toBe(500);
    expect(JSON.stringify(await unknown.json())).not.toContain('hunter2');
  });

  it('validates JSON bodies with a schema', async () => {
    const handler = route(async (request) =>
      Response.json(await readJson(request, z.object({ n: z.number() }))),
    );
    const ok = await handler(new Request('http://t', { method: 'POST', body: '{"n":1}' }));
    expect(await ok.json()).toEqual({ n: 1 });

    const bad = await handler(new Request('http://t', { method: 'POST', body: '{"n":"x"}' }));
    expect(bad.status).toBe(400);
    expect((await bad.json()).error.details[0].path).toBe('n');

    const notJson = await handler(new Request('http://t', { method: 'POST', body: '{' }));
    expect(notJson.status).toBe(400);
  });
});
