import type { MediaRef, PlatformStat, StatsResponse } from "../../../shared/types.js";
import type { RecentMovie, RecentShow } from "../data/recent.js";
import { assetImg, button, card, emptyNote, esc, fmt, img, link, poster, runtime, truncate, type Theme } from "./html.js";

export interface CardCtx {
  t: Theme;
  days: number;
  itemsPerCard: number;
  episodesPerShow: number;
  showSummaries: boolean;
  /** Returns a Plex Web link for an item, or null when links are off / unknown server. */
  watchLink: (ratingKey: string | undefined) => string | null;
}

const windowLabel = (days: number) => (days === 7 ? "This week" : days === 1 ? "Today" : `Last ${days} days`);

/* -------------------------------- host pick -------------------------------- */

export interface HostPickData {
  item: MediaRef & { genres?: string[]; contentRating?: string; minutes?: number };
  note: string;
}

export function hostPickCard(c: CardCtx, d: HostPickData | null): string {
  const { t } = c;
  if (!d) return "";
  const m = d.item;
  const meta = [m.year, m.genres?.slice(0, 2).join(", "), m.contentRating, runtime(m.minutes)].filter(Boolean).join("  ·  ");
  const href = c.watchLink(m.ratingKey);
  const note = d.note
    ? `<div style="margin:14px 0 0 0;padding:10px 14px;border-left:3px solid ${t.accent};background:${t.cardAlt};border-radius:0 8px 8px 0;font:italic 400 15px/1.55 ${t.font};color:${t.text}">${esc(d.note).replace(/\n/g, "<br>")}</div>`
    : "";
  const body = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
    <td width="150" valign="top" style="padding-right:18px">${link(href, poster(m.thumb, 150, m.title, 10), t.text)}</td>
    <td valign="top">
      <div style="font:700 22px/1.25 ${t.font};color:${t.text}">${link(href, esc(m.title), t.text)}</div>
      ${m.subtitle ? `<div style="font:400 14px ${t.font};color:${t.muted};margin-top:2px">${esc(m.subtitle)}</div>` : ""}
      ${meta ? `<div style="font:400 13px ${t.font};color:${t.muted};margin-top:6px">${esc(meta)}</div>` : ""}
      ${c.showSummaries && m.summary ? `<div style="font:400 14px/1.55 ${t.font};color:${t.muted};margin-top:10px">${esc(truncate(m.summary, 260))}</div>` : ""}
      ${note}
      ${href ? button(t, href, "Watch on Plex") : ""}
    </td></tr></table>`;
  return card(t, "Host's pick", "From the host's shelf", body);
}

/* ------------------------------- server totals ------------------------------ */

function tile(t: Theme, value: string, label: string): string {
  return `<td width="33%" valign="top" style="padding:4px">
    <div style="background:${t.cardAlt};border-radius:10px;padding:14px 12px">
      <div style="font:700 24px/1.1 ${t.font};color:${t.text}">${esc(value)}</div>
      <div style="font:400 12px ${t.font};color:${t.muted};margin-top:4px">${esc(label)}</div>
    </div></td>`;
}

export function serverTotalsCard(c: CardCtx, s: StatsResponse): string {
  const { t } = c;
  if (!s.library && !s.window) return "";
  const row = (cells: string) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 -4px"><tr>${cells}</tr></table>`;
  const lib = s.library
    ? `<div style="font:600 12px ${t.font};color:${t.faint};margin:0 0 4px 0">IN THE LIBRARY</div>` +
      row(tile(t, fmt.format(s.library.movies), "movies") + tile(t, fmt.format(s.library.shows), "TV shows") + tile(t, fmt.format(s.library.episodes), "episodes"))
    : "";
  const win = s.window
    ? `<div style="font:600 12px ${t.font};color:${t.faint};margin:14px 0 4px 0">${esc(windowLabel(c.days).toUpperCase())}</div>` +
      row(
        tile(t, fmt.format(s.window.moviePlays), "movies streamed") +
          tile(t, fmt.format(s.window.episodePlays), "episodes streamed") +
          tile(t, fmt.format(Math.round(s.window.seconds / 3600)), "hours watched"),
      )
    : "";
  return card(t, "By the numbers", "The server at a glance", lib + win);
}

/* ------------------------------- ranked lists ------------------------------- */

function rankedRows(c: CardCtx, items: MediaRef[], value: (m: MediaRef) => string): string {
  const { t } = c;
  return items
    .slice(0, c.itemsPerCard)
    .map((m, i) => {
      const href = c.watchLink(m.ratingKey);
      return `<tr>
        <td width="26" valign="middle" style="font:700 15px ${t.font};color:${t.accent};padding:6px 0">${i + 1}</td>
        <td width="54" valign="middle" style="padding:6px 12px 6px 0">${link(href, poster(m.thumb, 42, m.title, 4), t.text)}</td>
        <td valign="middle" style="padding:6px 0">
          <div style="font:600 15px/1.3 ${t.font};color:${t.text}">${link(href, esc(m.title), t.text)}</div>
          ${m.year ? `<div style="font:400 12px ${t.font};color:${t.muted}">${m.year}</div>` : ""}
        </td>
        <td valign="middle" align="right" style="font:600 13px ${t.font};color:${t.muted};padding:6px 0 6px 8px;white-space:nowrap">${value(m)}</td>
      </tr>`;
    })
    .join("");
}

