// CONTROL: photo ingestion use-case (handoff 3B).
// Enforces ownership, stores bytes via the storage boundary, logs the row.
import crypto from 'node:crypto';
import { ScrapbookRepository } from '../boundary/persistence/ScrapbookRepository.js';
import { ImageRepository } from '../boundary/persistence/ImageRepository.js';
import { MediaStorage } from '../boundary/storage/LocalStorage.js';

export const ImageController = {
  // scrapbookId: target album. requesterId: the Telegram user uploading.
  // buffer/ext: the downloaded photo. caption: optional (same-message only).
  async savePhoto({ scrapbookId, requesterId, buffer, ext = 'jpg', caption = null }) {
    const scrapbook = await ScrapbookRepository.findById(scrapbookId);
    if (!scrapbook) throw new Error('SCRAPBOOK_NOT_FOUND');

    // Ownership check (handoff 4): only the creator may upload.
    if (!scrapbook.isOwnedBy(requesterId)) throw new Error('NOT_OWNER');

    const key = crypto.randomUUID();
    const url = await MediaStorage.save(buffer, { key, ext });

    const cleanCaption = caption && caption.trim().length > 0 ? caption.trim() : null;
    const image = await ImageRepository.create({
      scrapbookId,
      url,
      caption: cleanCaption,
      contributorId: requesterId,
    });
    return { image, scrapbook };
  },

  // A contribution token is a bearer credential: anyone who opens its bot
  // deep-link can submit, while the token remains current.
  async saveContribution({ uploadToken, requesterId, buffer, ext = 'jpg', caption = null }) {
    const scrapbook = await ScrapbookRepository.findByUploadToken(uploadToken);
    if (!scrapbook) throw new Error('CONTRIBUTION_LINK_INVALID');

    const key = crypto.randomUUID();
    const url = await MediaStorage.save(buffer, { key, ext });
    const cleanCaption = caption && caption.trim().length > 0 ? caption.trim() : null;
    const image = await ImageRepository.create({
      scrapbookId: scrapbook.id,
      url,
      caption: cleanCaption,
      contributorId: requesterId,
    });
    return { image, scrapbook };
  },
};
