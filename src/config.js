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

export const config = {
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
    botUsername: (process.env.TELEGRAM_BOT_USERNAME || '').replace(/^@/, ''),
  },
  database: {
    url: process.env.DATABASE_URL || 'postgres://scrapsync:scrapsync@localhost:5432/scrapsync',
  },
  web: {
    port: Number(process.env.PORT || 3000),
    publicBaseUrl: (process.env.PUBLIC_BASE_URL || 'http://localhost:3000').replace(/\/$/, ''),
  },
  media: {
    provider: process.env.MEDIA_PROVIDER || 'local',
    dir: path.resolve(projectRoot, process.env.MEDIA_DIR || './media'),
    urlPrefix: process.env.MEDIA_URL_PREFIX || '/media',
    supabaseUrl: (process.env.SUPABASE_URL || '').replace(/\/$/, ''),
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    supabaseBucket: process.env.SUPABASE_STORAGE_BUCKET || 'scrapbook-media',
  },
  paths: {
    projectRoot,
  },
  requireTelegramToken() {
    return required('TELEGRAM_BOT_TOKEN');
  },
};
