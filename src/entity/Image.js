// ENTITY: a single photo entry inside a scrapbook. caption may be null.
export class Image {
  constructor({ id, scrapbookId, url, caption = null, contributorId = null, createdAt = null }) {
    this.id = id;
    this.scrapbookId = scrapbookId;
    this.url = url;
    this.caption = caption;
    this.contributorId = contributorId;
    this.createdAt = createdAt;
  }

  hasCaption() {
    return typeof this.caption === 'string' && this.caption.trim().length > 0;
  }

  static fromRow(row) {
    if (!row) return null;
    return new Image({
      id: row.id,
      scrapbookId: row.scrapbook_id,
      url: row.url,
      caption: row.caption,
      contributorId: row.contributor_id === null ? null : Number(row.contributor_id),
      createdAt: row.created_at,
    });
  }
}
