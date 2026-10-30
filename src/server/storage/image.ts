/**
 * Checks for uploaded photos. The app resizes and re-encodes photos on the phone before upload,
 * which already drops EXIF (and with it the GPS position), so the server only makes sure it got a
 * well-formed JPEG or WebP and removes metadata a hand-made request might still carry.
 */

export type ImageType = 'jpeg' | 'webp';

export const imageContentType: Record<ImageType, string> = {
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};
export const imageExtension: Record<ImageType, string> = { jpeg: 'jpg', webp: 'webp' };

const ascii = (bytes: Uint8Array, at: number, length: number) =>
  String.fromCharCode(...bytes.subarray(at, at + length));

export function sniffImage(bytes: Uint8Array): ImageType | null {
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'jpeg';
  }
  if (bytes.length >= 20 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') {
    return 'webp';
  }
  return null;
}

/** The image without metadata, or null when it isn't a well-formed JPEG or WebP. */
export function cleanImage(bytes: Uint8Array): { type: ImageType; bytes: Uint8Array } | null {
  const type = sniffImage(bytes);
  if (!type) return null;
  const cleaned = type === 'jpeg' ? stripJpeg(bytes) : stripWebp(bytes);
  return cleaned && { type, bytes: cleaned };
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

// APP1 (EXIF, XMP), APP13 (IPTC) and comments. APP0, APP2 (colour profile) and APP14 (Adobe colour
// transform) stay: removing them would change how the photo looks.
const jpegMetadata = new Set([0xe1, 0xed, 0xfe]);

/** Walks the JPEG segments up to the image data (SOS), dropping the metadata ones. */
function stripJpeg(bytes: Uint8Array): Uint8Array | null {
  const kept: Uint8Array[] = [bytes.subarray(0, 2)];
  let at = 2;
  while (at + 1 < bytes.length) {
    if (bytes[at] !== 0xff) return null;
    const marker = bytes[at + 1]!;
    if (marker === 0xff) {
      at += 1; // fill byte
      continue;
    }
    // Start of scan: the compressed image runs from here to the end.
    if (marker === 0xda) return concat([...kept, bytes.subarray(at)]);
    if (at + 4 > bytes.length) return null;
    const end = at + 2 + ((bytes[at + 2]! << 8) | bytes[at + 3]!);
    if (end <= at + 3 || end > bytes.length) return null;
    if (!jpegMetadata.has(marker)) kept.push(bytes.subarray(at, end));
    at = end;
  }
  return null; // no image data
}

const VP8X_XMP = 0x04;
const VP8X_EXIF = 0x08;

/** Rebuilds the WebP container without its EXIF and XMP chunks. */
function stripWebp(bytes: Uint8Array): Uint8Array | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const riffEnd = 8 + view.getUint32(4, true);
  if (riffEnd > bytes.length) return null;

  const kept: Uint8Array[] = [];
  let hasImage = false;
  let at = 12;
  while (at + 8 <= riffEnd) {
    const fourCC = ascii(bytes, at, 4);
    const size = view.getUint32(at + 4, true);
    const end = Math.min(at + 8 + size + (size % 2), riffEnd);
    if (at + 8 + size > riffEnd) return null;
    let chunk = bytes.subarray(at, end);
    if (fourCC === 'VP8 ' || fourCC === 'VP8L') hasImage = true;
    if (fourCC === 'VP8X' && size >= 1) {
      chunk = chunk.slice();
      chunk[8] = chunk[8]! & ~(VP8X_EXIF | VP8X_XMP);
    }
    if (fourCC !== 'EXIF' && fourCC !== 'XMP ') kept.push(chunk);
    at = end;
  }
  if (!hasImage) return null;

  const header = new Uint8Array(12);
  header.set(bytes.subarray(0, 12));
  const body = concat(kept);
  new DataView(header.buffer).setUint32(4, 4 + body.length, true);
  return concat([header, body]);
}
