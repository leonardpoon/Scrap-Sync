// CONTROL: scrapbook use-cases (create, list, resolve share link).
import { UserRepository } from '../boundary/persistence/UserRepository.js';
import { ScrapbookRepository } from '../boundary/persistence/ScrapbookRepository.js';
import { config } from '../config.js';
import { DEFAULT_COLOR } from '../entity/palette.js';

export const ScrapbookController = {
  // Ensure the Telegram user exists in our system. (handoff 3A step 2)
  async registerUser({ telegramUserId, firstName, username }) {
    return UserRepository.upsert({ telegramUserId, firstName, username });
  },

  // handoff 3A: create a scrapbook and return it plus its public link.
  async create({ telegramUserId, firstName, username, title }) {
    const cleanTitle = (title || '').trim();
    if (!cleanTitle) {
      throw new Error('EMPTY_TITLE');
    }
    await UserRepository.upsert({ telegramUserId, firstName, username });
    const scrapbook = await ScrapbookRepository.create({
      ownerId: telegramUserId,
      title: cleanTitle,
      backgroundColor: DEFAULT_COLOR,
    });
    return {
      scrapbook,
      shareUrl: this.shareUrl(scrapbook.publicToken),
      contributionUrl: this.contributionUrl(scrapbook.uploadToken),
    };
  },

  async listOwned(telegramUserId) {
    return ScrapbookRepository.listByOwner(telegramUserId);
  },

  shareUrl(publicToken) {
    return `${config.web.publicBaseUrl}/s/${publicToken}`;
  },

  contributionUrl(uploadToken) {
    if (!config.telegram.botUsername) return null;
    return `https://t.me/${config.telegram.botUsername}?start=upload_${uploadToken}`;
  },

  async rotateContributionLink({ scrapbookId, requesterId }) {
    const scrapbook = await ScrapbookRepository.findById(scrapbookId);
    if (!scrapbook) throw new Error('SCRAPBOOK_NOT_FOUND');
    if (!scrapbook.isOwnedBy(requesterId)) throw new Error('NOT_OWNER');
    const updated = await ScrapbookRepository.rotateUploadToken(scrapbookId);
    return { scrapbook: updated, contributionUrl: this.contributionUrl(updated.uploadToken) };
  },
};
