// CONTROL: customization use-case — /menu background colour (handoff 3E).
import { ScrapbookRepository } from '../boundary/persistence/ScrapbookRepository.js';
import { isValidColor } from '../entity/palette.js';

export const MenuController = {
  async setBackgroundColor({ scrapbookId, requesterId, colorKey }) {
    if (!isValidColor(colorKey)) throw new Error('INVALID_COLOR');

    const scrapbook = await ScrapbookRepository.findById(scrapbookId);
    if (!scrapbook) throw new Error('SCRAPBOOK_NOT_FOUND');

    // Ownership check (handoff 3E step 6): same rule as upload.
    if (!scrapbook.isOwnedBy(requesterId)) throw new Error('NOT_OWNER');

    return ScrapbookRepository.updateBackgroundColor(scrapbookId, colorKey);
  },
};
