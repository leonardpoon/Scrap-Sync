// Collect Telegram media albums before deciding where to save them. Telegram
// delivers each item in an album as a separate update, but media_group_id lets
// us present one scrapbook picker for the whole album.
export class MediaGroupStore {
  constructor({ debounceMs = 1200 } = {}) {
    this.debounceMs = debounceMs;
    this.groups = new Map();
  }

  add({ userId, mediaGroupId, messageId, value }, onComplete) {
    const key = `${userId}:${mediaGroupId}`;
    let group = this.groups.get(key);
    if (!group) {
      group = { entries: [], timer: null, onComplete };
      this.groups.set(key, group);
    }

    group.entries.push({ messageId, value });
    clearTimeout(group.timer);
    group.timer = setTimeout(() => {
      this.groups.delete(key);
      const values = group.entries
        .sort((a, b) => a.messageId - b.messageId)
        .map((entry) => entry.value);
      Promise.resolve(group.onComplete(values)).catch((error) => console.error('[media group]', error));
    }, this.debounceMs);
    group.timer.unref?.();
  }
}

export const MediaGroups = new MediaGroupStore();
