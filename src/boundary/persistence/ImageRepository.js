// BOUNDARY (persistence): reads/writes Image rows. Returns Image entities.
import { query } from './db.js';
import { Image } from '../../entity/Image.js';

export const ImageRepository = {
  async create({ scrapbookId, url, caption = null, contributorId = null }) {
    const { rows } = await query(
      `INSERT INTO images (scrapbook_id, url, caption, contributor_id)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [scrapbookId, url, caption, contributorId],
    );
    return Image.fromRow(rows[0]);
  },

  // All images in a scrapbook, oldest first (scrapbook reading order).
  async listByScrapbook(scrapbookId) {
    const { rows } = await query(
      `SELECT * FROM images WHERE scrapbook_id = $1 ORDER BY created_at ASC`,
      [scrapbookId],
    );
    return rows.map(Image.fromRow);
  },
};
