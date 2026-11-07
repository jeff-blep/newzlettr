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
];
