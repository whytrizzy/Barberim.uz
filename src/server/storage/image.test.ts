import { describe, expect, it } from 'vitest';
import { cleanImage, sniffImage } from './image';

const bytes = (...parts: (number[] | string)[]) =>
  new Uint8Array(
    parts.flatMap((part) =>
      typeof part === 'string' ? [...part].map((c) => c.charCodeAt(0)) : part,
    ),
  );

/** A JPEG segment: marker, big-endian length (including itself), payload. */
const segment = (marker: number, payload: string) => {
  const length = payload.length + 2;
  return bytes([0xff, marker, length >> 8, length & 0xff], payload);
};

const jpeg = (...segments: Uint8Array[]) =>
  bytes([0xff, 0xd8], ...segments.map((s) => [...s]), [0xff, 0xda, 0, 2, 1, 2, 3, 0xff, 0xd9]);

/** A WebP chunk: fourCC, little-endian size, payload, padding to an even length. */
const chunk = (fourCC: string, payload: number[]) => {
  const size = payload.length;
  const padded = size % 2 ? [...payload, 0] : payload;
  return [...bytes(fourCC), size & 0xff, (size >> 8) & 0xff, 0, 0, ...padded];
};

const webp = (...chunks: number[][]) => {
  const body = chunks.flat();
  const size = body.length + 4;
  return bytes('RIFF', [size & 0xff, (size >> 8) & 0xff, 0, 0], 'WEBP', body);
};

const text = (data: Uint8Array) => String.fromCharCode(...data);

describe('sniffImage', () => {
  it('recognises JPEG and WebP by their bytes, not the file name', () => {
    expect(sniffImage(jpeg())).toBe('jpeg');
    expect(sniffImage(webp(chunk('VP8 ', [1, 2, 3, 4])))).toBe('webp');
    expect(sniffImage(bytes([0x89], 'PNG\r\n\x1a\n'))).toBeNull();
    expect(sniffImage(bytes('<svg xmlns="http://www.w3.org/2000/svg">'))).toBeNull();
    expect(sniffImage(new Uint8Array())).toBeNull();
  });
});

describe('cleanImage', () => {
  it('drops EXIF (GPS), IPTC and comments from a JPEG and keeps the rest', () => {
    const input = jpeg(
      segment(0xe0, 'JFIF\0'),
      segment(0xe1, 'Exif\0\0GPS 41.29 69.20'),
      segment(0xe2, 'ICC_PROFILE\0'),
      segment(0xed, 'Photoshop 3.0\0'),
      segment(0xfe, 'shot on my phone'),
      segment(0xdb, 'quant'),
    );
    const result = cleanImage(input);
    expect(result?.type).toBe('jpeg');
    const out = text(result!.bytes);
    expect(out).not.toContain('Exif');
    expect(out).not.toContain('GPS');
    expect(out).not.toContain('Photoshop');
    expect(out).not.toContain('shot on my phone');
    expect(out).toContain('JFIF');
    expect(out).toContain('ICC_PROFILE');
    expect(out).toContain('quant');
    expect([...result!.bytes.slice(-9)]).toEqual([0xff, 0xda, 0, 2, 1, 2, 3, 0xff, 0xd9]);
  });

  it('refuses a truncated or fake JPEG', () => {
    expect(cleanImage(bytes([0xff, 0xd8, 0xff, 0xe1, 0x10, 0x00], 'Exif'))).toBeNull();
    expect(cleanImage(bytes([0xff, 0xd8, 0xff, 0xe0, 0, 4, 1, 2]))).toBeNull(); // no image data
    expect(cleanImage(bytes([0xff, 0xd8, 0xff, 0xe0], 'not a segment'))).toBeNull();
  });

  it('drops EXIF and XMP chunks from a WebP and clears their flags', () => {
    const input = webp(
      chunk('VP8X', [VP8X_FLAGS, 0, 0, 0, 9, 0, 0, 9, 0, 0]),
      chunk('VP8 ', [1, 2, 3]),
      chunk('EXIF', [...bytes('GPS 41.29')]),
      chunk('XMP ', [...bytes('<x:xmpmeta>')]),
    );
    const result = cleanImage(input);
    expect(result?.type).toBe('webp');
    const out = result!.bytes;
    expect(text(out)).not.toContain('GPS');
    expect(text(out)).not.toContain('xmpmeta');
    expect(out[20]! & 0x0c).toBe(0); // VP8X flags byte
    expect(out[20]! & 0x20).toBe(0x20); // the colour-profile flag stays
    const riffSize = out[4]! | (out[5]! << 8);
    expect(riffSize).toBe(out.length - 8);
    expect(sniffImage(out)).toBe('webp');
  });

  it('refuses a WebP with no image or a chunk running past the end', () => {
    expect(cleanImage(webp(chunk('EXIF', [1, 2, 3, 4, 5, 6])))).toBeNull();
    const broken = webp(chunk('VP8 ', [1, 2, 3, 4, 5, 6, 7, 8]));
    broken[16] = 200; // chunk size larger than the file
    expect(cleanImage(broken)).toBeNull();
  });
});

// ICC (0x20) + EXIF (0x08) + XMP (0x04)
const VP8X_FLAGS = 0x2c;
