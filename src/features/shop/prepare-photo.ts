import { MAX_PHOTO_BYTES, PHOTO_MAX_EDGE } from './schemas';

/** The picked file isn't a photo the phone can open (or is too big even after resizing). */
export class PhotoUnreadable extends Error {
  constructor() {
    super('photo unreadable');
    this.name = 'PhotoUnreadable';
  }
}

type Decoded = { source: CanvasImageSource; width: number; height: number; close: () => void };

async function decode(file: File): Promise<Decoded> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      close: () => bitmap.close(),
    };
  } catch {
    // Older WebViews, or formats only <img> decodes (HEIC on iPhones).
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.src = url;
    try {
      await image.decode();
    } catch {
      URL.revokeObjectURL(url);
      throw new PhotoUnreadable();
    }
    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      close: () => URL.revokeObjectURL(url),
    };
  }
}

const encode = (canvas: HTMLCanvasElement, type: string, quality: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

/**
 * Resizes and re-encodes a picked photo on the phone before upload: a 4 MB camera photo becomes a
 * few hundred KB, and redrawing it drops EXIF — including where the photo was taken.
 * WebP where the browser can write it (Safari can't), JPEG otherwise.
 */
export async function preparePhoto(file: File): Promise<Blob> {
  const image = await decode(file);
  const scale = Math.min(1, PHOTO_MAX_EDGE / Math.max(image.width, image.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const context = canvas.getContext('2d');
  if (!context || !image.width) {
    image.close();
    throw new PhotoUnreadable();
  }
  context.drawImage(image.source, 0, 0, canvas.width, canvas.height);
  image.close();

  for (const quality of [0.82, 0.7, 0.55]) {
    const webp = await encode(canvas, 'image/webp', quality);
    // Browsers that can't write WebP silently return a PNG instead.
    const blob = webp?.type === 'image/webp' ? webp : await encode(canvas, 'image/jpeg', quality);
    if (blob && blob.size <= MAX_PHOTO_BYTES) return blob;
  }
  throw new PhotoUnreadable();
}
