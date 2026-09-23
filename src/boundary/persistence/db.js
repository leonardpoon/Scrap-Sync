// BOUNDARY (persistence): the PostgreSQL connection pool.
// The single point where the app talks to the database driver.
import pg from 'pg';
import fs from 'node:fs';
import { config } from '../../config.js';

const ssl = config.database.sslCertFile
  ? { ca: fs.readFileSync(config.database.sslCertFile, 'utf8'), rejectUnauthorized: true }
  : undefined;

export const pool = new pg.Pool({ connectionString: config.database.url, ssl });

export function query(text, params) {
  return pool.query(text, params);
}

export async function closePool() {
  await pool.end();
}
