// BOUNDARY (persistence): the PostgreSQL connection pool.
// The single point where the app talks to the database driver.
import pg from 'pg';
import { config } from '../../config.js';

export const pool = new pg.Pool({ connectionString: config.database.url });

export function query(text, params) {
  return pool.query(text, params);
}

export async function closePool() {
  await pool.end();
}
