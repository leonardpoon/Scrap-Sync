import test from 'node:test';
import assert from 'node:assert/strict';
import { MediaGroupStore } from '../src/boundary/telegram/mediaGroupStore.js';

test('a Telegram media group is delivered once and ordered by message ID', async () => {
  const store = new MediaGroupStore({ debounceMs: 15 });
  const groups = [];
  const finish = (items) => groups.push(items);

  store.add({ userId: 1, mediaGroupId: 'album', messageId: 12, value: 'second' }, finish);
  store.add({ userId: 1, mediaGroupId: 'album', messageId: 11, value: 'first' }, finish);

  await new Promise((resolve) => setTimeout(resolve, 35));
  assert.deepEqual(groups, [['first', 'second']]);
});
