// BOUNDARY (image): turns Telegram photo uploads into compact web JPEGs.
// Controllers depend only on optimizePhoto(), not on the image library.
import sharp from 'sharp';
import { config } from '../../config.js';

export async function optimizePhoto(buffer) {
  try {
    const source = sharp(buffer, {
      limitInputPixels: config.images.maxInputPixels,
    });
    const metadata = await source.metadata();
    const longestEdge = Math.min(
      config.images.maxDimension,
      Math.max(metadata.width || 0, metadata.height || 0),
    );
    const qualities = Array.from(
      { length: Math.floor((config.images.jpegQuality - 40) / 6) + 1 },
      (_, index) => Math.max(40, config.images.jpegQuality - (index * 6)),
    );

    for (let dimension = longestEdge; dimension >= 64; dimension = Math.floor(dimension * 0.8)) {
      for (const quality of qualities) {
        const { data, info } = await sharp(buffer, {
          limitInputPixels: config.images.maxInputPixels,
        })
          .rotate()
          .resize({
            width: dimension,
            height: dimension,
            fit: 'inside',
            withoutEnlargement: true,
          })
          .jpeg({ quality, mozjpeg: true, progressive: true })
          .toBuffer({ resolveWithObject: true });

        if (data.length <= config.images.maxBytes) {
          return { buffer: data, ext: 'jpg', width: info.width, height: info.height };
        }
      }
    }

    throw new Error('IMAGE_TARGET_SIZE_UNREACHABLE');
  } catch (error) {
    throw new Error('IMAGE_PROCESSING_FAILED', { cause: error });
  }
}
