// ENTITY: a Telegram user (the owner identity in the domain).
// Pure domain object — no database or Telegram knowledge.
export class User {
  constructor({ telegramUserId, firstName = null, username = null, createdAt = null }) {
    this.telegramUserId = telegramUserId;
    this.firstName = firstName;
    this.username = username;
    this.createdAt = createdAt;
  }

  static fromRow(row) {
    if (!row) return null;
    return new User({
      telegramUserId: Number(row.telegram_user_id),
      firstName: row.first_name,
      username: row.username,
      createdAt: row.created_at,
    });
  }
}
