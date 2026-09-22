// BOUNDARY (persistence): reads/writes User rows. Returns User entities.
import { query } from './db.js';
import { User } from '../../entity/User.js';

export const UserRepository = {
  // Insert on first contact, refresh name/username on later ones. (handoff 3A)
  async upsert({ telegramUserId, firstName, username }) {
    const { rows } = await query(
      `INSERT INTO users (telegram_user_id, first_name, username)
       VALUES ($1, $2, $3)
       ON CONFLICT (telegram_user_id)
       DO UPDATE SET first_name = EXCLUDED.first_name,
                     username   = EXCLUDED.username
       RETURNING *`,
      [telegramUserId, firstName ?? null, username ?? null],
    );
    return User.fromRow(rows[0]);
  },

  async findById(telegramUserId) {
    const { rows } = await query(
      `SELECT * FROM users WHERE telegram_user_id = $1`,
      [telegramUserId],
    );
    return User.fromRow(rows[0]);
  },
};
