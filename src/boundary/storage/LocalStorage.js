// BOUNDARY (storage): media storage adapter.
//
// This is the local-disk implementation used for development. It writes the
// photo bytes under MEDIA_DIR and returns a public URL served by the web app.
//
// To move to Cloudflare R2 (handoff 2), replace the body of `save()` with an
// S3 PutObject call and return the R2 public URL. Nothing else in the app
// needs to change — controllers only depend on this `save()` contract.
import fs from 'node:fs/promises';
import path from 'node:path';
import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { config } from '../../config.js';

let r2Client;

export const MediaStorage = {
  // buffer: Buffer of image bytes. ext: file extension without dot (e.g. 'jpg').
  // Returns an absolute, shareable URL string.
  async save(buffer, { key, ext = 'jpg' }) {
    if (config.media.provider === 'supabase') {
      return saveToSupabase(buffer, { key, ext });
    }
    if (config.media.provider === 'r2') {
      return saveToR2(buffer, { key, ext });
    }
    await fs.mkdir(config.media.dir, { recursive: true });
    const filename = `${key}.${ext}`;
    const fullPath = path.join(config.media.dir, filename);
    await fs.writeFile(fullPath, buffer);
    // Public URL: PUBLIC_BASE_URL + MEDIA_URL_PREFIX + /filename
    return `${config.web.publicBaseUrl}${config.media.urlPrefix}/${filename}`;
  },

  async remove(url) {
    if (config.media.provider === 'supabase') return removeFromSupabase(url);
    if (config.media.provider === 'r2') return removeFromR2(url);
    return removeFromLocalDisk(url);
  },
};

async function saveToSupabase(buffer, { key, ext }) {
  const { supabaseUrl, supabaseServiceRoleKey, supabaseBucket } = config.media;
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error('SUPABASE_STORAGE_NOT_CONFIGURED');
  }

  const filename = `${key}.${ext}`;
  const objectUrl = `${supabaseUrl}/storage/v1/object/${encodeURIComponent(supabaseBucket)}/${filename}`;
  const response = await fetch(objectUrl, {
    method: 'POST',
    headers: {
      apikey: supabaseServiceRoleKey,
      Authorization: `Bearer ${supabaseServiceRoleKey}`,
      'Content-Type': mimeTypeFor(ext),
      'x-upsert': 'false',
    },
    body: buffer,
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`SUPABASE_STORAGE_UPLOAD_FAILED: ${response.status} ${detail}`);
  }

  // The bucket is intentionally public: gallery pages need image URLs that a
  // visitor's browser can render without receiving a server credential.
  return `${supabaseUrl}/storage/v1/object/public/${encodeURIComponent(supabaseBucket)}/${filename}`;
}

async function saveToR2(buffer, { key, ext }) {
  const {
    r2AccountId, r2AccessKeyId, r2SecretAccessKey, r2Bucket, r2PublicBaseUrl,
  } = config.media;
  if (!r2AccountId || !r2AccessKeyId || !r2SecretAccessKey || !r2PublicBaseUrl) {
    throw new Error('R2_STORAGE_NOT_CONFIGURED');
  }

  r2Client = getR2Client();

  const filename = `${key}.${ext}`;
  try {
    await r2Client.send(new PutObjectCommand({
      Bucket: r2Bucket,
      Key: filename,
      Body: buffer,
      ContentType: mimeTypeFor(ext),
    }));
  } catch (error) {
    throw new Error(`R2_STORAGE_UPLOAD_FAILED: ${error.message}`, { cause: error });
  }

  return `${r2PublicBaseUrl}/${filename}`;
}

async function removeFromR2(url) {
  const key = objectKeyFromPublicUrl(url, config.media.r2PublicBaseUrl);
  try {
    await getR2Client().send(new DeleteObjectCommand({ Bucket: config.media.r2Bucket, Key: key }));
  } catch (error) {
    throw new Error(`R2_STORAGE_DELETE_FAILED: ${error.message}`, { cause: error });
  }
}

async function removeFromSupabase(url) {
  const { supabaseUrl, supabaseServiceRoleKey, supabaseBucket } = config.media;
  const publicBase = `${supabaseUrl}/storage/v1/object/public/${encodeURIComponent(supabaseBucket)}`;
  const key = objectKeyFromPublicUrl(url, publicBase);
  const objectUrl = `${supabaseUrl}/storage/v1/object/${encodeURIComponent(supabaseBucket)}/${key}`;
  const response = await fetch(objectUrl, {
    method: 'DELETE',
    headers: { apikey: supabaseServiceRoleKey, Authorization: `Bearer ${supabaseServiceRoleKey}` },
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(`SUPABASE_STORAGE_DELETE_FAILED: ${response.status}`);
  }
}

async function removeFromLocalDisk(url) {
  const key = objectKeyFromPublicUrl(url, `${config.web.publicBaseUrl}${config.media.urlPrefix}`);
  const fullPath = path.resolve(config.media.dir, key);
  if (!fullPath.startsWith(`${config.media.dir}${path.sep}`)) throw new Error('LOCAL_STORAGE_URL_INVALID');
  try {
    await fs.unlink(fullPath);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

function objectKeyFromPublicUrl(url, baseUrl) {
  const prefix = `${baseUrl.replace(/\/$/, '')}/`;
  if (!url.startsWith(prefix)) throw new Error('STORAGE_URL_INVALID');
  return decodeURIComponent(url.slice(prefix.length));
}

function getR2Client() {
  const { r2AccountId, r2AccessKeyId, r2SecretAccessKey } = config.media;
  if (!r2AccountId || !r2AccessKeyId || !r2SecretAccessKey) {
    throw new Error('R2_STORAGE_NOT_CONFIGURED');
  }
  if (!r2Client) {
    r2Client = new S3Client({
      region: 'auto',
      endpoint: `https://${r2AccountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: r2AccessKeyId, secretAccessKey: r2SecretAccessKey },
    });
  }
  return r2Client;
}

function mimeTypeFor(ext) {
  const normalised = String(ext).toLowerCase();
  if (normalised === 'png') return 'image/png';
  if (normalised === 'webp') return 'image/webp';
  return 'image/jpeg';
}
