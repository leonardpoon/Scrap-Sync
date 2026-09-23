// One pending rename per Telegram user. Kept separate from generic callback
// state because the next action is a normal text message rather than a button.
const TTL_MS = 10 * 60 * 1000;
const store = new Map();

export const RenameStore = {
  start(telegramUserId, scrapbookId) {
    store.set(String(telegramUserId), { scrapbookId, expiresAt: Date.now() + TTL_MS });
  },

  take(telegramUserId) {
    const key = String(telegramUserId);
    const entry = store.get(key);
    store.delete(key);
    if (!entry || Date.now() > entry.expiresAt) return null;
    return entry.scrapbookId;
  },
};
