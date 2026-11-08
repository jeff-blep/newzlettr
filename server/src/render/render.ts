import type { DB } from "../db/index.js";
import { recentMovies, recentShows } from "../data/recent.js";
import { getStats } from "../data/stats.js";
import { plexWebLink } from "../integrations/plex.js";
import { logger } from "../logging.js";
import { plexClient, plexMachineId } from "../services.js";
import { DEFAULT_LOOK, effectiveTimezone, getSection, type Look } from "../settings.js";
import {
  type CardCtx,
  hostPickCard,
  type HostPickData,
  platformsCard,
  rankedCard,
  recentMoviesCard,
  recentShowsCard,
  serverTotalsCard,
} from "./cards.js";
import { darkModeCss, esc, themeFor } from "./html.js";
import { sanitizeTemplate } from "./sanitize.js";
import { type CardId, cardForToken, TOKEN_RE, tokensIn } from "./tokens.js";

const log = logger("render");

export interface RenderOptions {
  templateHtml: string;
  days: number;
  /** Used for the <title> and preheader. */
  subject?: string;
  now?: Date;
  /** In-app preview only: show a "match device" email in its dark variant. */
  previewScheme?: "light" | "dark";
  /** The newsletter's look (appearance, accent, header, footer). Defaults to dark/violet. */
  look?: Partial<Look>;
}

export interface RenderedEmail {
  /** HTML with nzimg:// placeholders still in it (resolve with resolveImages). */
  html: string;
  warnings: string[];
  cardsUsed: CardId[];
}

/**
 * Builds the newsletter. One function serves preview, test send and real send, so what you
 * preview is exactly what goes out (v1 had two diverging renderers).
 */