export function rankedCard(c: CardCtx, eyebrow: string, title: string, items: MediaRef[], metric: "plays" | "users"): string {
  const { t } = c;
  if (!items.length) return card(t, eyebrow, title, emptyNote(t, "Nothing watched in this window."));
  const unit = metric === "plays" ? ["play", "plays"] : ["viewer", "viewers"];
  const body = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rankedRows(c, items, (m) => {
    const v = m[metric] ?? 0;
    return `${fmt.format(v)} ${v === 1 ? unit[0] : unit[1]}`;
  })}</table>`;
  return card(t, eyebrow, title, body);
}

export function platformsCard(c: CardCtx, items: PlatformStat[]): string {
  const { t } = c;
  if (!items.length) return card(t, windowLabel(c.days), "Where people watched", emptyNote(t, "No plays in this window."));
  const list = items.slice(0, c.itemsPerCard);
  const max = Math.max(1, ...list.map((p) => p.plays));
  const rows = list
    .map((p) => {
      const pct = Math.max(2, Math.round((p.plays / max) * 100));
      return `<tr>
        <td width="44" valign="middle" style="padding:7px 12px 7px 0">${img(assetImg(`platforms/${p.icon}`), 32, 32, p.name, 8)}</td>
        <td valign="middle" style="padding:7px 0">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
            <td style="font:600 14px ${t.font};color:${t.text}">${esc(p.name)}</td>
            <td align="right" style="font:600 13px ${t.font};color:${t.muted};white-space:nowrap">${fmt.format(p.plays)} plays</td>
          </tr></table>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:6px"><tr>
            <td width="${pct}%" style="height:6px;line-height:6px;font-size:0;background:${t.accent};border-radius:3px">&nbsp;</td>
            <td style="height:6px;line-height:6px;font-size:0;background:${t.cardAlt};border-radius:3px">&nbsp;</td>
          </tr></table>
        </td></tr>`;
    })
    .join("");
  return card(t, windowLabel(c.days), "Where people watched", `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table>`);
}

/* ------------------------------ recently added ------------------------------ */

export function recentMoviesCard(c: CardCtx, movies: RecentMovie[]): string {
  const { t } = c;
  const title = `${movies.length} new movie${movies.length === 1 ? "" : "s"}`;
  if (!movies.length) return card(t, "Recently added", "New movies", emptyNote(t, "No new movies in this window."));
  const cols = 3;
  const rows: string[] = [];
  for (let i = 0; i < movies.length; i += cols) {
    const cells = movies.slice(i, i + cols).map((m) => {
      const href = c.watchLink(m.ratingKey);
      const meta = [m.year, m.genres[0]].filter(Boolean).join(" · ");
      return `<td width="33%" valign="top" style="padding:0 6px 18px 6px">
        ${link(href, poster(m.thumb, 160, m.title, 8), t.text)}
        <div style="font:600 14px/1.3 ${t.font};color:${t.text};margin-top:8px">${link(href, esc(m.title), t.text)}</div>
        ${meta ? `<div style="font:400 12px ${t.font};color:${t.muted};margin-top:2px">${esc(meta)}</div>` : ""}
        ${c.showSummaries && m.summary ? `<div style="font:400 12px/1.45 ${t.font};color:${t.faint};margin-top:6px">${esc(truncate(m.summary, 110))}</div>` : ""}
      </td>`;
    });
    while (cells.length < cols) cells.push(`<td width="33%" style="padding:0 6px"></td>`);
    rows.push(`<tr>${cells.join("")}</tr>`);
  }
  return card(t, "Recently added", title, `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 -6px">${rows.join("")}</table>`);
}

export function recentShowsCard(c: CardCtx, shows: RecentShow[]): string {
  const { t } = c;
  if (!shows.length) return card(t, "Recently added", "New episodes", emptyNote(t, "No new episodes in this window."));
  const totalEps = shows.reduce((a, s) => a + s.episodes.length, 0);
  const rows = shows
    .map((s, i) => {
      const href = c.watchLink(s.ratingKey);
      const shown = s.episodes.slice(0, c.episodesPerShow);
      const more = s.episodes.length - shown.length;
      const count = s.episodes.length
        ? `${s.episodes.length} new episode${s.episodes.length === 1 ? "" : "s"}`
        : (s.note ?? "Updated");
      const lines = shown
        .map((e) => `<div style="font:400 13px/1.5 ${t.font};color:${t.muted}">${esc(e.label)}</div>`)
        .join("");
      return `<tr><td valign="top" width="64" style="padding:${i ? 14 : 0}px 14px 0 0">${link(href, poster(s.thumb, 60, s.title, 6), t.text)}</td>
        <td valign="top" style="padding:${i ? 14 : 0}px 0 0 0;${i ? `border-top:1px solid ${t.cardAlt};` : ""}">
          <div style="font:600 15px/1.3 ${t.font};color:${t.text};${i ? "padding-top:0;" : ""}">${link(href, esc(s.title), t.text)}</div>
          <div style="font:600 12px ${t.font};color:${t.accent};margin:2px 0 4px 0">${esc(count)}</div>
          ${lines}
          ${more > 0 ? `<div style="font:400 12px ${t.font};color:${t.faint}">+ ${more} more</div>` : ""}
        </td></tr>`;
    })
    .join("");
  return card(
    t,
    "Recently added",
    `${totalEps ? `${totalEps} new episode${totalEps === 1 ? "" : "s"}` : "New TV"} across ${shows.length} show${shows.length === 1 ? "" : "s"}`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table>`,
  );
}
