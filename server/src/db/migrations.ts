export interface Migration {
  version: number;
  name: string;
  sql: string;
}

// Append only. Never edit a migration that has shipped.
export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: "initial schema",
    sql: `
      CREATE TABLE settings (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL            -- JSON
      );

      CREATE TABLE users (
        id            INTEGER PRIMARY KEY,
        username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
        password_hash TEXT NOT NULL,
        created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );

      CREATE TABLE sessions (
        id         TEXT PRIMARY KEY,   -- sha256 of the cookie token
        user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        expires_at TEXT NOT NULL
      );
      CREATE INDEX sessions_expires ON sessions(expires_at);

      CREATE TABLE recipients (
        id         INTEGER PRIMARY KEY,
        name       TEXT NOT NULL DEFAULT '',
        email      TEXT NOT NULL UNIQUE COLLATE NOCASE,
        enabled    INTEGER NOT NULL DEFAULT 1,
        source     TEXT NOT NULL DEFAULT 'manual',   -- manual | tautulli | import
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );

      CREATE TABLE templates (
        id         INTEGER PRIMARY KEY,
        name       TEXT NOT NULL UNIQUE COLLATE NOCASE,
        html       TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );

      CREATE TABLE newsletters (
        id             INTEGER PRIMARY KEY,
        name           TEXT NOT NULL,
        subject        TEXT NOT NULL DEFAULT '',
        template_id    INTEGER REFERENCES templates(id) ON DELETE SET NULL,
        schedule       TEXT NOT NULL DEFAULT '{}',    -- JSON
        history_days   INTEGER,                        -- NULL = settings default
        send_as_bcc    INTEGER NOT NULL DEFAULT 1,
        all_recipients INTEGER NOT NULL DEFAULT 1,
        enabled        INTEGER NOT NULL DEFAULT 0,
        created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );

      CREATE TABLE newsletter_recipients (
        newsletter_id INTEGER NOT NULL REFERENCES newsletters(id) ON DELETE CASCADE,
        recipient_id  INTEGER NOT NULL REFERENCES recipients(id) ON DELETE CASCADE,
        PRIMARY KEY (newsletter_id, recipient_id)
      );

      CREATE TABLE sends (
        id              INTEGER PRIMARY KEY,
        newsletter_id   INTEGER REFERENCES newsletters(id) ON DELETE SET NULL,
        newsletter_name TEXT NOT NULL DEFAULT '',
        trigger         TEXT NOT NULL,                -- scheduled | manual | test
        scheduled_for   TEXT,                         -- slot this run fulfils (scheduled only)
        status          TEXT NOT NULL,                -- running | sent | failed | skipped
        recipient_count INTEGER NOT NULL DEFAULT 0,
        error           TEXT,
        started_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        finished_at     TEXT
      );
      -- A scheduled slot can only ever be claimed once: duplicate sends are impossible.
      CREATE UNIQUE INDEX sends_one_per_slot ON sends(newsletter_id, scheduled_for)
        WHERE scheduled_for IS NOT NULL;
      CREATE INDEX sends_started ON sends(started_at);

      CREATE TABLE host_pick (
        id            INTEGER PRIMARY KEY CHECK (id = 1),
        plex_item_id  TEXT,
        note          TEXT NOT NULL DEFAULT '',
        updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );

      CREATE TABLE image_cache (
        content_hash TEXT PRIMARY KEY,                -- sha256 of image bytes
        url          TEXT NOT NULL,                   -- hosted URL (Cloudinary)
        created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );
    `,
  },
  {
    version: 2,
    name: "recipient plex access",
    sql: `
      ALTER TABLE recipients ADD COLUMN plex_user_id TEXT;
      -- libraries | no_libraries | invited | no_access ; NULL = never checked
      ALTER TABLE recipients ADD COLUMN plex_status TEXT;
      ALTER TABLE recipients ADD COLUMN plex_libraries TEXT NOT NULL DEFAULT '[]';
      ALTER TABLE recipients ADD COLUMN plex_checked_at TEXT;
    `,
  },
  {
    version: 3,
    name: "recipient lists",
    sql: `
      CREATE TABLE recipient_lists (
        id          INTEGER PRIMARY KEY,
        name        TEXT NOT NULL UNIQUE COLLATE NOCASE,
        description TEXT NOT NULL DEFAULT '',
        created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );
      CREATE TABLE recipient_list_members (
        list_id      INTEGER NOT NULL REFERENCES recipient_lists(id) ON DELETE CASCADE,
        recipient_id INTEGER NOT NULL REFERENCES recipients(id) ON DELETE CASCADE,
        PRIMARY KEY (list_id, recipient_id)
      );
      CREATE INDEX recipient_list_members_recipient ON recipient_list_members(recipient_id);
      -- Which lists a newsletter sends to (in addition to individually picked recipients).
      CREATE TABLE newsletter_lists (
        newsletter_id INTEGER NOT NULL REFERENCES newsletters(id) ON DELETE CASCADE,
        list_id       INTEGER NOT NULL REFERENCES recipient_lists(id) ON DELETE CASCADE,
        PRIMARY KEY (newsletter_id, list_id)
      );
    `,
  },
  {
    version: 4,
    name: "ignore list replaces enabled switch",
    sql: `
      -- People Import from Plex must skip (like Sonarr's import list exclusions).
      CREATE TABLE import_exclusions (
        id           INTEGER PRIMARY KEY,
        plex_user_id TEXT UNIQUE,
        email        TEXT UNIQUE COLLATE NOCASE,
        name         TEXT NOT NULL DEFAULT '',
        created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );
      -- Lists now decide who gets what; the per-person on/off switch is gone.
      ALTER TABLE recipients DROP COLUMN enabled;
    `,
  },
  {
    version: 5,
    name: "per-newsletter look",
    sql: `
      ALTER TABLE newsletters ADD COLUMN email_theme TEXT NOT NULL DEFAULT 'dark';
      ALTER TABLE newsletters ADD COLUMN accent_color TEXT NOT NULL DEFAULT '#7c5cff';
      -- Carry over whatever Settings > Content had, so existing newsletters look the same.
      UPDATE newsletters SET
        email_theme = coalesce((SELECT json_extract(value, '$.emailTheme') FROM settings WHERE key = 'content'), 'dark'),
        accent_color = coalesce((SELECT json_extract(value, '$.accentColor') FROM settings WHERE key = 'content'), '#7c5cff');
    `,
  },
  {
    version: 6,
    name: "per-newsletter header and footer",
    sql: `
      ALTER TABLE newsletters ADD COLUMN header_title TEXT NOT NULL DEFAULT '';
      ALTER TABLE newsletters ADD COLUMN footer_text TEXT NOT NULL DEFAULT '';
      UPDATE newsletters SET
        header_title = coalesce((SELECT json_extract(value, '$.headerTitle') FROM settings WHERE key = 'content'), ''),
        footer_text = coalesce((SELECT json_extract(value, '$.footerText') FROM settings WHERE key = 'content'), '');
    `,
  },
];
