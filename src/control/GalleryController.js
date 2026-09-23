// CONTROL: web viewer use-case (handoff 3C/3D).
// Builds the view model for a public gallery, including the alternating
// photo/caption row layout metadata.
import { ScrapbookRepository } from '../boundary/persistence/ScrapbookRepository.js';
import { ImageRepository } from '../boundary/persistence/ImageRepository.js';
import { hexFor, isDark } from '../entity/palette.js';

const uploadDateFormatter = new Intl.DateTimeFormat('en-SG', {
  timeZone: 'Asia/Singapore',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

export function formatUploadDate(createdAt) {
  const date = new Date(createdAt);
  return Number.isNaN(date.getTime()) ? '' : uploadDateFormatter.format(date);
}

export const GalleryController = {
  // Returns null if the scrapbook UUID does not exist (handoff 4:
  // without the exact UUID the gallery is inaccessible).
  async getGallery(publicToken) {
    const scrapbook = await ScrapbookRepository.findByPublicToken(publicToken).catch(() => null);
    if (!scrapbook) return null;

    const images = await ImageRepository.listByScrapbook(scrapbook.id);

    // Precompute per-row presentation (handoff 3D): alternating side + rotation.
    const rows = images.map((img, i) => ({
      url: img.url,
      caption: img.caption,
      hasCaption: img.hasCaption(),
      uploadDate: formatUploadDate(img.createdAt),
      photoSide: i % 2 === 0 ? 'left' : 'right', // even = photo left
      rotation: i % 2 === 0 ? -2 : 2,            // degrees
    }));

    return {
      title: scrapbook.title,
      backgroundHex: hexFor(scrapbook.backgroundColor),
      dark: isDark(scrapbook.backgroundColor),
      isDemo: false,
      rows,
      count: rows.length,
    };
  },
};
