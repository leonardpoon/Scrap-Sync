import assert from 'node:assert/strict';
import test from 'node:test';
import { Scrapbook } from '../src/entity/Scrapbook.js';
import { DEFAULT_COLOR, hexFor, isDark, isValidColor } from '../src/entity/palette.js';

test('a scrapbook recognises its owner regardless of Telegram ID representation', () => {
  const scrapbook = new Scrapbook({
    id: 'book-id', ownerId: 123456, title: 'A shared day', publicToken: 'public', uploadToken: 'upload',
  });

  assert.equal(scrapbook.isOwnedBy(123456), true);
  assert.equal(scrapbook.isOwnedBy('123456'), true);
  assert.equal(scrapbook.isOwnedBy(999999), false);
});

test('the palette accepts only known colours and falls back safely', () => {
  assert.equal(DEFAULT_COLOR, 'cream');
  assert.equal(isValidColor('sage'), true);
  assert.equal(isValidColor('neon'), false);
  assert.equal(hexFor('not-a-colour'), hexFor(DEFAULT_COLOR));
  assert.equal(isDark('charcoal'), true);
  assert.equal(isDark('cream'), false);
});
