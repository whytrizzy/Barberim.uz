import { describe, expect, it } from 'vitest';
// @ts-expect-error -- plain JavaScript that runs on Cloudflare, outside this TypeScript project.
import { photoKey } from '../../../workers/media/index.js';

const id = '01a19c4b-9c4a-77ef-b56c-e45457e311d0';

describe('the photo worker', () => {
  it('serves the keys the app writes', () => {
    expect(photoKey(`https://m.dev/shops/${id}/${id}.webp`)).toBe(`shops/${id}/${id}.webp`);
    expect(photoKey(`https://m.dev/shops/${id}/${id}.jpg?x=1`)).toBe(`shops/${id}/${id}.jpg`);
  });

  it('refuses everything else in the bucket', () => {
    for (const path of ['', 'secret.txt', `shops/${id}/x.jpg`, `shops/../${id}.jpg`]) {
      expect(photoKey(`https://m.dev/${path}`)).toBeNull();
    }
  });
});
