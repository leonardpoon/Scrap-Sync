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
import { config } from '../../config.js';

export const MediaStorage = {
  // buffer: Buffer of image bytes. ext: file extension without dot (e.g. 'jpg').
  // Returns an absolute, shareable URL string.
  async save(buffer, { key, ext = 'jpg' }) {
    if (config.media.provider === 'supabase') {
      return saveToSupabase(buffer, { key, ext });
    }
    await fs.mkdir(config.media.dir, { recursive: true });
    const filename = `${key}.${ext}`;
    const fullPath = path.join(config.media.dir, filename);
    await fs.writeFile(fullPath, buffer);
    // Public URL: PUBLIC_BASE_URL + MEDIA_URL_PREFIX + /filename
    return `${config.web.publicBaseUrl}${config.media.urlPrefix}/${filename}`;
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

function mimeTypeFor(ext) {
  const normalised = String(ext).toLowerCase();
  if (normalised === 'png') return 'image/png';
  if (normalised === 'webp') return 'image/webp';
  return 'image/jpeg';
}
