// BOUNDARY (persistence): reads/writes Scrapbook rows. Returns Scrapbook entities.
import { query } from './db.js';
import { Scrapbook } from '../../entity/Scrapbook.js';

export const ScrapbookRepository = {
  async create({ ownerId, title, backgroundColor = 'cream' }) {
    const { rows } = await query(
      `INSERT INTO scrapbooks (owner_id, title, background_color)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [ownerId, title, backgroundColor],
    );
    return Scrapbook.fromRow(rows[0]);
  },

  async findById(id) {
    const { rows } = await query(`SELECT * FROM scrapbooks WHERE id = $1`, [id]);
    return Scrapbook.fromRow(rows[0]);
  },

  async findByPublicToken(publicToken) {
    const { rows } = await query(`SELECT * FROM scrapbooks WHERE public_token = $1`, [publicToken]);
    return Scrapbook.fromRow(rows[0]);
  },

  async findByUploadToken(uploadToken) {
    const { rows } = await query(`SELECT * FROM scrapbooks WHERE upload_token = $1`, [uploadToken]);
    return Scrapbook.fromRow(rows[0]);
  },

  // All scrapbooks owned by a user, oldest first (stable ordering for menus).
  async listByOwner(ownerId) {
    const { rows } = await query(
      `SELECT * FROM scrapbooks WHERE owner_id = $1 ORDER BY created_at ASC`,
      [ownerId],
    );
    return rows.map(Scrapbook.fromRow);
  },

  async updateBackgroundColor(id, backgroundColor) {
    const { rows } = await query(
      `UPDATE scrapbooks SET background_color = $2 WHERE id = $1 RETURNING *`,
      [id, backgroundColor],
    );
    return Scrapbook.fromRow(rows[0]);
  },

  async rotateUploadToken(id) {
    const { rows } = await query(
      `UPDATE scrapbooks SET upload_token = encode(gen_random_bytes(24), 'hex') WHERE id = $1 RETURNING *`,
      [id],
    );
    return Scrapbook.fromRow(rows[0]);
  },
};
