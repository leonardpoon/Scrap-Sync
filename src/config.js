// Central configuration, loaded once from environment (.env).
import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}. Copy .env.example to .env and fill it in.`);
  }
  return value;
}

function positiveInteger(value, fallback, { minimum = 1, maximum = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
}

export const config = {
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
    botUsername: (process.env.TELEGRAM_BOT_USERNAME || '').replace(/^@/, ''),
  },
  database: {
    url: process.env.DATABASE_URL || 'postgres://scrapsync:scrapsync@localhost:5432/scrapsync',
    sslCertFile: process.env.DATABASE_SSL_CA_FILE
      ? path.resolve(projectRoot, process.env.DATABASE_SSL_CA_FILE)
      : '',
  },
  web: {
    port: Number(process.env.PORT || 3000),
    publicBaseUrl: (process.env.PUBLIC_BASE_URL || process.env.RENDER_EXTERNAL_URL || 'http://localhost:3000').replace(/\/$/, ''),
  },
  media: {
    provider: process.env.MEDIA_PROVIDER || 'local',
    dir: path.resolve(projectRoot, process.env.MEDIA_DIR || './media'),
    urlPrefix: process.env.MEDIA_URL_PREFIX || '/media',
    supabaseUrl: (process.env.SUPABASE_URL || '').replace(/\/$/, ''),
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    supabaseBucket: process.env.SUPABASE_STORAGE_BUCKET || 'scrapbook-media',
    r2AccountId: process.env.R2_ACCOUNT_ID || '',
    r2AccessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    r2SecretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
    r2Bucket: process.env.R2_BUCKET || 'scrapsync-media',
    r2PublicBaseUrl: (process.env.R2_PUBLIC_BASE_URL || '').replace(/\/$/, ''),
  },
  images: {
    maxDimension: positiveInteger(process.env.IMAGE_MAX_DIMENSION, 1600, { maximum: 4096 }),
    jpegQuality: positiveInteger(process.env.IMAGE_JPEG_QUALITY, 82, { minimum: 40, maximum: 95 }),
    maxBytes: positiveInteger(process.env.IMAGE_MAX_BYTES, 200 * 1024, { minimum: 50 * 1024 }),
    maxInputPixels: positiveInteger(process.env.IMAGE_MAX_INPUT_PIXELS, 100_000_000),
  },
  paths: {
    projectRoot,
  },
  requireTelegramToken() {
    return required('TELEGRAM_BOT_TOKEN');
  },
};
