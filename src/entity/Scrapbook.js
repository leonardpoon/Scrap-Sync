// ENTITY: a scrapbook (album). Its `id` (UUID) is also the public share key.
export class Scrapbook {
  constructor({ id, ownerId, title, publicToken, uploadToken, backgroundColor = 'cream', createdAt = null }) {
    this.id = id;
    this.ownerId = ownerId;
    this.title = title;
    this.publicToken = publicToken;
    this.uploadToken = uploadToken;
    this.backgroundColor = backgroundColor;
    this.createdAt = createdAt;
  }

  // Domain rule: only the creator may modify or upload (handoff 4).
  isOwnedBy(telegramUserId) {
    return Number(this.ownerId) === Number(telegramUserId);
  }

  static fromRow(row) {
    if (!row) return null;
    return new Scrapbook({
      id: row.id,
      ownerId: Number(row.owner_id),
      title: row.title,
      publicToken: row.public_token,
      uploadToken: row.upload_token,
      backgroundColor: row.background_color,
      createdAt: row.created_at,
    });
  }
}
