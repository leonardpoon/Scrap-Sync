// BOUNDARY (telegram): short-lived context store for inline-keyboard flows.
//
// Telegram callback_data is capped at 64 bytes, too small to carry a photo
// file_id + scrapbook UUID. So we stash the pending context here under a short
// token and only put that token in the button. Single-process, in-memory —
// fine for the MVP. Swap for Redis if the bot is ever horizontally scaled.
import crypto from 'node:crypto';

const TTL_MS = 10 * 60 * 1000; // 10 minutes
const store = new Map(); // token -> { data, expiresAt }

function token() {
  return crypto.randomBytes(6).toString('hex'); // 12 chars
}

export const PendingStore = {
  put(data) {
    const t = token();
    store.set(t, { data, expiresAt: Date.now() + TTL_MS });
    return t;
  },

  get(t) {
    const entry = store.get(t);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      store.delete(t);
      return null;
    }
    return entry.data;
  },

  remove(t) {
    store.delete(t);
  },
};

// Periodic sweep of expired entries.
setInterval(() => {
  const now = Date.now();
  for (const [t, entry] of store) {
    if (now > entry.expiresAt) store.delete(t);
  }
}, TTL_MS).unref?.();
