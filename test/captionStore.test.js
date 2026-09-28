import assert from 'node:assert/strict';
import test from 'node:test';
import { CaptionStore } from '../src/boundary/telegram/captionStore.js';

test('a pending caption edit is returned only once for its Telegram user', () => {
  CaptionStore.start(2468, { scrapbookId: 'scrapbook-id', imageId: 'image-id' });
  assert.deepEqual(CaptionStore.take(2468), { scrapbookId: 'scrapbook-id', imageId: 'image-id' });
  assert.equal(CaptionStore.take(2468), null);
});
