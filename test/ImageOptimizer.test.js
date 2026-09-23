import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import sharp from 'sharp';
import { optimizePhoto } from '../src/boundary/image/ImageOptimizer.js';

test('large uploads are compressed to a bounded JPEG without cropping', async () => {
  const source = await sharp({
    create: { width: 2000, height: 1000, channels: 3, background: '#5b8c85' },
  }).png().toBuffer();

  const optimised = await optimizePhoto(source);
  const metadata = await sharp(optimised.buffer).metadata();

  assert.equal(optimised.ext, 'jpg');
  assert.equal(metadata.format, 'jpeg');
  assert.equal(metadata.width, 1600);
  assert.equal(metadata.height, 800);
});

test('small uploads retain their dimensions', async () => {
  const source = await sharp({
    create: { width: 320, height: 240, channels: 3, background: '#d8c3a5' },
  }).png().toBuffer();

  const optimised = await optimizePhoto(source);
  const metadata = await sharp(optimised.buffer).metadata();

  assert.equal(metadata.width, 320);
  assert.equal(metadata.height, 240);
});

test('high-detail uploads are reduced below the configured storage target', async () => {
  const pixels = crypto.randomBytes(2000 * 1000 * 3);
  const source = await sharp(pixels, {
    raw: { width: 2000, height: 1000, channels: 3 },
  }).png().toBuffer();

  const optimised = await optimizePhoto(source);

  assert.ok(optimised.buffer.length <= 200 * 1024);
});
