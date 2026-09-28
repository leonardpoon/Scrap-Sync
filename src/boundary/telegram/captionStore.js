// One pending caption edit per user. A separate store keeps the next normal
// text message from being mistaken for a scrapbook name or general chat.
const TTL_MS = 10 * 60 * 1000;
const store = new Map();

export const CaptionStore = {
  start(telegramUserId, { scrapbookId, imageId }) {
    store.set(String(telegramUserId), { scrapbookId, imageId, expiresAt: Date.now() + TTL_MS });
  },

  take(telegramUserId) {
    const key = String(telegramUserId);
    const entry = store.get(key);
    store.delete(key);
    if (!entry || Date.now() > entry.expiresAt) return null;
    return { scrapbookId: entry.scrapbookId, imageId: entry.imageId };
  },
};
