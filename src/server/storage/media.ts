import 'server-only';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type * as S3 from '@aws-sdk/client-s3';
import type { S3Client } from '@aws-sdk/client-s3';
import { isDevelopment, serverEnv } from '@/env/server';

/**
 * Where uploaded photos live: a Cloudflare R2 bucket (S3-compatible API) in deployed environments,
 * a .media/ folder (served by /api/dev/media) on a developer's machine. Keys never change once
 * written — a new photo gets a new key — so they are cached forever.
 */
export type MediaStore = {
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  remove(key: string): Promise<void>;
  url(key: string): string;
};

/** shops/<shopId>/<photoId>.<ext> — the only keys the app writes. */
const keyPattern =
  /^shops\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.(jpg|webp)$/;

export const isMediaKey = (key: string) => keyPattern.test(key);
export const shopPhotoKey = (shopId: string, photoId: string, extension: string) =>
  `shops/${shopId}/${photoId}.${extension}`;
/** The photo's id (its file name without extension), or null for a foreign key. */
export const photoIdOf = (key: string) => keyPattern.exec(key)?.[1] ?? null;

const cacheForever = 'public, max-age=31536000, immutable';

function r2Store(bucket: string, baseUrl: string): MediaStore {
  // Loaded on first use: the SDK is big and most requests never touch photos.
  let client: Promise<{ client: S3Client; sdk: typeof S3 }> | null = null;
  const s3 = () =>
    (client ??= import('@aws-sdk/client-s3').then((sdk) => ({
      sdk,
      client: new sdk.S3Client({
        region: 'auto',
        endpoint: `https://${serverEnv.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId: serverEnv.R2_ACCESS_KEY_ID ?? '',
          secretAccessKey: serverEnv.R2_SECRET_ACCESS_KEY ?? '',
        },
        // R2 doesn't support every checksum the SDK sends by default.
        requestChecksumCalculation: 'WHEN_REQUIRED',
        responseChecksumValidation: 'WHEN_REQUIRED',
      }),
    })));

  return {
    async put(key, body, contentType) {
      const { sdk, client } = await s3();
      await client.send(
        new sdk.PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
          CacheControl: cacheForever,
        }),
      );
    },
    async remove(key) {
      const { sdk, client } = await s3();
      await client.send(new sdk.DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },
    url: (key) => `${baseUrl}/${key}`,
  };
}

const localRoot = path.join(process.cwd(), '.media');

function localFile(key: string): string {
  if (!isMediaKey(key)) throw new Error(`not a media key: ${key}`);
  return path.join(localRoot, ...key.split('/'));
}

function localStore(): MediaStore {
  const guard = () => {
    if (!isDevelopment) throw new Error('MEDIA_BUCKET is not set; local photo storage is dev-only');
  };
  return {
    async put(key, body) {
      guard();
      const file = localFile(key);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, body);
    },
    async remove(key) {
      guard();
      await rm(localFile(key), { force: true });
    },
    url: (key) => `/api/dev/media/${key}`,
  };
}

/** A photo from the local store, for /api/dev/media; null when there is no such file. */
export async function readLocalMedia(key: string): Promise<Uint8Array | null> {
  if (!isDevelopment || !isMediaKey(key)) return null;
  return readFile(localFile(key)).catch(() => null);
}

export const cacheControlForMedia = cacheForever;

export const media: MediaStore =
  serverEnv.MEDIA_BUCKET && serverEnv.MEDIA_BASE_URL
    ? r2Store(serverEnv.MEDIA_BUCKET, serverEnv.MEDIA_BASE_URL)
    : localStore();
