// BOUNDARY (telegram): downloads a photo's bytes from Telegram's file API.
import { config } from '../../config.js';

// ctx.api.getFile gives a file_path; the bytes live at
// https://api.telegram.org/file/bot<token>/<file_path>
export async function downloadPhoto(api, fileId) {
  const file = await api.getFile(fileId);
  const token = config.requireTelegramToken();
  const url = `https://api.telegram.org/file/bot${token}/${file.file_path}`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download Telegram file (${res.status})`);
  }
  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Derive extension from the file path (Telegram photos are usually .jpg).
  const ext = (file.file_path.split('.').pop() || 'jpg').toLowerCase();
  return { buffer, ext };
}
