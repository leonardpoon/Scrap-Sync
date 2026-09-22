// A brief conversational state for the friendly `/new` → title flow.
const TTL_MS = 10 * 60 * 1000;
const requests = new Map();

export const NewScrapbookStore = {
  start(telegramUserId) {
    requests.set(String(telegramUserId), Date.now() + TTL_MS);
  },

  take(telegramUserId) {
    const key = String(telegramUserId);
    const expiresAt = requests.get(key);
    requests.delete(key);
    return Boolean(expiresAt && Date.now() <= expiresAt);
  },
};

setInterval(() => {
  const now = Date.now();
  for (const [key, expiresAt] of requests) if (now > expiresAt) requests.delete(key);
}, TTL_MS).unref?.();
