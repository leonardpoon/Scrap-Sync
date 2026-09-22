import assert from 'node:assert/strict';
import test from 'node:test';
import { NewScrapbookStore } from '../src/boundary/telegram/newScrapbookStore.js';

test('a pending scrapbook title is consumed once for its Telegram user', () => {
  NewScrapbookStore.start(1234);
  assert.equal(NewScrapbookStore.take(1234), true);
  assert.equal(NewScrapbookStore.take(1234), false);
});
