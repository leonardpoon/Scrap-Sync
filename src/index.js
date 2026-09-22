// Entry point. Starts the web viewer and/or the Telegram bot.
//   node src/index.js            -> both
//   node src/index.js --web-only -> web viewer only
//   node src/index.js --bot-only -> Telegram bot only
import { config } from './config.js';
import { startWeb } from './boundary/web/server.js';
import { createBot } from './boundary/telegram/bot.js';
import { closePool } from './boundary/persistence/db.js';

const args = process.argv.slice(2);
const webOnly = args.includes('--web-only');
const botOnly = args.includes('--bot-only');

let server = null;
let bot = null;

async function main() {
  if (!botOnly) {
    server = startWeb();
  }

  if (!webOnly) {
    if (!config.telegram.botToken) {
      console.warn(
        '⚠  TELEGRAM_BOT_TOKEN is not set — bot NOT started. ' +
          'Set it in .env (see README) or run with --web-only.',
      );
    } else {
      bot = createBot();
      bot.start({
        onStart: (me) => console.log(`🤖 Telegram bot @${me.username} is running (long polling).`),
      });
    }
  }
}

async function shutdown() {
  console.log('\nShutting down…');
  try {
    if (bot) await bot.stop();
    if (server) await new Promise((r) => server.close(r));
    await closePool();
  } finally {
    process.exit(0);
  }
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
