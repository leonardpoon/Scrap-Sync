// BOUNDARY (telegram): the Telegram bot adapter.
//
// Translates Telegram updates (commands, photos, inline-keyboard callbacks)
// into calls on the control layer, and formats replies back to the user.
// Contains no business rules — those live in src/control.
import { Bot, InlineKeyboard } from 'grammy';
import { config } from '../../config.js';
import { PALETTE } from '../../entity/palette.js';
import { ScrapbookController } from '../../control/ScrapbookController.js';
import { ImageController } from '../../control/ImageController.js';
import { MenuController } from '../../control/MenuController.js';
import { PendingStore } from './pendingStore.js';
import { ContributionStore } from './contributionStore.js';
import { NewScrapbookStore } from './newScrapbookStore.js';
import { RenameStore } from './renameStore.js';
import { downloadPhoto } from './telegramFiles.js';

export function createBot() {
  const bot = new Bot(config.requireTelegramToken());

  // Albums are personal/contribution-link spaces, never group-chat threads.
  bot.use(async (ctx, next) => {
    if (ctx.chat?.type && ctx.chat.type !== 'private') {
      await ctx.reply('For privacy, Scrap&Sync only works in a private chat with the bot.');
      return;
    }
    return next();
  });

  // ── /start ────────────────────────────────────────────────
  bot.command('start', async (ctx) => {
    await ScrapbookController.registerUser({
      telegramUserId: ctx.from.id,
      firstName: ctx.from.first_name,
      username: ctx.from.username,
    });
    const payload = (ctx.match || '').trim();
    const contributionMatch = /^upload_([a-f0-9]{48})$/.exec(payload);
    if (contributionMatch) {
      ContributionStore.set(ctx.from.id, contributionMatch[1]);
      await ctx.reply(
        'You can now add memories to this scrapbook. Send a photo here; it will be added to the shared album.',
      );
      return;
    }

    await ctx.reply(
      `📔 Welcome to Scrap&Sync, ${ctx.from.first_name || 'there'}!\n\n` +
        `Create a scrapbook, send it photos, and share a link — no app or login needed.\n\n` +
        `• /new "Bali Trip"  — create a scrapbook\n` +
        `• Send a photo (add a caption in the same message)\n` +
      `• /menu  — manage a scrapbook\n` +
        `• /rotate  — replace a contribution link\n` +
        `• /delete  — remove a photo from a scrapbook\n` +
        `• /list  — see your scrapbooks\n` +
        `• /help  — show this again`,
    );
  });

  bot.command('help', (ctx) =>
    ctx.reply(
      `How to use Scrap&Sync:\n\n` +
        `1. /new "Trip name"  creates a scrapbook and gives you a share link.\n` +
        `2. Send photos to me. Put a caption in the photo's caption box to label it.\n` +
      `3. /menu  manages a scrapbook’s colour, name, or deletion.\n` +
      `4. /rotate  replaces a contribution link if it was shared too widely.\n` +
        `5. /delete  lets you find and remove a photo.\n` +
        `6. /list  shows your scrapbooks and their links.`,
    ),
  );

  // ── /new "Title" ──────────────────────────────────────────
  bot.command('new', async (ctx) => {
    const raw = (ctx.match || '').trim().replace(/^["']|["']$/g, '');
    if (!raw) {
      NewScrapbookStore.start(ctx.from.id);
      return ctx.reply('What would you like to call this scrapbook?');
    }
    await createScrapbook(ctx, raw);
  });

  async function createScrapbook(ctx, title) {
    try {
      const { scrapbook, shareUrl, contributionUrl } = await ScrapbookController.create({
        telegramUserId: ctx.from.id,
        firstName: ctx.from.first_name,
        username: ctx.from.username,
        title,
      });
      const contributionNote = contributionUrl
        ? `\n\nWant others to add memories? Share this contribution link only with people you trust:\n${contributionUrl}`
        : '\n\nSet TELEGRAM_BOT_USERNAME in the server configuration to enable contribution links.';
      await ctx.reply(
        `✅ Created “${scrapbook.title}”.\n\n` +
          `Share this link so anyone can view it:\n${shareUrl}\n\n` +
        `Now just send me photos to fill it.${contributionNote}`,
        { link_preview_options: { is_disabled: true } },
      );
    } catch (err) {
      if (err.message === 'EMPTY_TITLE') {
        return ctx.reply('Give your scrapbook a name, e.g.  /new "Bali Trip"');
      }
      console.error('[new]', err);
      await ctx.reply('Something went wrong creating that scrapbook. Please try again.');
    }
  }

  // ── /list ─────────────────────────────────────────────────
  bot.command('list', async (ctx) => {
    const books = await ScrapbookController.listOwned(ctx.from.id);
    if (books.length === 0) {
      return ctx.reply('You have no scrapbooks yet. Create one with  /new "Trip name"');
    }
    const lines = books.map((b) => {
      const contributionUrl = ScrapbookController.contributionUrl(b.uploadToken);
      return `• ${b.title}\n  View: ${ScrapbookController.shareUrl(b.publicToken)}` +
        (contributionUrl ? `\n  Add memories: ${contributionUrl}` : '');
    });
    await ctx.reply(`Your scrapbooks:\n\n${lines.join('\n\n')}`, {
      link_preview_options: { is_disabled: true },
    });
  });

  // ── Photo upload (handoff 3B) ─────────────────────────────
  bot.on('message:photo', async (ctx) => {
    const photos = ctx.message.photo;
    const largest = photos[photos.length - 1]; // best resolution
    const fileId = largest.file_id;
    const caption = ctx.message.caption || null;

    const uploadToken = ContributionStore.get(ctx.from.id);
    if (uploadToken) {
      return ingestContribution(ctx, { fileId, caption, uploadToken });
    }

    const books = await ScrapbookController.listOwned(ctx.from.id);

    if (books.length === 0) {
      return ctx.reply('First create a scrapbook with  /new "Trip name"  then send the photo again.');
    }

    if (books.length === 1) {
      return ingestPhoto(ctx, { fileId, caption, scrapbookId: books[0].id });
    }

    // Multiple scrapbooks: ask which one via inline keyboard.
    const t = PendingStore.put({
      fileId,
      caption,
      requesterId: ctx.from.id,
      scrapbookIds: books.map((b) => b.id),
    });
    const kb = new InlineKeyboard();
    books.forEach((b, i) => kb.text(b.title, `us:${t}:${i}`).row());
    await ctx.reply('Which scrapbook should I save this to?', { reply_markup: kb });
  });

  // Callback: user picked a scrapbook for the pending photo.
  bot.callbackQuery(/^us:([a-f0-9]+):(\d+)$/, async (ctx) => {
    const [, t, idxStr] = ctx.match;
    const pending = PendingStore.get(t);
    if (!pending) {
      await ctx.answerCallbackQuery({ text: 'That request expired — send the photo again.' });
      return ctx.editMessageText('This upload expired. Please send the photo again.');
    }
    const scrapbookId = pending.scrapbookIds[Number(idxStr)];
    PendingStore.remove(t);
    await ctx.answerCallbackQuery();
    await ctx.editMessageText('Saving…');
    await ingestPhoto(ctx, {
      fileId: pending.fileId,
      caption: pending.caption,
      scrapbookId,
      edit: true,
    });
  });

  // ── /menu ─────────────────────────────────────────────────
  bot.command('menu', async (ctx) => {
    const books = await ScrapbookController.listOwned(ctx.from.id);
    if (books.length === 0) {
      return ctx.reply('You have no scrapbooks yet. Create one with  /new "Trip name"');
    }
    if (books.length === 1) {
      return sendScrapbookMenu(ctx, books[0]);
    }
    // Ask which scrapbook to manage.
    const t = PendingStore.put({
      requesterId: ctx.from.id,
      scrapbookIds: books.map((b) => b.id),
    });
    const kb = new InlineKeyboard();
    books.forEach((b, i) => kb.text(b.title, `ms:${t}:${i}`).row());
    await ctx.reply('Which scrapbook would you like to manage?', { reply_markup: kb });
  });

  // Rotating immediately invalidates the old contribution link.
  bot.command('rotate', async (ctx) => {
    const books = await ScrapbookController.listOwned(ctx.from.id);
    if (books.length === 0) return ctx.reply('You have no scrapbooks yet.');
    const t = PendingStore.put({ requesterId: ctx.from.id, scrapbookIds: books.map((b) => b.id) });
    const kb = new InlineKeyboard();
    books.forEach((b, i) => kb.text(b.title, `rt:${t}:${i}`).row());
    await ctx.reply('Choose the scrapbook whose contribution link you want to replace:', { reply_markup: kb });
  });

  // ── /delete ──────────────────────────────────────────────
  // An owner browses photos by date/caption, previews one, then confirms.
  bot.command('delete', async (ctx) => {
    const books = await ScrapbookController.listOwned(ctx.from.id);
    if (books.length === 0) return ctx.reply('You have no scrapbooks yet.');
    if (books.length === 1) {
      return sendDeletionBrowser(ctx, { scrapbookId: books[0].id, requesterId: ctx.from.id });
    }
    const t = PendingStore.put({ requesterId: ctx.from.id, scrapbookIds: books.map((book) => book.id) });
    const kb = new InlineKeyboard();
    books.forEach((book, index) => kb.text(book.title, `ds:${t}:${index}`).row());
    return ctx.reply('Which scrapbook would you like to manage?', { reply_markup: kb });
  });

  bot.callbackQuery(/^ds:([a-f0-9]+):(\d+)$/, async (ctx) => {
    const [, t, indexText] = ctx.match;
    const pending = PendingStore.get(t);
    const scrapbookId = pending?.scrapbookIds?.[Number(indexText)];
    if (!pending || String(pending.requesterId) !== String(ctx.from.id) || !scrapbookId) {
      await ctx.answerCallbackQuery({ text: 'That menu expired — send /delete again.' });
      return ctx.editMessageText('This menu expired. Send /delete again.');
    }
    await ctx.answerCallbackQuery();
    return sendDeletionBrowser(ctx, { scrapbookId, requesterId: ctx.from.id, edit: true });
  });

  bot.callbackQuery(/^dp:([a-f0-9]+):(\d+)$/, async (ctx) => {
    const [, t, indexText] = ctx.match;
    const pending = PendingStore.get(t);
    const imageId = pending?.imageIds?.[Number(indexText)];
    if (!pending || String(pending.requesterId) !== String(ctx.from.id) || !imageId) {
      await ctx.answerCallbackQuery({ text: 'That photo list expired — send /delete again.' });
      return;
    }
    try {
      const image = await ImageController.findOwnedPhoto({
        imageId, scrapbookId: pending.scrapbookId, requesterId: ctx.from.id,
      });
      const confirmToken = PendingStore.put({
        requesterId: ctx.from.id, scrapbookId: pending.scrapbookId, imageId: image.id,
      });
      await ctx.answerCallbackQuery();
      await ctx.replyWithPhoto(image.url, {
        caption: `Delete this photo?\n${photoDescription(image)}`,
        reply_markup: new InlineKeyboard()
          .text('Delete photo', `dx:${confirmToken}`)
          .text('Keep it', `dk:${confirmToken}`),
      });
    } catch (error) {
      console.error('[delete preview]', error);
      await ctx.answerCallbackQuery({ text: 'Could not open that photo.' });
    }
  });

  bot.callbackQuery(/^dn:([a-f0-9]+):(\d+)$/, async (ctx) => {
    const [, t, pageText] = ctx.match;
    const pending = PendingStore.get(t);
    if (!pending || String(pending.requesterId) !== String(ctx.from.id)) {
      await ctx.answerCallbackQuery({ text: 'That photo list expired — send /delete again.' });
      return ctx.editMessageText('This photo list expired. Send /delete again.');
    }
    await ctx.answerCallbackQuery();
    return sendDeletionBrowser(ctx, {
      scrapbookId: pending.scrapbookId, requesterId: ctx.from.id, page: Number(pageText), edit: true,
    });
  });

  bot.callbackQuery(/^dk:([a-f0-9]+)$/, async (ctx) => {
    const [, t] = ctx.match;
    PendingStore.remove(t);
    await ctx.answerCallbackQuery({ text: 'Kept' });
    return ctx.editMessageCaption('Kept — this photo was not deleted.');
  });

  bot.callbackQuery(/^dx:([a-f0-9]+)$/, async (ctx) => {
    const [, t] = ctx.match;
    const pending = PendingStore.get(t);
    if (!pending || String(pending.requesterId) !== String(ctx.from.id)) {
      await ctx.answerCallbackQuery({ text: 'That confirmation expired — send /delete again.' });
      return;
    }
    try {
      const { mediaDeleted } = await ImageController.deleteOwnedPhoto({
        imageId: pending.imageId, scrapbookId: pending.scrapbookId, requesterId: ctx.from.id,
      });
      PendingStore.remove(t);
      await ctx.answerCallbackQuery({ text: 'Photo deleted' });
      return ctx.editMessageCaption(
        mediaDeleted ? '🗑️ Photo deleted.' : '🗑️ Photo removed from the scrapbook. Storage cleanup is pending.',
      );
    } catch (error) {
      console.error('[delete photo]', error);
      await ctx.answerCallbackQuery({ text: 'Could not delete that photo.' });
    }
  });

  bot.callbackQuery(/^rt:([a-f0-9]+):(\d+)$/, async (ctx) => {
    const [, t, idxStr] = ctx.match;
    const pending = PendingStore.get(t);
    if (!pending) return ctx.editMessageText('This request expired. Send /rotate again.');
    PendingStore.remove(t);
    try {
      const { scrapbook, contributionUrl } = await ScrapbookController.rotateContributionLink({
        scrapbookId: pending.scrapbookIds[Number(idxStr)], requesterId: ctx.from.id,
      });
      const text = contributionUrl
        ? `Replaced the contribution link for “${scrapbook.title}”. The old link no longer works.\n\nNew link:\n${contributionUrl}`
        : 'Link rotated. Set TELEGRAM_BOT_USERNAME to display the new deep link.';
      await ctx.answerCallbackQuery({ text: 'Link replaced' });
      await ctx.editMessageText(text, { link_preview_options: { is_disabled: true } });
    } catch (err) {
      console.error('[rotate]', err);
      await ctx.answerCallbackQuery({ text: 'Could not rotate the link.' });
    }
  });

  // Callback: picked which scrapbook -> show management actions.
  bot.callbackQuery(/^ms:([a-f0-9]+):(\d+)$/, async (ctx) => {
    const [, t, idxStr] = ctx.match;
    const pending = PendingStore.get(t);
    if (!pending) {
      await ctx.answerCallbackQuery({ text: 'That menu expired — send /menu again.' });
      return ctx.editMessageText('This menu expired. Please send /menu again.');
    }
    const scrapbookId = pending.scrapbookIds[Number(idxStr)];
    PendingStore.remove(t);
    await ctx.answerCallbackQuery();
    await sendScrapbookMenu(ctx, { id: scrapbookId }, { edit: true });
  });

  bot.callbackQuery(/^mb:([a-f0-9]+)$/, async (ctx) => {
    const [, t] = ctx.match;
    const pending = PendingStore.get(t);
    if (!pending || String(pending.requesterId) !== String(ctx.from.id)) {
      await ctx.answerCallbackQuery({ text: 'That menu expired — send /menu again.' });
      return ctx.editMessageText('This menu expired. Send /menu again.');
    }
    PendingStore.remove(t);
    await ctx.answerCallbackQuery();
    return sendColorMenu(ctx, { id: pending.scrapbookId }, { edit: true });
  });

  bot.callbackQuery(/^mm:([a-f0-9]+)$/, async (ctx) => {
    const [, t] = ctx.match;
    const pending = PendingStore.get(t);
    if (!pending || String(pending.requesterId) !== String(ctx.from.id)) {
      await ctx.answerCallbackQuery({ text: 'That menu expired — send /menu again.' });
      return ctx.editMessageText('This menu expired. Send /menu again.');
    }
    PendingStore.remove(t);
    await ctx.answerCallbackQuery();
    return sendManagementMenu(ctx, { id: pending.scrapbookId }, { edit: true });
  });

  bot.callbackQuery(/^mn:([a-f0-9]+)$/, async (ctx) => {
    const [, t] = ctx.match;
    const pending = PendingStore.get(t);
    if (!pending || String(pending.requesterId) !== String(ctx.from.id)) {
      await ctx.answerCallbackQuery({ text: 'That menu expired — send /menu again.' });
      return ctx.editMessageText('This menu expired. Send /menu again.');
    }
    PendingStore.remove(t);
    RenameStore.start(ctx.from.id, pending.scrapbookId);
    await ctx.answerCallbackQuery();
    return ctx.editMessageText('Send the new scrapbook name.');
  });

  bot.callbackQuery(/^md:([a-f0-9]+)$/, async (ctx) => {
    const [, t] = ctx.match;
    const pending = PendingStore.get(t);
    if (!pending || String(pending.requesterId) !== String(ctx.from.id)) {
      await ctx.answerCallbackQuery({ text: 'That menu expired — send /menu again.' });
      return ctx.editMessageText('This menu expired. Send /menu again.');
    }
    PendingStore.remove(t);
    const confirmToken = PendingStore.put({ requesterId: ctx.from.id, scrapbookId: pending.scrapbookId });
    await ctx.answerCallbackQuery();
    return ctx.editMessageText(
      'Delete this entire scrapbook and all of its photos? This cannot be undone.',
      {
        reply_markup: new InlineKeyboard()
          .text('Delete scrapbook', `mx:${confirmToken}`)
          .text('Keep it', `mk:${confirmToken}`),
      },
    );
  });

  bot.callbackQuery(/^mk:([a-f0-9]+)$/, async (ctx) => {
    const [, t] = ctx.match;
    PendingStore.remove(t);
    await ctx.answerCallbackQuery({ text: 'Kept' });
    return ctx.editMessageText('Kept — this scrapbook was not deleted.');
  });

  bot.callbackQuery(/^mx:([a-f0-9]+)$/, async (ctx) => {
    const [, t] = ctx.match;
    const pending = PendingStore.get(t);
    if (!pending || String(pending.requesterId) !== String(ctx.from.id)) {
      await ctx.answerCallbackQuery({ text: 'That confirmation expired — send /menu again.' });
      return;
    }
    try {
      const result = await ScrapbookController.deleteOwned({
        scrapbookId: pending.scrapbookId, requesterId: ctx.from.id,
      });
      PendingStore.remove(t);
      await ctx.answerCallbackQuery({ text: 'Scrapbook deleted' });
      const cleanupNote = result.mediaCleanupFailures ? '\nSome storage cleanup is pending.' : '';
      return ctx.editMessageText(`🗑️ Deleted “${result.scrapbook.title}” and ${result.imageCount} photo(s).${cleanupNote}`);
    } catch (error) {
      console.error('[delete scrapbook]', error);
      await ctx.answerCallbackQuery({ text: 'Could not delete that scrapbook.' });
    }
  });

  // Callback: picked a colour swatch -> write it (ownership-checked).
  bot.callbackQuery(/^mc:([a-f0-9]+):([a-z]+)$/, async (ctx) => {
    const [, t, colorKey] = ctx.match;
    const pending = PendingStore.get(t);
    if (!pending) {
      await ctx.answerCallbackQuery({ text: 'That menu expired — send /menu again.' });
      return ctx.editMessageText('This menu expired. Please send /menu again.');
    }
    try {
      const updated = await MenuController.setBackgroundColor({
        scrapbookId: pending.scrapbookId,
        requesterId: ctx.from.id,
        colorKey,
      });
      PendingStore.remove(t);
      await ctx.answerCallbackQuery({ text: 'Updated ✅' });
      await ctx.editMessageText(
        `Background updated ✅ — “${updated.title}” now uses ${PALETTE[colorKey].label}.\n` +
          `Your gallery will reflect this on next visit.`,
      );
    } catch (err) {
      if (err.message === 'NOT_OWNER') {
        await ctx.answerCallbackQuery({ text: 'That is not your scrapbook.' });
        return;
      }
      console.error('[menu]', err);
      await ctx.answerCallbackQuery({ text: 'Something went wrong.' });
    }
  });

  // Gentle nudge for stray text.
  bot.on('message:text', async (ctx) => {
    if (ctx.message.text.startsWith('/')) return; // unknown command, ignore
    if (NewScrapbookStore.take(ctx.from.id)) {
      return createScrapbook(ctx, ctx.message.text.trim());
    }
    const scrapbookId = RenameStore.take(ctx.from.id);
    if (scrapbookId) {
      try {
        const scrapbook = await ScrapbookController.rename({
          scrapbookId, requesterId: ctx.from.id, title: ctx.message.text,
        });
        return ctx.reply(`✅ Renamed scrapbook to “${scrapbook.title}”.`);
      } catch (error) {
        const message = error.message === 'EMPTY_TITLE'
          ? 'Please send a name with at least one character.'
          : 'Could not rename that scrapbook. Send /menu and try again.';
        return ctx.reply(message);
      }
    }
    return ctx.reply('Send me a photo to add it to a scrapbook, or /new to create one.');
  });

  bot.catch((err) => console.error('[bot error]', err.error ?? err));

  return bot;
}

// ── Helpers ──────────────────────────────────────────────────

async function ingestPhoto(ctx, { fileId, caption, scrapbookId, edit = false }) {
  try {
    const { buffer, ext } = await downloadPhoto(ctx.api, fileId);
    const { image, scrapbook } = await ImageController.savePhoto({
      scrapbookId,
      requesterId: ctx.from.id,
      buffer,
      ext,
      caption,
    });
    const note = image.caption ? ` with your caption` : '';
    const text = `📸 Added to “${scrapbook.title}”${note}.\n${ScrapbookController.shareUrl(scrapbook.publicToken)}`;
    if (edit) await ctx.editMessageText(text, { link_preview_options: { is_disabled: true } });
    else await ctx.reply(text, { link_preview_options: { is_disabled: true } });
  } catch (err) {
    const msg =
      err.message === 'NOT_OWNER'
        ? 'That scrapbook is not yours.'
        : 'Sorry, I could not save that photo. Please try again.';
    console.error('[ingest]', err);
    if (edit) await ctx.editMessageText(msg);
    else await ctx.reply(msg);
  }
}

async function ingestContribution(ctx, { fileId, caption, uploadToken }) {
  try {
    const { buffer, ext } = await downloadPhoto(ctx.api, fileId);
    const { scrapbook } = await ImageController.saveContribution({
      uploadToken, requesterId: ctx.from.id, buffer, ext, caption,
    });
    await ctx.reply(`📸 Added to “${scrapbook.title}”. Thanks for sharing a memory!`);
  } catch (err) {
    const message = err.message === 'CONTRIBUTION_LINK_INVALID'
      ? 'This contribution link has been replaced or revoked. Ask the owner for a new link.'
      : 'Sorry, I could not save that photo. Please try again.';
    console.error('[contribution]', err);
    await ctx.reply(message);
  }
}

async function sendColorMenu(ctx, scrapbook, { edit = false } = {}) {
  const t = PendingStore.put({ scrapbookId: scrapbook.id, requesterId: ctx.from.id });
  const kb = new InlineKeyboard();
  Object.entries(PALETTE).forEach(([key, { label }], i) => {
    kb.text(label, `mc:${t}:${key}`);
    if (i % 2 === 1) kb.row(); // two swatches per row
  });
  const text = 'Choose a background:';
  if (edit) await ctx.editMessageText(text, { reply_markup: kb });
  else await ctx.reply(text, { reply_markup: kb });
}

async function sendScrapbookMenu(ctx, scrapbook, { edit = false } = {}) {
  const t = PendingStore.put({ scrapbookId: scrapbook.id, requesterId: ctx.from.id });
  const kb = new InlineKeyboard()
    .text('Background', `mb:${t}`)
    .text('Scrapbook management', `mm:${t}`);
  const text = 'What would you like to change?';
  return edit ? ctx.editMessageText(text, { reply_markup: kb }) : ctx.reply(text, { reply_markup: kb });
}

async function sendManagementMenu(ctx, scrapbook, { edit = false } = {}) {
  const t = PendingStore.put({ scrapbookId: scrapbook.id, requesterId: ctx.from.id });
  const kb = new InlineKeyboard()
    .text('Rename', `mn:${t}`)
    .row()
    .text('Delete scrapbook', `md:${t}`);
  const text = 'Scrapbook management:';
  return edit ? ctx.editMessageText(text, { reply_markup: kb }) : ctx.reply(text, { reply_markup: kb });
}

const deleteDateFormatter = new Intl.DateTimeFormat('en-SG', {
  timeZone: 'Asia/Singapore', day: 'numeric', month: 'short', year: 'numeric',
});

function photoDescription(image) {
  const date = deleteDateFormatter.format(new Date(image.createdAt));
  return image.hasCaption() ? `${date} · ${image.caption}` : `${date} · no caption`;
}

async function sendDeletionBrowser(ctx, { scrapbookId, requesterId, page = 0, edit = false }) {
  try {
    const photos = (await ImageController.listOwnedPhotos({ scrapbookId, requesterId })).reverse();
    if (photos.length === 0) {
      const text = 'This scrapbook has no photos to delete.';
      return edit ? ctx.editMessageText(text) : ctx.reply(text);
    }

    const pageSize = 6;
    const pageCount = Math.ceil(photos.length / pageSize);
    const safePage = Math.max(0, Math.min(page, pageCount - 1));
    const start = safePage * pageSize;
    const pagePhotos = photos.slice(start, start + pageSize);
    const t = PendingStore.put({
      requesterId, scrapbookId, imageIds: pagePhotos.map((photo) => photo.id),
    });
    const kb = new InlineKeyboard();
    pagePhotos.forEach((photo, index) => {
      const number = start + index + 1;
      kb.text(photoButtonLabel(photo, number), `dp:${t}:${index}`).row();
    });
    if (safePage > 0) kb.text('‹ Newer', `dn:${t}:${safePage - 1}`);
    if (safePage < pageCount - 1) kb.text('Older ›', `dn:${t}:${safePage + 1}`);

    const text = `Choose a photo to preview and delete (${start + 1}–${start + pagePhotos.length} of ${photos.length}):`;
    return edit ? ctx.editMessageText(text, { reply_markup: kb }) : ctx.reply(text, { reply_markup: kb });
  } catch (error) {
    console.error('[delete browser]', error);
    const text = 'Could not load this scrapbook’s photos. Please try /delete again.';
    return edit ? ctx.editMessageText(text) : ctx.reply(text);
  }
}

function photoButtonLabel(image, number) {
  const caption = image.hasCaption()
    ? image.caption.replace(/\s+/g, ' ').trim().slice(0, 28)
    : 'no caption';
  return `#${number} · ${deleteDateFormatter.format(new Date(image.createdAt))} · ${caption}`.slice(0, 62);
}
