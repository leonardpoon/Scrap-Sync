// Applies db/schema.sql to the database in DATABASE_URL.
// Run once after creating the database:  npm run db:setup
import { readFile } from 'node:fs/promises';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { config } from '../src/config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const schemaPath = path.resolve(__dirname, '../db/schema.sql');
  const sql = await readFile(schemaPath, 'utf8');

  const ssl = config.database.sslCertFile
    ? { ca: fs.readFileSync(config.database.sslCertFile, 'utf8'), rejectUnauthorized: true }
    : undefined;
  const client = new pg.Client({ connectionString: config.database.url, ssl });
  await client.connect();
  console.log(`Connected to ${redact(config.database.url)}`);
  await client.query(sql);
  console.log('✅ Schema applied (users, scrapbooks, images).');
  await client.end();
}

function redact(url) {
  return url.replace(/:\/\/([^:]+):[^@]+@/, '://$1:****@');
}

main().catch((err) => {
  console.error('❌ DB setup failed:', err.message);
  process.exit(1);
});
