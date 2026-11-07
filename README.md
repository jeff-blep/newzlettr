# Newzlettr

**Self-hosted newsletters for your Plex server, built on Tautulli.**

Newzlettr emails your Plex users what's new on your server: recently added movies and episodes,
what everyone's been watching, a featured "Host's Pick", and anything else you want to say. It
looks and sets up like the *arr apps (Sonarr, Radarr, Bazarr): one container, one `/config`
folder, a sidebar UI, Settings pages with **Test** buttons, and System pages for status, tasks,
logs and backups.

> **v2** is a full rebuild. Coming from v1? See [Upgrading from v1](#upgrading-from-v1).

## Features

- **Templates with live cards** — write your intro in a rich-text editor and drop in cards:
  New movies, New episodes (grouped by show), Server totals, Most watched / Popular movies and
  shows, Platforms, Host's Pick. The preview is built by the same renderer that sends the email.
- **Schedules** — daily, weekly, monthly or any cron expression, in your time zone. Each
  scheduled slot can only ever send once.
- **Recipients** — add by hand or import your Plex users' emails from Tautulli.
- **Activity** — every send recorded: when, to how many, and any error.
- **Images** — attach posters to the email, or host them on Cloudinary (each image uploaded once).
- **Login** — forms login, optional "Disabled for Local Addresses", and an API key.
- **Health checks, tasks, logs, backups** — like the *arr apps.

## Install (Docker)

```bash
docker run -d --name newzlettr \
  -p 3001:3001 \
  -e TZ=America/New_York \
  -e PUID=1000 -e PGID=1000 \
  -v /path/to/newzlettr/config:/config \
  --restart unless-stopped \
  newzlettr:latest
```

or with Compose:

```yaml
services:
  newzlettr:
    image: newzlettr:latest
    container_name: newzlettr
    ports:
      - "3001:3001"
    environment:
      - TZ=America/New_York   # schedules use this zone (or set one in Settings > General)
      - PUID=1000             # files in /config are owned by this user/group
      - PGID=1000
    volumes:
      - ./config:/config
    restart: unless-stopped
```

Build the image yourself (any OS/CPU with Docker — x86 or ARM): `docker build -t newzlettr:latest .`

Then open `http://<host>:3001`, create your admin account, and go to **Settings → Connections**
(Plex + Tautulli) and **Settings → Email** (SMTP). Every page has a **Test** button.

Everything persistent lives in `/config`: the database (`newzlettr.db`), `logs/`, and `backups/`.
Nothing needs to be created beforehand.

### Gmail

Use `smtp.gmail.com`, port 587, STARTTLS, your address as username, and an
[App Password](https://myaccount.google.com/apppasswords) (not your normal password).

## Upgrading from v1

v2 uses a database instead of four JSON files. In **System → Backup → Import from Newzlettr v1**,
select your v1 `config.json`, `recipients.json`, `emailtemplates.json` and `newsletters.json`.
Settings, recipients, templates (old card tokens keep working), newsletters and the Host's Pick are
imported. **Newsletters are imported disabled** so nothing sends until you switch them on.

## Development

Requires Node 22.13+ (uses the built-in `node:sqlite`).

```bash
npm install
npm run dev        # API on :3001 (data in ./config), UI on http://localhost:5173
npm test           # vitest
npm run typecheck
npm run build && NEWZLETTR_CONFIG_DIR=./config npm start
```

Setting `NEWZLETTR_REDIRECT_ALL_MAIL_TO=you@example.com` sends **every** email to that one
address instead (with the intended audience size in the subject) — useful for testing against a
real recipient list. Never set it in production.

Layout: `server/` (Express 5 + TypeScript), `web/` (React + Mantine), `shared/types.ts`.

