import assert from 'node:assert/strict';
import test from 'node:test';
import { formatUploadDate } from '../src/control/GalleryController.js';

test('an image upload timestamp is formatted as a Singapore calendar date', () => {
  assert.equal(formatUploadDate('2026-09-23T15:30:00.000Z'), '23 Sept 2026');
  assert.equal(formatUploadDate('not-a-date'), '');
});
