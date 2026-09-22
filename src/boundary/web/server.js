// BOUNDARY (web): the public read-only gallery viewer (handoff 3C/3D).
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../../config.js';
import { GalleryController } from '../../control/GalleryController.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createWebApp() {
  const app = express();

  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));

  // Serve uploaded media (the local-disk storage adapter output).
  app.use(config.media.urlPrefix, express.static(config.media.dir, { maxAge: '1y' }));

  // Static assets (stylesheet).
  app.use('/assets', express.static(path.join(__dirname, 'public'), { maxAge: '1h' }));
  app.use('/demo-assets', express.static(path.join(config.paths.projectRoot, 'assets'), { maxAge: '1h' }));

  app.get('/', (_req, res) => {
    // A real-looking preview makes the product understandable before the bot
    // and database are configured. It is static and never writes user data.
    res.render('gallery', {
      title: 'Little moments, kept close',
      backgroundHex: '#f5efe0',
      dark: false,
      count: 2,
      isDemo: true,
      rows: [
        {
          url: '/demo-assets/photo_2024-02-27_16-03-57.jpg',
          caption: 'The long road, the wide sky, and nowhere else to be.',
          hasCaption: true,
          photoSide: 'left',
          rotation: -2,
        },
        {
          url: '/demo-assets/photo_2026-05-05_00-41-45.jpg',
          caption: 'A small reminder that the best memories are shared.',
          hasCaption: true,
          photoSide: 'right',
          rotation: 2,
        },
      ],
    });
  });

  // Public gallery. The UUID is the only credential (handoff 4).
  app.get('/s/:id', async (req, res) => {
    let view;
    try {
      view = await GalleryController.getGallery(req.params.id);
    } catch (err) {
      console.error('[gallery]', err);
      return res.status(500).render('error', { message: 'Something went wrong.' });
    }
    if (!view) {
      // Wrong/unknown UUID: indistinguishable from "not found" on purpose.
      return res.status(404).render('error', { message: 'Scrapbook not found.' });
    }
    res.render('gallery', view);
  });

  app.use((_req, res) => res.status(404).render('error', { message: 'Scrapbook not found.' }));

  return app;
}

export function startWeb() {
  const app = createWebApp();
  return app.listen(config.web.port, () => {
    console.log(`🌐 Web viewer on ${config.web.publicBaseUrl}  (port ${config.web.port})`);
  });
}
