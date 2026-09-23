# Scrap&Sync

A frictionless digital scrapbook platform. People create albums and upload
photos by chatting **1‑on‑1 with a Telegram bot** — no app install, no signup.
Each album becomes a read‑only web gallery reachable through a secret link.
Owners can also issue a separate secret Telegram contribution link so trusted
people can add photos without receiving an app-specific account.

This repository is a runnable implementation of the
[project handoff document](#), organised in **BCE (Boundary · Control · Entity)**
layers.

---

## What runs where

| Piece | Tech | Notes |
|-------|------|-------|
| Ingestion | Telegram bot (grammY, long polling) | The only way to add content |
| Compute | Node.js | One process runs the bot and the web viewer |
| Database | PostgreSQL 17 | Runs in Docker (`docker compose`) by default |
| Media storage | Local disk (`media/`) | Swappable for Cloudflare R2 — see below |
| Web viewer | Express + EJS | Renders the alternating "scrapbook page" layout |

The handoff doc specifies Supabase + Cloudflare R2 + serverless. This build uses
**local Postgres and local disk** so it runs end‑to‑end on your machine with no
cloud accounts. Both are isolated behind boundary adapters, so moving to the
cloud later touches one file each (noted below).

---

## Architecture (BCE)

```
src/
├─ entity/                  ENTITY — pure domain objects, no I/O
│  ├─ User.js
│  ├─ Scrapbook.js          (owns the isOwnedBy ownership rule)
│  ├─ Image.js
│  └─ palette.js            (the 5 preset background swatches)
│
├─ control/                 CONTROL — use-cases / business logic
│  ├─ ScrapbookController.js (create album, share link, list)
│  ├─ ImageController.js     (ingest photo: ownership → store → log)
│  ├─ MenuController.js      (set background colour, ownership-checked)
│  └─ GalleryController.js   (build the web view model)
│
└─ boundary/                BOUNDARY — everything that touches the outside
   ├─ telegram/
   │  ├─ bot.js             (grammY commands & inline-keyboard callbacks)
   │  ├─ telegramFiles.js   (download photo bytes from Telegram)
   │  └─ pendingStore.js    (short-lived context for callback buttons)
   ├─ web/
   │  ├─ server.js          (Express routes)
   │  ├─ views/*.ejs        (gallery + error pages)
   │  └─ public/styles.css  (scrapbook-page layout)
   ├─ storage/
   │  └─ LocalStorage.js    (save bytes → return URL; swap for R2 here)
   └─ persistence/
      ├─ db.js              (pg pool)
      ├─ UserRepository.js
      ├─ ScrapbookRepository.js
      └─ ImageRepository.js
```

**Dependency rule:** boundary → control → entity. Entities know nothing about
Postgres or Telegram; controllers hold the rules; boundaries do the I/O.

---

## Prerequisites

Already present on this machine: Node.js 20+, Docker Desktop, PostgreSQL 17.
You only need a **Telegram account** to create a bot.

---

## Setup

### 1. Start the database

```bash
docker compose up -d
```

This starts PostgreSQL on **host port 5434** (5432 and 5433 were already taken)
and auto‑applies `db/schema.sql` the first time. Verify:

```bash
docker exec scrapsync-db psql -U scrapsync -d scrapsync -c "\dt"
```

> **Prefer your existing local PostgreSQL instead of Docker?**
> Create a database and user, run `npm run db:setup`, and set `DATABASE_URL`
> in `.env` to point at it (e.g. `postgres://user:pass@localhost:5432/scrapsync`).

### 2. Configure environment

```bash
cp .env.example .env
```

`.env` is pre‑filled to match the Docker database. The one value you must add is
`TELEGRAM_BOT_TOKEN` — see the next section.

### 3. Install dependencies

```bash
npm install
```

### 4. Create the Telegram bot

1. Open Telegram and message **[@BotFather](https://t.me/BotFather)**.
2. Send `/newbot`. Choose a display name (e.g. `Scrap and Sync`) and a username
   ending in `bot` (e.g. `scrap_sync_dev_bot`).
3. BotFather replies with an **HTTP API token** like
   `123456789:AAExxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`.
4. Paste it into `.env` as `TELEGRAM_BOT_TOKEN=...`.
5. (Optional) In BotFather, `/setcommands` and paste:
   ```
   start - Get started
   new - Create a scrapbook: /new "Trip name"
   list - List your scrapbooks and links
   menu - Customise a scrapbook's background
   help - How to use the bot
   rotate - Replace a scrapbook contribution link
   ```

No webhook or public URL is needed — the bot uses long polling.

### 5. Run

```bash
npm start
```

You should see the web viewer come up on `http://localhost:3000` and the bot log
`@your_bot is running`. Message your bot `/start` in Telegram.

Run one side only if you like: `npm run web` or `npm run bot`.

---

## Using it

1. `/start` — registers you.
2. `/new "Bali Trip"` — creates a scrapbook, replies with a share link
   `http://localhost:3000/s/<uuid>`.
3. **Send a photo.** Add a caption in the photo's caption box to label it
   (captions in a separate follow‑up message are not captured — MVP scope).
   If you own several scrapbooks, the bot asks which one via buttons.
4. `/menu` — pick a background colour (Cream · Kraft brown · Blush pink ·
   Sage green · Charcoal). Only the owner can change it.
5. Open the share link in a browser. Photos render in an alternating
   left/right photo‑and‑caption layout with a slight tilt; captionless photos
   show centred; on mobile the rows stack.

Since the local `PUBLIC_BASE_URL` is `localhost`, share links only open on your
own machine. To share for real, set `PUBLIC_BASE_URL` to a public URL (e.g. an
ngrok tunnel or a deployed host) and restart.

The root URL displays a static demo scrapbook using the images in `assets/`, so
the gallery design can be reviewed before Telegram and PostgreSQL are configured.

## Sharing and contributions

Every scrapbook has two high-entropy, random links:

- The **view link** is read-only and safe to share with viewers.
- The **contribution link** opens the Telegram bot and lets its holder submit
  photos to that one scrapbook. Set `TELEGRAM_BOT_USERNAME` in `.env` (without
  `@`) for these deep links to be generated.

The bot records each contributor's Telegram ID with their upload. Owners can
use `/rotate` to replace a contribution link immediately; the old link stops
working. Treat contribution links like an invitation and share them only with
people you trust.

## Image optimisation

Every uploaded Telegram photo is auto-oriented and stored in R2 as a progressive
JPEG. The optimizer starts at a 1600-pixel longest edge and quality 82, then
progressively lowers JPEG quality and dimensions (without cropping) until the
stored file is at most 200 KiB. This keeps galleries fast and makes storage
capacity predictable. Adjust `IMAGE_MAX_DIMENSION` (maximum 4096),
`IMAGE_JPEG_QUALITY` (40–95), or `IMAGE_MAX_BYTES` if you need a different
quality/size trade-off.

---

## Going to the cloud later

- **Media → Cloudflare R2:** supported through the R2 adapter. Set
  `MEDIA_PROVIDER=r2`, configure the `R2_*` values in `.env`, and use a
  bucket-scoped Object Read & Write credential. Nothing else changes —
  controllers only depend on `save()`.
- **Database → Supabase:** point `DATABASE_URL` at your Supabase Postgres
  connection string and run `npm run db:setup`. The schema is identical.

---

## Security model (as specified)

- Each scrapbook UUID is mapped to its creator's `telegram_user_id`; only the
  creator can upload to it or change its settings (enforced in
  `ImageController` and `MenuController`).
- The web viewer has **no login**: the UUID in the link *is* the credential.
  Pages send `noindex, nofollow` and unknown UUIDs are indistinguishable from
  "not found".

---

## Continuous delivery

Every push to `develop` runs `npm ci` and `npm test` in GitHub Actions. When
those checks pass, the tested commit fast-forwards `main`. The workflow refuses
to overwrite `main` if it has commits that are not already present in `develop`.

In the GitHub repository, ensure **Settings → Actions → General → Workflow
permissions** is set to **Read and write permissions**. If `main` is protected,
also allow GitHub Actions to bypass that branch protection (or adjust the rule
to permit this workflow to push). This keeps `main` limited to tested commits.

---

## Production: Render + Supabase

`render.yaml` deploys the web viewer and Telegram long-polling bot together as
a Render web service. Use a non-sleeping Render plan: the bot must remain
running to receive messages. Render applies the idempotent database schema on
each deploy before starting the service.

Create a Supabase project for PostgreSQL and a Cloudflare R2 bucket named
`scrapsync-media` for photos. Enable the R2 bucket's public URL (or connect a
custom media domain for production). In Render, add the following values as
secret environment variables:

```text
DATABASE_URL=<Supabase Session Pooler connection string, with sslmode=require>
PUBLIC_BASE_URL=https://<your-render-service>.onrender.com
TELEGRAM_BOT_TOKEN=<BotFather token>
TELEGRAM_BOT_USERNAME=<BotFather username, without @>
MEDIA_PROVIDER=r2
R2_ACCOUNT_ID=<Cloudflare account ID>
R2_ACCESS_KEY_ID=<bucket-scoped R2 access key ID>
R2_SECRET_ACCESS_KEY=<bucket-scoped R2 secret access key>
R2_BUCKET=scrapsync-media
R2_PUBLIC_BASE_URL=https://<your-public-bucket>.r2.dev
```

`R2_SECRET_ACCESS_KEY` grants the service access to upload images. Keep it in
Render only; never commit it or send it to a browser. Scope the R2 token to the
single `scrapsync-media` bucket with Object Read & Write permission.