export async function renderNewsletter(db: DB, opts: RenderOptions): Promise<RenderedEmail> {
  const content = getSection(db, "content");
  const look: Look = { ...DEFAULT_LOOK, ...opts.look };
  // "auto" renders the light design plus dark-mode CSS for mail apps that support it.
  const t = themeFor(look.accentColor, look.emailTheme === "dark" ? "dark" : "light");
  const warnings: string[] = [];
  // Collapse runs of empty paragraphs (pasted text is full of them) into a single gap.
  const clean = normalizeCardMarkers(sanitizeTemplate(opts.templateHtml)).replace(/(?:<(p|div)>\s*(?:<br\s*\/?>\s*)*<\/\1>\s*){2,}/g, "<p><br></p>");
  const used = tokensIn(clean);
  const days = opts.days;

  const machineId = content.includeWatchLinks ? await plexMachineId(db) : null;
  const ctx: CardCtx = {
    t,
    days,
    itemsPerCard: content.itemsPerCard,
    episodesPerShow: content.episodesPerShow,
    showSummaries: content.showSummaries,
    watchLink: (rk) => (machineId && rk ? plexWebLink(machineId, rk) : null),
  };

  // Fetch only what the template uses, in parallel. A failing source becomes a warning.
  const needStats = used.some((c) => ["SERVER_TOTALS", "MOST_WATCHED_MOVIES", "MOST_WATCHED_SHOWS", "POPULAR_MOVIES", "POPULAR_SHOWS", "POPULAR_PLATFORMS"].includes(c));
  const [stats, movies, shows, pick, serverName] = await Promise.all([
    needStats ? getStats(db, days, { topN: Math.max(10, content.itemsPerCard) }) : null,
    used.includes("RECENT_MOVIES")
      ? recentMovies(db, days, content.recentMoviesMax).catch((e) => (warnings.push(`New movies: ${(e as Error).message}`), []))
      : [],
    used.includes("RECENT_EPISODES")
      ? recentShows(db, days, { maxShows: content.recentShowsMax, episodesPerShow: content.episodesPerShow, excluded: content.excludedShows }).catch(
          (e) => (warnings.push(`New episodes: ${(e as Error).message}`), []),
        )
      : [],
    used.includes("HOST_PICK") ? loadHostPick(db, warnings) : null,
    look.headerTitle ? null : plexClient(db).serverInfo().then((i) => i.friendlyName).catch(() => null),
  ]);
  if (stats) warnings.push(...stats.errors);

  const renderCard = (id: CardId): string => {
    switch (id) {
      case "HOST_PICK":
        return hostPickCard(ctx, pick);
      case "SERVER_TOTALS":
        return stats ? serverTotalsCard(ctx, stats) : "";
      case "MOST_WATCHED_MOVIES":
        return rankedCard(ctx, "Most watched", "Movies everyone played", stats?.mostWatchedMovies ?? [], "plays");
      case "MOST_WATCHED_SHOWS":
        return rankedCard(ctx, "Most watched", "Shows on repeat", stats?.mostWatchedShows ?? [], "plays");
      case "POPULAR_MOVIES":
        return rankedCard(ctx, "Popular", "Movies with the most viewers", stats?.popularMovies ?? [], "users");
      case "POPULAR_SHOWS":
        return rankedCard(ctx, "Popular", "Shows with the most viewers", stats?.popularShows ?? [], "users");
      case "POPULAR_PLATFORMS":
        return platformsCard(ctx, stats?.platforms ?? []);
      case "RECENT_MOVIES":
        return recentMoviesCard(ctx, movies);
      case "RECENT_EPISODES":
        return recentShowsCard(ctx, shows);
    }
  };

  const cardHtml = new Map(used.map((id) => [id, renderCard(id)]));
  const sub = (token: string) => {
    const id = cardForToken(token);
    return id ? (cardHtml.get(id) ?? "") : `{{${token}}}`;
  };

  // A block that holds only a token becomes the card itself (a table inside <p> is invalid).
  let body = clean.replace(
    /<(p|div)(\s[^>]*)?>\s*(?:<span[^>]*>\s*)?\{\{\s*([A-Z_]+)\s*\}\}(?:\s*<\/span>)?\s*(?:<br\s*\/?>\s*)*<\/\1>/g,
    (_m, _tag, _attrs, token: string) => `</div>${sub(token)}<div class="nz-text">`,
  );
  body = body.replace(/<span[^>]*data-card[^>]*>\s*\{\{\s*([A-Z_]+)\s*\}\}\s*<\/span>/g, (_m, token: string) => `</div>${sub(token)}<div class="nz-text">`);
  body = body.replace(TOKEN_RE, (_m, token: string) => `</div>${sub(token)}<div class="nz-text">`);
  body = `<div class="nz-text">${body}</div>`.replace(/<div class="nz-text">\s*(?:<br\s*\/?>\s*)*<\/div>/g, "");
  body = body.replace(/<div class="nz-text">/g, `<div style="font:400 16px/1.6 ${t.font};color:${t.text};margin:0 0 20px 0">`);

  const title = look.headerTitle || `${serverName ?? "Plex"} Newsletter`;
  const now = opts.now ?? new Date();
  const range = dateRange(now, days, effectiveTimezone(db));

  const html = layout({
    t,
    title,
    range,
    subject: opts.subject ?? title,
    body,
    footer: look.footerText,
    mode: look.emailTheme,
    previewScheme: look.emailTheme === "auto" ? opts.previewScheme : undefined,
  });
  if (warnings.length) log.warn({ warnings }, "rendered with warnings");
  return { html, warnings, cardsUsed: used };
}

/**
 * Card markers come in two shapes: `<div data-card="X">{{X}}</div>` (what the editor saves) and
 * an empty `<div data-card="X"></div>` (the editor's starter content, hand-written HTML). Both
 * become a plain `{{X}}` block so the token pass below finds them.
 */
export function normalizeCardMarkers(html: string): string {
  return html.replace(/<(div|span)\b[^>]*\bdata-card="([A-Za-z_]+)"[^>]*>[\s\S]*?<\/\1>/g, (_m, _tag, token: string) => `<p>{{${token.toUpperCase()}}}</p>`);
}

