// Short-lived local session after someone opens an album's Telegram deep-link.
// The token is checked again on every upload, so rotating a link revokes access
// immediately, even before this session expires.
const TTL_MS = 24 * 60 * 60 * 1000;
const store = new Map();

export const ContributionStore = {
  set(telegramUserId, uploadToken) {
    store.set(String(telegramUserId), { uploadToken, expiresAt: Date.now() + TTL_MS });
  },

  get(telegramUserId) {
    const key = String(telegramUserId);
    const entry = store.get(key);
    if (!entry || Date.now() > entry.expiresAt) {
      store.delete(key);
      return null;
    }
    return entry.uploadToken;
  },
};

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) if (now > entry.expiresAt) store.delete(key);
}, TTL_MS).unref?.();
