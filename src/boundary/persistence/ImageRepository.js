// BOUNDARY (persistence): reads/writes Image rows. Returns Image entities.
import { query } from './db.js';
import { Image } from '../../entity/Image.js';

export const ImageRepository = {
  async create({ scrapbookId, url, caption = null, contributorId = null }) {
    const { rows } = await query(
      `INSERT INTO images (scrapbook_id, url, caption, contributor_id, display_order)
       VALUES ($1, $2, $3, $4,
         COALESCE((SELECT MAX(display_order) + 1 FROM images WHERE scrapbook_id = $1), 1))
       RETURNING *`,
      [scrapbookId, url, caption, contributorId],
    );
    return Image.fromRow(rows[0]);
  },

  // All images in their owner-defined scrapbook reading order.
  async listByScrapbook(scrapbookId) {
    const { rows } = await query(
      `SELECT * FROM images WHERE scrapbook_id = $1 ORDER BY display_order ASC, created_at ASC, id ASC`,
      [scrapbookId],
    );
    return rows.map(Image.fromRow);
  },

  async findByIdAndScrapbook(id, scrapbookId) {
    const { rows } = await query(
      `SELECT * FROM images WHERE id = $1 AND scrapbook_id = $2`,
      [id, scrapbookId],
    );
    return Image.fromRow(rows[0]);
  },

  async updateCaption(id, scrapbookId, caption) {
    const { rows } = await query(
      `UPDATE images SET caption = $3
       WHERE id = $1 AND scrapbook_id = $2
       RETURNING *`,
      [id, scrapbookId, caption],
    );
    return Image.fromRow(rows[0]);
  },

  async deleteByIdAndScrapbook(id, scrapbookId) {
    const { rows } = await query(
      `DELETE FROM images WHERE id = $1 AND scrapbook_id = $2 RETURNING *`,
      [id, scrapbookId],
    );
    return Image.fromRow(rows[0]);
  },

  async move({ imageId, scrapbookId, direction }) {
    const { rows: currentRows } = await query(
      'SELECT id, display_order FROM images WHERE id = $1 AND scrapbook_id = $2',
      [imageId, scrapbookId],
    );
    const current = currentRows[0];
    if (!current) return null;
    const comparator = direction === 'earlier' ? '<' : '>';
    const order = direction === 'earlier' ? 'DESC' : 'ASC';
    const { rows: adjacentRows } = await query(
      `SELECT id, display_order FROM images
       WHERE scrapbook_id = $1 AND display_order ${comparator} $2
       ORDER BY display_order ${order} LIMIT 1`,
      [scrapbookId, current.display_order],
    );
    const adjacent = adjacentRows[0];
    if (!adjacent) return { moved: false };
    await query(
      `UPDATE images
       SET display_order = CASE
         WHEN id = $1 THEN $3
         WHEN id = $2 THEN $4
       END
       WHERE id IN ($1, $2)`,
      [current.id, adjacent.id, adjacent.display_order, current.display_order],
    );
    return { moved: true };
  },
};
