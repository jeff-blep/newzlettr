// src/lib/previewTokens.ts
import { API_BASE } from "../api";

const OWNER_REC_TOKENS = [
  "{{CARD_OWNER_RECOMMENDATION}}",
  "{{CARD_HOST_RECOMMENDATION}}",
  "{{HOST_RECOMMENDATION}}",
  "{{HOSTS_RECOMMENDATION}}",
];

const SERVER_TOTALS_TOKENS = [
  "{{CARD_SERVER_TOTALS}}",
  "{{SERVER_TOTALS}}",
  "{{LIBRARY_TOTALS}}",
];

function htmlEscape(s: any) {
  // Ternary chain to keep esbuild happy
  return String(s ?? "").replace(/[&<>"]/g, (c) =>
    c === "&" ? "&amp;" :
    c === "<" ? "&lt;"  :
    c === ">" ? "&gt;"  :
    "&quot;"
  );
}

function cardHtml(title: string, bodyHtml: string) {
  return `<div style="border:1px solid #e5e7eb;border-radius:12px;padding:16px;background:#fff;margin:16px 0;">
    <h3 style="margin:0 0 10px 0;font-size:16px;line-height:1.2">${htmlEscape(title)}</h3>
    ${bodyHtml}
  </div>`;
}

function replaceAnyToken(html: string, tokens: string[], replacementHtml: string) {
  let out = html;
  for (const t of tokens) if (out.includes(t)) out = out.replaceAll(t, replacementHtml);
  return out;
}

function posterFrom(row: any): string | null {
  const p =
    row?.thumbPath ||
    row?.thumb ||
    row?.grandparentThumb ||
    row?.parentThumb ||
    row?.art ||
    row?.poster ||
    null;
  if (!p) return null;
  if (typeof p === "string" && p.startsWith("/")) {
    return `${API_BASE}/api/plex/image?path=${encodeURIComponent(p)}`;
  }
  return `${API_BASE}/api/plex/image?u=${encodeURIComponent(p)}`;
}

function posterImg(src: string, alt = "", w = 96, h = 144) {
  return `<img src="${src}" alt="${htmlEscape(alt)}" style="width:${w}px;height:${h}px;object-fit:cover;border-radius:6px;margin-right:10px;border:1px solid #e5e7eb" />`;
}

/** Try to get a Plex server machineIdentifier from a few endpoints. */
async function getPlexServerId(): Promise<string | null> {
  const tries = [
    `${API_BASE}/api/plex/server-id`,
    `${API_BASE}/api/plex/server`,
    `${API_BASE}/api/plex/servers`,
  ];
  for (const url of tries) {
    try {
      const r = await fetch(url);
      if (!r.ok) continue;
      const j = await r.json();
      // normalize a few possible shapes
      const id =
        j?.machineIdentifier ||
        j?.serverId ||
        j?.id ||
        (Array.isArray(j) && (j[0]?.machineIdentifier || j[0]?.serverId || j[0]?.id)) ||
        null;
      if (id && typeof id === "string") return id;
    } catch {}
  }
  return null;
}

/** Build an app.plex.tv deep link given an item; fall back to search if needed. */
async function buildPlexAppHref(item: any): Promise<string> {
  const ratingKey = String(item?.rating_key ?? item?.ratingKey ?? "");
  const title = String(item?.title || item?.grandparentTitle || "Plex");
  const serverId = await getPlexServerId();

  if (serverId && ratingKey) {
    const key = encodeURIComponent(`/library/metadata/${ratingKey}`);
    return `https://app.plex.tv/desktop#!/server/${encodeURIComponent(serverId)}/details?key=${key}`;
  }

  // Fallbacks: direct href if provided, or search
  if (item?.webHref || item?.deepLink || item?.href) {
    return String(item.webHref || item.deepLink || item.href);
  }
  return `https://app.plex.tv/desktop/#!/search?query=${encodeURIComponent(title)}`;
}

async function buildOwnerRecommendationPreviewHtml(): Promise<string> {
  // Pull persisted config
  let cfg: any = {};
  try {
    const r = await fetch(`${API_BASE}/api/config`);
    if (r.ok) cfg = await r.json();
  } catch {}

  const id = cfg?.ownerRecommendation?.plexItemId;
  const note: string = typeof cfg?.ownerRecommendation?.note === "string" ? cfg.ownerRecommendation.note : "";

  // Note-only / no selection
  if (!id) {
    const body = note ? `<div>${htmlEscape(note)}</div>` : `<div style="opacity:.7">No item selected.</div>`;
    return cardHtml("Host’s Recommendation", body);
  }

  // Fetch Plex item for poster + title + app link
  try {
    const r = await fetch(`${API_BASE}/api/plex/item/${encodeURIComponent(String(id))}`);
    if (r.ok) {
      const j = await r.json();
      const item = j?.item || j || null;
      const title = item?.title || item?.grandparentTitle || "Title";
      const year = item?.year ? ` (${item.year})` : "";
      const href = await buildPlexAppHref(item);
      const pSrc = posterFrom(item);
      const img = pSrc ? posterImg(pSrc, title) : "";
      const info =
        `<div><a href="${href}" target="_blank" rel="noreferrer" style="text-decoration:none;color:#93c5fd"><strong>${htmlEscape(title)}${year}</strong></a>` +
        (note ? `<div style="margin-top:6px">${htmlEscape(note)}</div>` : "") +
        `</div>`;
      return cardHtml("Host’s Recommendation", `<div style="display:flex;align-items:flex-start">${img}${info}</div>`);
    }
  } catch {}

  const fallback = note ? `<div>${htmlEscape(note)}</div>` : `<div style="opacity:.7">Could not load item.</div>`;
  return cardHtml("Host’s Recommendation", fallback);
}

function li(label: string, value: string) {
  return `<li>${htmlEscape(label)} <span style="opacity:.7">— ${htmlEscape(value)}</span></li>`;
}

async function buildServerTotalsPreviewHtml(): Promise<string> {
  // Get lookbackDays to keep the UI consistent if you display any ranges elsewhere
  let cfg: any = {};
  try {
    const r = await fetch(`${API_BASE}/api/config`);
    if (r.ok) cfg = await r.json();
  } catch {}
  const days = Math.max(1, Number(cfg?.lookbackDays || 7));

  let summary: any = null;
  try {
    const r = await fetch(`${API_BASE}/api/tautulli/summary?days=${encodeURIComponent(days)}`);
    if (r.ok) summary = await r.json();
  } catch {}

  const t = summary?.totals || {};
  const movies = t?.movies;
  const episodes = t?.episodes;
  const totalPlays = t?.total_plays;
  const hours = Math.round(((Number(t?.total_time_seconds || 0) / 3600) + Number.EPSILON) * 10) / 10;

  const lines: string[] = [];
  if (movies != null) lines.push(li("Movies", String(movies)));
  // We don’t always have a reliable “TV Series” count in Tautulli home; omit unless you later expose it.
  if (episodes != null) lines.push(li("Episodes", String(episodes)));
  if (totalPlays != null) lines.push(li("Total Plays", String(totalPlays)));
  lines.push(li(`Total Hours Streamed (Last ${days} Days)`, String(hours)));

  const body = lines.length
    ? `<ul style="margin:0;padding-left:18px">${lines.join("")}</ul>`
    : `<div style="opacity:.7">Totals not available.</div>`;

  return cardHtml("Plex Media Server Totals", body);
}

/** Expand preview tokens the same way the server will at send-time. */
export async function expandPreviewTokens(html: string): Promise<string> {
  let out = String(html || "");

  // Host’s Recommendation
  if (OWNER_REC_TOKENS.some((t) => out.includes(t))) {
    const block = await buildOwnerRecommendationPreviewHtml();
    out = replaceAnyToken(out, OWNER_REC_TOKENS, block);
  }

  // Plex Media Server Totals
  if (SERVER_TOTALS_TOKENS.some((t) => out.includes(t))) {
    const block = await buildServerTotalsPreviewHtml();
    out = replaceAnyToken(out, SERVER_TOTALS_TOKENS, block);
  }

  return out;
}
