-- ─────────────────────────────────────────────────────────────
-- Scrap&Sync database schema (PostgreSQL)
-- Mirrors the Supabase schema from the handoff doc, section 2 & 4.
-- ─────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS "pgcrypto";  -- for gen_random_uuid()

-- Telegram users who interact with the bot.
-- telegram_user_id is the immutable owner identity (handoff 3A/4).
CREATE TABLE IF NOT EXISTS users (
    telegram_user_id  BIGINT       PRIMARY KEY,
    first_name        TEXT,
    username          TEXT,
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- A scrapbook (album). Its UUID doubles as the public sharing "password"
-- (handoff 4: security through obscurity).
CREATE TABLE IF NOT EXISTS scrapbooks (
    id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id          BIGINT       NOT NULL REFERENCES users(telegram_user_id) ON DELETE CASCADE,
    title             TEXT         NOT NULL,
    public_token      TEXT         NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
    upload_token      TEXT         NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
    background_color  TEXT         NOT NULL DEFAULT 'cream',  -- palette key, handoff 3E
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scrapbooks_owner ON scrapbooks(owner_id);

-- Safe upgrades for databases created before share and contribution tokens.
ALTER TABLE scrapbooks ADD COLUMN IF NOT EXISTS public_token TEXT;
ALTER TABLE scrapbooks ADD COLUMN IF NOT EXISTS upload_token TEXT;
UPDATE scrapbooks SET public_token = encode(gen_random_bytes(24), 'hex') WHERE public_token IS NULL;
UPDATE scrapbooks SET upload_token = encode(gen_random_bytes(24), 'hex') WHERE upload_token IS NULL;
ALTER TABLE scrapbooks ALTER COLUMN public_token SET DEFAULT encode(gen_random_bytes(24), 'hex');
ALTER TABLE scrapbooks ALTER COLUMN upload_token SET DEFAULT encode(gen_random_bytes(24), 'hex');
ALTER TABLE scrapbooks ALTER COLUMN public_token SET NOT NULL;
ALTER TABLE scrapbooks ALTER COLUMN upload_token SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_scrapbooks_public_token ON scrapbooks(public_token);
CREATE UNIQUE INDEX IF NOT EXISTS idx_scrapbooks_upload_token ON scrapbooks(upload_token);

-- One photo entry inside a scrapbook. caption is nullable (handoff 2, 3B).
CREATE TABLE IF NOT EXISTS images (
    id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    scrapbook_id      UUID         NOT NULL REFERENCES scrapbooks(id) ON DELETE CASCADE,
    url               TEXT         NOT NULL,
    caption           TEXT,
    contributor_id    BIGINT       REFERENCES users(telegram_user_id) ON DELETE SET NULL,
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_images_scrapbook ON images(scrapbook_id, created_at);
ALTER TABLE images ADD COLUMN IF NOT EXISTS contributor_id BIGINT REFERENCES users(telegram_user_id) ON DELETE SET NULL;
