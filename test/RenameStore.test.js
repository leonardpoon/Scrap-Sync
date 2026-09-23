import assert from 'node:assert/strict';
import test from 'node:test';
import { RenameStore } from '../src/boundary/telegram/renameStore.js';

test('a pending rename is returned only once for its Telegram user', () => {
  RenameStore.start(4321, 'scrapbook-id');
  assert.equal(RenameStore.take(4321), 'scrapbook-id');
  assert.equal(RenameStore.take(4321), null);
});