async function loadHostPick(db: DB, warnings: string[]): Promise<HostPickData | null> {
  const row = db.prepare("SELECT plex_item_id, note FROM host_pick WHERE id = 1").get() as { plex_item_id: string | null; note: string } | undefined;
  if (!row?.plex_item_id) {
    warnings.push("Host's Pick card is in the template but no title is picked.");
    return null;
  }
  try {
    const m = await plexClient(db).metadata(row.plex_item_id);
    if (!m) {
      warnings.push("Host's Pick title is no longer in Plex.");
      return null;
    }
    const ep = m.type === "episode";
    return {
      note: row.note,
      item: {
        ratingKey: m.ratingKey,
        title: ep ? (m.grandparentTitle ?? m.title) : m.title,
        subtitle: ep ? `S${m.parentIndex}E${m.index} · ${m.title}` : undefined,
        year: m.year,
        thumb: ep ? (m.grandparentThumb ?? m.thumb) : m.thumb,
        summary: m.summary,
        genres: (m.Genre ?? []).map((g) => g.tag),
        contentRating: m.contentRating,
        minutes: m.duration ? Math.round(m.duration / 60000) : undefined,
      },
    };
  } catch (e) {
    warnings.push(`Host's Pick: ${(e as Error).message}`);
    return null;
  }
}

export function dateRange(now: Date, days: number, timeZone: string): string {
  const start = new Date(now.getTime() - (days - 1) * 86400_000);
  const f = (d: Date, withYear: boolean) =>
    new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", ...(withYear ? { year: "numeric" } : {}), timeZone }).format(d);
  return days <= 1 ? f(now, true) : `${f(start, false)} – ${f(now, true)}`;
}

function layout(p: {
  t: ReturnType<typeof themeFor>;
  title: string;
  range: string;
  subject: string;
  body: string;
  footer: string;
  mode: "dark" | "light" | "auto";
  /**
   * In-app preview of an "auto" email: the app UI is dark, so the preview frame would always
   * match prefers-color-scheme:dark. "light" omits the dark rules; "dark" applies them unconditionally.
   */
  previewScheme?: "light" | "dark";
}): string {
  const { t } = p;
  const footer = p.footer ? `<div style="margin-bottom:8px">${esc(p.footer).replace(/\n/g, "<br>")}</div>` : "";
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
${
  p.mode === "dark"
    ? `<meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark">`
    : p.mode === "light"
      ? `<meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light">`
      : `<meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark">`
}
<title>${esc(p.subject)}</title>
<style>
  body{margin:0;padding:0;background:${t.page}}
  a{color:${t.accent}}
  .nz-body a{color:${t.accent};text-decoration:underline}
  @media (max-width:620px){ .nz-wrap{width:100%!important} .nz-pad{padding:16px!important} }
  ${p.mode === "auto" && p.previewScheme !== "light" ? darkModeCss(p.previewScheme === "dark") : ""}
</style>
</head>
<body style="margin:0;padding:0;background:${t.page}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(p.title)} · ${esc(p.range)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${t.page}">
<tr><td align="center" style="padding:24px 12px">
  <table role="presentation" class="nz-wrap" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px">
    <tr><td style="padding:0 0 18px 0">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${t.container};border-radius:16px;border-top:4px solid ${t.accent}">
        <tr><td class="nz-pad" style="padding:26px 26px 22px 26px">
          <div style="font:800 26px/1.2 ${t.font};color:${t.text};letter-spacing:-0.01em">${esc(p.title)}</div>
          <div style="font:500 14px ${t.font};color:${t.muted};margin-top:6px">${esc(p.range)}</div>
        </td></tr>
      </table>
    </td></tr>
    <tr><td class="nz-body" style="padding:0">${p.body}</td></tr>
    <tr><td style="padding:8px 8px 0 8px;font:400 12px/1.5 ${t.font};color:${t.faint};text-align:center">
      ${footer}
      You're receiving this because you're part of ${esc(p.title.replace(/ Newsletter$/, ""))}. Reply to this email to get in touch.
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;
}
