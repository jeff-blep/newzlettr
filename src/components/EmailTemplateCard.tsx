// src/components/EmailTemplateCard.tsx
import React, { useEffect, useRef, useState } from "react";
import { API_BASE } from "../api";

type Props = {
  config: any;
  save: (partial: any) => Promise<void> | void;
};

const DEFAULT_TEMPLATE = ``;

const TEMPLATE_TOKENS: { key: string; label: string }[] = [
  { key: "{{CARD_SERVER_TOTALS}}", label: "Plex Media Server Data" },
  { key: "{{CARD_MOST_WATCHED_MOVIES}}", label: "Most Watched Movies" },
  { key: "{{CARD_MOST_WATCHED_SHOWS}}", label: "Most Watched TV Shows" },
  { key: "{{CARD_MOST_WATCHED_EPISODES}}", label: "Most Watched Episodes" },
  { key: "{{CARD_POPULAR_MOVIES}}", label: "Most Popular Movies" },
  { key: "{{CARD_POPULAR_SHOWS}}", label: "Most Popular TV Shows" },
  { key: "{{CARD_POPULAR_PLATFORMS}}", label: "Most Popular Streaming Platform" },
  { key: "{{CARD_RECENT_MOVIES}}", label: "Recently added Movies" },
  { key: "{{CARD_RECENT_EPISODES}}", label: "Recently added TV Episodes" },
  { key: "{{CARD_OWNER_RECOMMENDATION}}", label: "Host’s Recommendation" },
];

// All accepted tokens for “Host’s Recommendation”
const OWNER_REC_TOKENS = [
  "{{CARD_OWNER_RECOMMENDATION}}",
  "{{CARD_HOST_RECOMMENDATION}}",
  "{{HOST_RECOMMENDATION}}",
  "{{HOSTS_RECOMMENDATION}}",
];

/* -------------------------------- helpers -------------------------------- */
function htmlEscape(s: any) {
  // Ternary chain (avoids rare esbuild parse oddities with object-index lookups)
  return String(s ?? "").replace(/[&<>"]/g, (c) =>
    c === "&" ? "&amp;" :
    c === "<" ? "&lt;"  :
    c === ">" ? "&gt;"  :
    "&quot;"
  );
}
function li(label: string, value: string) {
  return `<li>${htmlEscape(label)} <span style="opacity:.7">— ${htmlEscape(value)}</span></li>`;
}
function cardHtml(title: string, bodyHtml: string) {
  return `<div style="border:1px solid var(--base-300,#e5e7eb);border-radius:12px;padding:16px;background:#fff;margin:16px 0;">
    <h3 style="margin:0 0 10px 0;font-size:16px;line-height:1.2">${htmlEscape(title)}</h3>
    ${bodyHtml}
  </div>`;
}
function posterFrom(row: any): string | null {
  const p = row?.thumbPath || row?.thumb || row?.grandparentThumb || row?.parentThumb || row?.art || row?.poster || null;
  if (!p) return null;
  if (typeof p === "string" && p.startsWith("/")) {
    return `${API_BASE}/api/plex/image?path=${encodeURIComponent(p)}`;
  }
  return `${API_BASE}/api/plex/image?u=${encodeURIComponent(p)}`;
}
function posterImg(src: string, alt = "", w = 36, h = 54) {
  return `<img src="${src}" alt="${htmlEscape(alt)}" style="width:${w}px;height:${h}px;object-fit:cover;border-radius:6px;margin-right:10px;border:1px solid #e5e7eb" />`;
}

function stackedList(items) {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      ${items.map((x) => `
        <tr>
          <td valign="top" width="96" style="padding:0 16px 16px 0;">
            ${x.poster ? posterImg(x.poster, x.title || "", 96, 144) : ""}
          </td>
          <td valign="top" style="padding:0 0 16px 0;">
            <div style="font-weight:600;line-height:1.25;margin:0 0 4px 0;">
              ${htmlEscape(x.title || "")}${x.year ? ` (${x.year})` : ""}
            </div>
            ${x.summary ? `<div style="font-size:13px;line-height:1.4;opacity:.9;margin:0;">${htmlEscape(x.summary)}</div>` : ""}
          </td>
        </tr>`).join("")}
    </table>`;
}
function rowType(row: any): string {
  return String(row?.media_type || row?.type || row?.section_type || "").toLowerCase();
}
function formatHrsMins(totalSeconds: number) {
  const totalMinutes = Math.round(Number(totalSeconds || 0) / 60);
  const hrs = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  return `${hrs} hrs ${mins} minutes`;
}

/* ---------- Platform icon + name mapping (PNG files in /public/platforms) -- */
/* Expected files under /public/platforms:
   atv.png, roku.png, android.png, ios.png, samsung.png, chrome.png, safari.png,
   lg.png, playstation.png, chromecast.png, macos.png, xbox.png, generic.png
*/
const PLATFORM_FILE_MAP: Record<string, string> = {
  appletv: "atv.png",
  roku: "roku.png",
  androidtv: "android.png",
  android: "android.png",
  ios: "ios.png",
  samsung: "samsung.png",
  chrome: "chrome.png",
  safari: "safari.png",
  lg: "lg.png",
  playstation: "playstation.png",
  chromecast: "chromecast.png",
  macos: "macos.png",
  xbox: "xbox.png",
};
const PLATFORM_LABEL_MAP: Record<string, string> = {
  appletv: "Apple TV",
  samsung: "Samsung TV",
  lg: "LG TV",
  androidtv: "Android TV",
  android: "Android",
  ios: "iOS",
  chrome: "Chrome",
  safari: "Safari",
  roku: "Roku",
  chromecast: "Chromecast",
  playstation: "PlayStation",
  xbox: "Xbox",
  macos: "macOS",
};
function normalizePlatform(name: string): string {
  const raw = String(name || "").toLowerCase().trim();
  if (raw.includes("apple tv") || raw.includes("tvos") || raw.includes("appletv")) return "appletv";
  if (raw.includes("samsung tv") || raw.includes("tizen") || raw === "samsung") return "samsung";
  if (raw.includes("webos") || raw.includes("lg")) return "lg";
  if (raw.includes("plex web") || raw.includes("chrome")) return "chrome";
  if (raw.includes("safari")) return "safari";
  if (raw.includes("android tv")) return "androidtv";
  if (raw.includes("plex app (android)") || raw === "android" || raw.includes("android")) return "android";
  if (raw.includes("plex app (ios)") || raw.includes("iphone") || raw.includes("ipad") || raw.includes("ios")) return "ios";
  if (raw.includes("chromecast")) return "chromecast";
  if (raw.includes("roku")) return "roku";
  if (raw.includes("xbox")) return "xbox";
  if (raw.includes("playstation") || raw.includes("ps4") || raw.includes("ps5")) return "playstation";
  if (raw.includes("macos") || raw.includes("plex app (macos)")) return "macos";
  // last resort: compact + sanitize
  return raw.replace(/[\s_]+/g, "").replace(/[^a-z0-9-]/g, "");
}
function platformIconTag(normalizedKey: string, labelForAlt: string) {
  const file = PLATFORM_FILE_MAP[normalizedKey] || "generic.png";
  return `<img src="/platforms/${file}" alt="${htmlEscape(labelForAlt)}" style="width:20px;height:20px;object-fit:contain;margin-right:8px;vertical-align:middle" />`;
}

/* ---------------- Plex Web link builder (non-blocking & resilient) -------- */
let CACHED_PLEX_MACHINE_ID: string | null | undefined = undefined;

async function getPlexMachineId(): Promise<string | null> {
  if (CACHED_PLEX_MACHINE_ID !== undefined) return CACHED_PLEX_MACHINE_ID;
  try {
    const r = await fetch(`${API_BASE}/api/plex/server-id`);
    if (!r.ok) throw new Error("server-id not ok");
    const j = await r.json();
    CACHED_PLEX_MACHINE_ID = j?.machineIdentifier || null;
  } catch {
    CACHED_PLEX_MACHINE_ID = null;
  }
  return CACHED_PLEX_MACHINE_ID;
}

function extractRatingKey(item: any): string | null {
  const rk = item?.ratingKey ?? item?.rating_key ?? item?.id ?? item?.key ?? null;
  if (typeof rk === "string" && rk.trim() && !rk.startsWith("/")) return rk;
  if (typeof rk === "number") return String(rk);
  if (typeof item?.key === "string") {
    const m = item.key.match(/\/library\/metadata\/([^/?#]+)/i);
    if (m) return m[1];
  }
  return null;
}

async function plexWebHrefForItem(item: any): Promise<string | undefined> {
  try {
    const machineId = await getPlexMachineId();
    const ratingKey = extractRatingKey(item);
    if (machineId && ratingKey) {
      const key = `/library/metadata/${encodeURIComponent(ratingKey)}`;
      return `https://app.plex.tv/desktop/#!/server/${machineId}/details?key=${encodeURIComponent(key)}`;
    }
  } catch {
    /* ignore and fall through */
  }
  return item?.webHref || item?.deepLink || item?.href || "#";
}

/* -------------------- Host Rec helpers (id normalize + fetch) ------------- */
function normalizePlexId(idLike: unknown): string | null {
  if (idLike == null) return null;
  if (typeof idLike === "number") return String(idLike);
  let s = String(idLike).trim();
  if (!s) return null;
  // Accept /library/metadata/12345 or full URLs containing that path
  const m = s.match(/\/library\/metadata\/([^/?#]+)/i);
  if (m) return decodeURIComponent(m[1]);
  // Accept plain ratingKey
  return s.replace(/^#+/, "");
}

async function fetchOwnerRecFromServer(): Promise<{ plexItemId?: string; note?: string } | null> {
  // Try /api/config (your Settings source), then a dedicated endpoint if present
  try {
    const r = await fetch(`${API_BASE}/api/config`);
    if (r.ok) {
      const j = await r.json();
      const rec = j?.ownerRecommendation || j?.owner_rec || null;
      if (rec) {
        const plexItemId = normalizePlexId(rec.plexItemId ?? rec.id ?? rec.ratingKey ?? rec.key);
        return { plexItemId: plexItemId || undefined, note: rec.note || "" };
      }
    }
  } catch {/* ignore */}
  try {
    const r2 = await fetch(`${API_BASE}/api/owner-recommendation`);
    if (r2.ok) {
      const j2 = await r2.json();
      const plexItemId = normalizePlexId(j2?.plexItemId ?? j2?.id ?? j2?.ratingKey ?? j2?.key);
      return { plexItemId: plexItemId || undefined, note: j2?.note || "" };
    }
  } catch {/* ignore */}
  return null;
}

/* ------------------------------- component ------------------------------- */
type SavedTemplate = { id: string; name: string; html: string; updatedAt?: number; historyDays?: number };

export default function EmailTemplateCard({ config, save }: Props) {
  const [templateHtml, setTemplateHtml] = useState<string>(config?.template?.html || DEFAULT_TEMPLATE);
  const [templateSaving, setTemplateSaving] = useState(false);
  const editorRef = useRef<HTMLDivElement | null>(null);

  // Track current template meta for inline header display
  const [currentTemplate, setCurrentTemplate] = useState<{ name?: string } | null>(null);

  // caret/selection memory for snippet insertion
  const savedRangeRef = useRef<Range | null>(null);
  function saveSelection() {
    const el = editorRef.current;
    const sel = window.getSelection();
    if (!el || !sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (!el.contains(range.startContainer) || !el.contains(range.endContainer)) return;
    savedRangeRef.current = range.cloneRange();
  }
  const handleEditorInput = (e: React.FormEvent<HTMLDivElement>) => {
    setTemplateHtml((e.target as HTMLDivElement).innerHTML);
    saveSelection();
  };

  // live Owner Recommendation (synced from events + prop changes)
  const [ownerRec, setOwnerRec] = useState<{ plexItemId?: string | number; note?: string }>(() => ({
    plexItemId: config?.ownerRecommendation?.plexItemId,
    note: config?.ownerRecommendation?.note || "",
  }));
  useEffect(() => {
    setOwnerRec({
      plexItemId: config?.ownerRecommendation?.plexItemId,
      note: config?.ownerRecommendation?.note || "",
    });
  }, [config?.ownerRecommendation?.plexItemId, config?.ownerRecommendation?.note]);

  const [homeSummary, setHomeSummary] = useState<any>(null);
  const [homeLoading, setHomeLoading] = useState<boolean>(false);
  const historyDaysForPreview = Number(config?.lookbackDays || 7);

  async function loadHomeSummary() {
    try {
      setHomeLoading(true);
      const r = await fetch(`${API_BASE}/api/tautulli/summary?days=${encodeURIComponent(historyDaysForPreview)}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      setHomeSummary(j);
    } catch {
      setHomeSummary(null);
    } finally {
      setHomeLoading(false);
    }
  }

  useEffect(() => {
    loadHomeSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyDaysForPreview]);

  useEffect(() => {
    function onUpdate(e: Event) {
      const ce = e as CustomEvent<any>;
      const { plexItemId, note } = ce.detail || {};
      setOwnerRec({ plexItemId, note: typeof note === "string" ? note : "" });
    }
    window.addEventListener("ownerRecommendation:update", onUpdate as EventListener);
    return () => window.removeEventListener("ownerRecommendation:update", onUpdate as EventListener);
  }, []);

  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== templateHtml) {
      editorRef.current.innerHTML = templateHtml;
    }
  }, [templateHtml]);

  function exec(cmd: string, value?: string) {
    document.execCommand(cmd, false, value);
    const el = editorRef.current;
    if (el) setTemplateHtml(el.innerHTML);
  }

  function pickRows(ids: string[]) {
    const blocks = Array.isArray(homeSummary?.home) ? homeSummary.home : [];
    for (const b of blocks) {
      const id = String(b?.stat_id || "");
      if (ids.includes(id)) {
        const rows = Array.isArray(b?.rows) ? b.rows : [];
        return rows;
      }
    }
    return [];
  }

  async function insertTokenAtCaret(token: string) {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    const sel = window.getSelection();
    const saved = savedRangeRef.current;
    if (saved) {
      sel?.removeAllRanges();
      sel?.addRange(saved);
    }
    const before = el.innerHTML;
    const ok = document.execCommand("insertText", false, token);
    if (!ok || el.innerHTML === before) {
      const currentRange = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : savedRangeRef.current;
      if (currentRange) {
        currentRange.deleteContents();
        const textNode = document.createTextNode(token);
        currentRange.insertNode(textNode);
        currentRange.setStartAfter(textNode);
        currentRange.setEndAfter(textNode);
        sel?.removeAllRanges();
        sel?.addRange(currentRange);
      } else {
        el.innerHTML += token;
      }
    }
    setTemplateHtml(el.innerHTML);
    saveSelection();
  }

  /* ---------------- Templates: load/save modals + API ---------------- */
  const [templatesModalOpen, setTemplatesModalOpen] = useState(false);
  const [nameModalOpen, setNameModalOpen] = useState(false);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templates, setTemplates] = useState<SavedTemplate[]>([]);
  const [tplError, setTplError] = useState<string | null>(null);
  const [newTemplateName, setNewTemplateName] = useState("");
  // Removed historyDaysForTemplate state

  async function fetchTemplates() {
    try {
      setTemplatesLoading(true);
      setTplError(null);
      const r = await fetch(`${API_BASE}/api/templates`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const list: SavedTemplate[] = await r.json();
      const arr = Array.isArray(list) ? list : [];
      arr.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      setTemplates(arr);
    } catch (e: any) {
      setTplError(e?.message || String(e));
      setTemplates([]);
    } finally {
      setTemplatesLoading(false);
    }
  }

  function openTemplatesPicker() {
    setTemplatesModalOpen(true);
    fetchTemplates();
  }

  function openNameModal() {
    setNewTemplateName("");
    setNameModalOpen(true);
  }

  async function saveTemplateToLibrary() {
    const name = newTemplateName.trim();
    if (!name) return;
    try {
      setTemplateSaving(true);
      const r = await fetch(`${API_BASE}/api/templates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, html: templateHtml }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setCurrentTemplate({ name });
      setNameModalOpen(false);
      fetchTemplates();
    } catch (e) {
      console.error("[EmailTemplateCard] Failed saving template:", e);
      alert("Failed to save template.");
    } finally {
      setTemplateSaving(false);
    }
  }

  function loadTemplate(t: SavedTemplate) {
    setTemplateHtml(String(t?.html || ""));
    setCurrentTemplate({ name: t?.name });
    setTemplatesModalOpen(false);
  }

  async function deleteTemplate(t: SavedTemplate) {
    const ok = confirm(`Delete template “${t.name}”? This cannot be undone.`);
    if (!ok) return;
    try {
      const r = await fetch(`${API_BASE}/api/templates/${encodeURIComponent(t.id)}`, { method: "DELETE" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      fetchTemplates();
      if (currentTemplate?.name && currentTemplate.name === t.name) {
        setCurrentTemplate(null);
      }
    } catch (e) {
      console.error("[EmailTemplateCard] Failed deleting template:", e);
      alert("Failed to delete template.");
    }
  }

  /* --------------------- Preview building ----------------- */

  // Try multiple places for server totals; return {movies, shows, episodes} or null
  async function getServerTotals(): Promise<{ movies?: number; shows?: number; episodes?: number } | null> {
    // 1) scan current homeSummary
    const blocks = Array.isArray(homeSummary?.home) ? homeSummary.home : [];
    let moviesTotal: number | null = null;
    let showsTotal: number | null = null;
    let episodesTotal: number | null = null;

    for (const b of blocks) {
      const rows = Array.isArray(b?.rows) ? b.rows : [];
      for (const r of rows) {
        if (r?.total_movies != null && moviesTotal == null) moviesTotal = Number(r.total_movies);
        if (r?.total_tv_shows != null && showsTotal == null) showsTotal = Number(r.total_tv_shows);
        if (r?.total_episodes != null && episodesTotal == null) episodesTotal = Number(r.total_episodes);

        if (r?.movies != null && moviesTotal == null) moviesTotal = Number(r.movies);
        if ((r?.tv_shows ?? r?.tvShows) != null && showsTotal == null) showsTotal = Number(r.tv_shows ?? r.tvShows);
        if ((r?.episodes ?? r?.episode_count) != null && episodesTotal == null)
          episodesTotal = Number(r.episodes ?? r.episode_count);

        if (r?.label && r?.count != null) {
          const label = String(r.label).toLowerCase();
          if (moviesTotal == null && /movie/.test(label)) moviesTotal = Number(r.count);
          if (showsTotal == null && /(tv|show)/.test(label)) showsTotal = Number(r.count);
          if (episodesTotal == null && /episode/.test(label)) episodesTotal = Number(r.count);
        }
      }
    }
    if (moviesTotal != null || showsTotal != null || episodesTotal != null) {
      return { movies: moviesTotal ?? undefined, shows: showsTotal ?? undefined, episodes: episodesTotal ?? undefined };
    }

    // 2) try alternative endpoints if your backend exposes them
    const altEndpoints = [
      `${API_BASE}/api/tautulli/server-totals`,
      `${API_BASE}/api/tautulli/library-totals`,
      `${API_BASE}/api/tautulli/library_counts`,
    ];
    for (const url of altEndpoints) {
      try {
        const r = await fetch(url);
        if (!r.ok) continue;
        const j = await r.json();
        const cand = j?.totals || j?.data || j?.result || j || {};
        const movies = Number(cand.total_movies ?? cand.movies ?? cand.movie_count ?? cand.library_movies ?? NaN);
        const shows = Number(cand.total_tv_shows ?? cand.tv_shows ?? cand.shows ?? cand.show_count ?? cand.library_shows ?? NaN);
        const episodes = Number(cand.total_episodes ?? cand.episodes ?? cand.episode_count ?? cand.library_episodes ?? NaN);
        if (Number.isFinite(movies) || Number.isFinite(shows) || Number.isFinite(episodes)) {
          return {
            movies: Number.isFinite(movies) ? movies : undefined,
            shows: Number.isFinite(shows) ? shows : undefined,
            episodes: Number.isFinite(episodes) ? episodes : undefined,
          };
        }
      } catch { /* try next */ }
    }
    return null;
  }

  async function buildPreviewHTML() {
    let html = templateHtml;

    // Host Recommendation — robust load + correct deep link
    if (OWNER_REC_TOKENS.some((t) => html.includes(t))) {
      let body = `<div style="opacity:.7">No item selected.</div>`;

      // 1) Gather candidate id/note from state/props; 2) fallback to server if missing
      let candId =
        normalizePlexId(ownerRec?.plexItemId) ??
        normalizePlexId(config?.ownerRecommendation?.plexItemId) ??
        null;
      let note =
        (typeof ownerRec?.note === "string" && ownerRec.note) ||
        (typeof config?.ownerRecommendation?.note === "string" && config.ownerRecommendation.note) ||
        "";

      if (!candId) {
        const fetched = await fetchOwnerRecFromServer();
        if (fetched?.plexItemId) candId = normalizePlexId(fetched.plexItemId);
        if (!note && fetched?.note) note = fetched.note;
      }

      try {
        if (candId) {
          const r = await fetch(`${API_BASE}/api/plex/item/${encodeURIComponent(String(candId))}`);
          if (r.ok) {
            const j = await r.json();
            const item = j?.item || j || null;
            if (item) {
              const title = item.title || item.grandparentTitle || "Title";
              const year = item.year ? ` (${item.year})` : "";
              const href = (await plexWebHrefForItem(item)) || "#";
              const pSrc = posterFrom(item);
              const img = pSrc ? posterImg(pSrc, title, 96, 144) : "";
              const info =
                `<div><a href="${href}" target="_blank" rel="noreferrer" style="text-decoration:none;color:#93c5fd"><strong>${htmlEscape(title)}${year}</strong></a>` +
                (note ? `<div style="margin-top:6px">${htmlEscape(note)}</div>` : "") +
                `</div>`;
              body = `<div style="display:flex;align-items:flex-start">${img}${info}</div>`;
            }
          }
        }
      } catch { /* leave default body */ }

      const card = cardHtml("Host’s Recommendation", body);
      OWNER_REC_TOKENS.forEach((t) => { if (html.includes(t)) html = html.replaceAll(t, card); });
    }

    // Helper to pull rows for specific block ids
    const pick = (ids: string[]) => {
      const rows = pickRows(ids);
      return Array.isArray(rows) ? rows : [];
    };

    // Most Watched Movies
    if (html.includes("{{CARD_MOST_WATCHED_MOVIES}}")) {
      const rows = pick(["top_movies", "most_watched_movies"]);
      const items = rows
        .filter((r: any) => rowType(r) === "movie")
        .map((r: any) => ({
          title: r?.title || "Untitled",
          year: r?.year,
          plays: Number(r?.total_plays || r?.plays || 0),
          poster: posterFrom(r),
        }))
        .sort((a: any, b: any) => b.plays - a.plays)
        .slice(0, 5);
      const body = items.length
        ? `<ol style="margin:0;padding-left:18px">${items
            .map(
              (x) =>
                `<li style="display:flex;align-items:center;margin:6px 0;">${
                  x.poster ? posterImg(x.poster, x.title) : ""
                }<div>${htmlEscape(x.title)}${x.year ? ` (${x.year})` : ""}<div style="opacity:.7;font-size:12px">${x.plays} plays</div></div></li>`
            )
            .join("")}</ol>`
        : `<div style="opacity:.7">${homeLoading ? "Loading…" : "No data"}</div>`;
      html = html.replaceAll("{{CARD_MOST_WATCHED_MOVIES}}", cardHtml("Most Watched Movies", body));
    }

    // Most Watched Shows
    if (html.includes("{{CARD_MOST_WATCHED_SHOWS}}")) {
      const rows = pick(["top_tv", "most_watched_tv_shows", "most_watched_tv"]);
      const items = rows
        .map((r: any) => ({
          title: r?.grandparent_title || r?.title || "TV Show",
          plays: Number(r?.total_plays || r?.plays || 0),
          poster: posterFrom(r),
        }))
        .sort((a: any, b: any) => b.plays - a.plays)
        .slice(0, 5);
      const body = items.length
        ? `<ol style="margin:0;padding-left:18px">${items
            .map(
              (x) =>
                `<li style="display:flex;align-items:center;margin:6px 0;">${
                  x.poster ? posterImg(x.poster, x.title) : ""
                }<div>${htmlEscape(x.title)}<div style="opacity:.7;font-size:12px">${x.plays} plays</div></div></li>`
            )
            .join("")}</ol>`
        : `<div style="opacity:.7">${homeLoading ? "Loading…" : "No data"}</div>`;
      html = html.replaceAll("{{CARD_MOST_WATCHED_SHOWS}}", cardHtml("Most Watched TV Shows", body));
    }

    // Most Watched Episodes
    if (html.includes("{{CARD_MOST_WATCHED_EPISODES}}")) {
      const rows = pick(["top_tv", "most_watched_tv_shows", "most_watched_tv"]);
      const items = rows
        .filter((r: any) => ["episode", "season", "show"].includes(rowType(r)))
        .map((r: any) => {
          const show = r?.grandparent_title || r?.title || "Show";
          const title = r?.title && r?.grandparent_title ? `${show} — ${r.title}` : show;
          return { title, plays: Number(r?.total_plays || r?.plays || 0), poster: posterFrom(r) };
        })
        .sort((a: any, b: any) => b.plays - a.plays)
        .slice(0, 5);
      const body = items.length
        ? `<ol style="margin:0;padding-left:18px">${items
            .map(
              (x) =>
                `<li style="display:flex;align-items:center;margin:6px 0;">${
                  x.poster ? posterImg(x.poster, x.title) : ""
                }<div>${htmlEscape(x.title)}<div style="opacity:.7;font-size:12px">${x.plays} plays</div></div></li>`
            )
            .join("")}</ol>`
        : `<div style="opacity:.7">${homeLoading ? "Loading…" : "No data"}</div>`;
      html = html.replaceAll("{{CARD_MOST_WATCHED_EPISODES}}", cardHtml("Most Watched Episodes", body));
    }

    // Popular Movies
    if (html.includes("{{CARD_POPULAR_MOVIES}}")) {
      const rows = pick(["popular_movies"]);
      const items = rows
        .filter((r: any) => rowType(r) === "movie")
        .map((r: any) => ({
          title: r?.title || "Untitled",
          year: r?.year,
          users: Number(r?.users_watched || r?.unique_users || 0),
          poster: posterFrom(r),
        }))
        .sort((a: any, b: any) => b.users - a.users)
        .slice(0, 5);
      const body = items.length
        ? `<ol style="margin:0;padding-left:18px">${items
            .map(
              (x) =>
                `<li style="display:flex;align-items:center;margin:6px 0;">${
                  x.poster ? posterImg(x.poster, x.title) : ""
                }<div>${htmlEscape(x.title)}${x.year ? ` (${x.year})` : ""}<div style="opacity:.7;font-size:12px">${x.users} unique viewers</div></div></li>`
            )
            .join("")}</ol>`
        : `<div style="opacity:.7">${homeLoading ? "Loading…" : "No data"}</div>`;
      html = html.replaceAll("{{CARD_POPULAR_MOVIES}}", cardHtml("Most Popular Movies", body));
    }

    // Popular Shows
    if (html.includes("{{CARD_POPULAR_SHOWS}}")) {
      const rows = pick(["popular_tv", "popular_shows"]);
      const items = rows
        .map((r: any) => ({
          title: r?.grandparent_title || r?.title || "TV Show",
          users: Number(r?.users_watched || r?.unique_users || 0),
          poster: posterFrom(r),
        }))
        .sort((a: any, b: any) => b.users - a.users)
        .slice(0, 5);
      const body = items.length
        ? `<ol style="margin:0;padding-left:18px">${items
            .map(
              (x) =>
                `<li style="display:flex;align-items:center;margin:6px 0;">${
                  x.poster ? posterImg(x.poster, x.title) : ""
                }<div>${htmlEscape(x.title)}<div style="opacity:.7;font-size:12px">${x.users} unique viewers</div></div></li>`
            )
            .join("")}</ol>`
        : `<div style="opacity:.7">${homeLoading ? "Loading…" : "No data"}</div>`;
      html = html.replaceAll("{{CARD_POPULAR_SHOWS}}", cardHtml("Most Popular TV Shows", body));
    }

    // Popular Platforms — use PNG icons + mapping (treat “tvos” as Apple TV)
    if (html.includes("{{CARD_POPULAR_PLATFORMS}}")) {
      const rows = pick(["top_platforms", "most_used_platforms", "top_clients"]);
      const items = rows
        .map((r: any) => {
          const raw = r?.platform || r?.label || "Other";
          const key = normalizePlatform(raw);
          const label = PLATFORM_LABEL_MAP[key] || (raw ? String(raw) : "Other");
          const plays = Number(r?.total_plays || r?.plays || 0);
          const icon = platformIconTag(key, label);
          return { key, label, plays, icon };
        })
        .sort((a: any, b: any) => b.plays - a.plays)
        .slice(0, 5);

      const body = items.length
        ? `<ol style="margin:0;padding-left:18px">${items
            .map((x) => `<li style="display:flex;align-items:center;margin:8px 0;">${x.icon}<div>${htmlEscape(x.label)}<div style="opacity:.7;font-size:12px">${x.plays} plays</div></div></li>`)
            .join("")}</ol>`
        : `<div style="opacity:.7">${homeLoading ? "Loading…" : "No data"}</div>`;

      html = html.replaceAll("{{CARD_POPULAR_PLATFORMS}}", cardHtml("Most Popular Streaming Platform", body));
    }

    // Streaming Summary (Last XX Days) — labels & hours/minutes
    if (html.includes("{{CARD_STREAMING_DATA}}")) {
      const t = homeSummary?.totals || {};
      const human = formatHrsMins(Number(t.total_time_seconds || 0));
      const daysSuffix = ` (Last ${historyDaysForPreview} Days)`;
      const body = `
        <ul style="margin:0;padding-left:18px">
          ${li(`Movies Streamed${daysSuffix}`, String(t.movies ?? 0))}
          ${li(`TV Episodes Streamed${daysSuffix}`, String(t.episodes ?? 0))}
          ${li("Total Hours of Streamed Media", human)}
        </ul>`;
      html = html.replaceAll("{{CARD_STREAMING_DATA}}", cardHtml("Streaming Summary", body));
    }

    // Server Totals (library) — try library totals; fallback to streaming totals
    if (html.includes("{{CARD_SERVER_TOTALS}}")) {
      const lib = await getServerTotals();
      let body: string;

      if (lib && (lib.movies != null || lib.shows != null || lib.episodes != null)) {
        body = `<ul style="margin:0;padding-left:18px">
          ${lib.movies != null ? li("Movies", String(lib.movies)) : ""}
          ${lib.shows != null ? li("TV Series", String(lib.shows)) : ""}
          ${lib.episodes != null ? li("Episodes", String(lib.episodes)) : ""}
        </ul>`;
      } else {
        const t = homeSummary?.totals || {};
        const moviesStreamed = Number(t.movies ?? 0);
        const episodesStreamed = Number(t.episodes ?? 0);
        const hoursHuman = formatHrsMins(Number(t.total_time_seconds || 0));

        if (moviesStreamed || episodesStreamed || Number(t.total_time_seconds || 0)) {
          body = `<ul style="margin:0;padding-left:18px">
            ${li("Movies Streamed", String(moviesStreamed))}
            ${li("TV Episodes Streamed", String(episodesStreamed))}
            ${li("Total Hours of Streamed Media", hoursHuman)}
          </ul>`;
        } else {
          body = `<div style="opacity:.7">${homeLoading ? "Loading…" : "Totals not available from Tautulli Home Stats."}</div>`;
        }
      }

      html = html.replaceAll("{{CARD_SERVER_TOTALS}}", cardHtml("Plex Media Server Totals", body));
    }

    // Recently Added Movies
    if (html.includes("{{CARD_RECENT_MOVIES}}")) {
      const rows = pick(["recently_added", "recently_added_movies", "recently_added_items"]) || [];
      const items = rows
        .filter((r: any) => rowType(r) === "movie")
        .map((r: any) => ({
          title: r?.title || "Untitled",
          year: r?.year,
          poster: posterFrom(r),
          summary: r?.summary || r?.plot || r?.tagline || "",
        }))
        .slice(0, 6);
      const body =
        items.length > 0
          ? stackedList(items)
          : `<div style="opacity:.75">${homeLoading ? "Loading…" : `Preview • Will populate dynamically on send (Last ${historyDaysForPreview} Days).`}</div>`;
      html = html.replaceAll("{{CARD_RECENT_MOVIES}}", cardHtml("Recently added Movies", body));
    }

    // Recently Added Episodes
    if (html.includes("{{CARD_RECENT_EPISODES}}")) {
      const rows = pick(["recently_added", "recently_added_tv", "recently_added_items"]) || [];
      const items = rows
        .filter((r: any) => ["episode", "season", "show"].includes(rowType(r)))
        .map((r: any) => ({
          title: r?.grandparent_title ? `${r.grandparent_title}${r.title ? " — " + r.title : ""}` : r?.title || "Episode",
          poster: posterFrom(r),
          summary: r?.summary || r?.plot || "",
        }))
        .slice(0, 6);
      const body =
        items.length > 0
          ? stackedList(items)
          : `<div style="opacity:.75">${homeLoading ? "Loading…" : `Preview • Will populate dynamically on send (Last ${historyDaysForPreview} Days).`}</div>`;
      html = html.replaceAll("{{CARD_RECENT_EPISODES}}", cardHtml("Recently added TV Episodes", body));
    }

    return html;
  }

  const [showPreview, setShowPreview] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string>("");

  async function openPreview() {
    if (!homeSummary && !homeLoading) {
      await loadHomeSummary();
    }
    const built = await buildPreviewHTML();
    setPreviewHtml(built);
    setShowPreview(true);
  }

  useEffect(() => {
    if (showPreview) {
      (async () => setPreviewHtml(await buildPreviewHTML()))();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerRec, homeSummary, homeLoading, historyDaysForPreview]);

  /* ---------------------------------- UI ---------------------------------- */
  return (
    <div className="card bg-base-100 shadow">
      <div className="card-body">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-h-[1.25rem]">
            {currentTemplate?.name ? (
              <>
                <h2 className="card-title">{currentTemplate.name} Template</h2>
              </>
            ) : null}
          </div>
          <div className="join">
            <div className="dropdown dropdown-end">
              <label tabIndex={0} className="btn btn-sm join-item">Snippets</label>
              <ul tabIndex={0} className="dropdown-content z-[1] menu p-2 shadow bg-base-100 rounded-box w-72">
                {TEMPLATE_TOKENS.map((t) => (
                  <li key={t.key}>
                    <button
                      className="justify-start"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={async () => { await insertTokenAtCaret(t.key); }}
                    >
                      {t.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            <button className="btn btn-sm join-item" onClick={() => exec("bold")}><span className="font-bold">B</span></button>
            <button className="btn btn-sm join-item italic" onClick={() => exec("italic")}>I</button>
            <button className="btn btn-sm join-item underline" onClick={() => exec("underline")}>U</button>
            <button className="btn btn-sm join-item" onClick={() => exec("formatBlock", "h2")}>H2</button>
            <button className="btn btn-sm join-item" onClick={() => { const url = prompt("Link URL"); if (url) exec("createLink", url); }}>Link</button>
            <button className="btn btn-sm join-item" onClick={() => exec("insertUnorderedList")}>• List</button>
            <button className="btn btn-sm join-item" onClick={() => exec("insertOrderedList")}>1. List</button>
            <button className="btn btn-sm join-item" onClick={() => exec("removeFormat")}>Clear</button>
          </div>
        </div>

        <div
          ref={editorRef}
          className="min-h-[180px] max-h-[300px] overflow-auto border border-base-300 rounded-lg p-3 prose prose-sm max-w-none bg-base-200"
          contentEditable
          suppressContentEditableWarning
          onInput={handleEditorInput}
          onKeyUp={saveSelection}
          onMouseUp={saveSelection}
          style={{ outline: "none", whiteSpace: "pre-wrap", wordBreak: "break-word" }}
        />

        <div className="flex items-center justify-between mt-3">
          <div className="flex items-center gap-2">
            <button className="btn btn-sm" onClick={openTemplatesPicker}>Templates</button>
            <span className="text-xs opacity-70">Insert tokens via Snippets; they’ll render as full cards in Preview and when sending.</span>
          </div>
          <div className="flex items-center gap-2">
            <button className="btn" onClick={openPreview}>Preview</button>
            <button
              className={`btn btn-primary ${templateSaving ? "loading" : ""}`}
              onClick={openNameModal}
              disabled={templateSaving}
            >
              {templateSaving ? "Saving…" : "Save Template"}
            </button>
          </div>
        </div>
      </div>

      {/* Preview Modal */}
      {showPreview && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowPreview(false)} aria-hidden />
          <div className="absolute inset-0 p-4 grid place-items-center" role="dialog" aria-modal="true" aria-label="Email Preview">
            <div className="card bg-base-100 shadow-xl w-full max-w-3xl max-h-[90vh]">
              <div className="card-body overflow-auto">
                <div className="flex items-center justify-between">
                  <h3 className="card-title">Preview</h3>
                  <button className="btn btn-sm" onClick={() => setShowPreview(false)}>Close</button>
                </div>
                <div className="mt-3 border border-base-300 rounded-lg p-4 bg-base-200">
                  <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Templates Picker Modal */}
      {templatesModalOpen && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => setTemplatesModalOpen(false)} aria-hidden />
          <div className="absolute inset-0 p-4 grid place-items-center" role="dialog" aria-modal="true" aria-label="Templates">
            <div className="card bg-base-100 shadow-xl w-full max-w-lg max-h-[80vh]">
              <div className="card-body overflow-auto">
                <div className="flex items-center justify-between">
                  <h3 className="card-title">Saved Templates</h3>
                  <button className="btn btn-sm" onClick={() => setTemplatesModalOpen(false)}>Close</button>
                </div>

                <div className="mt-3">
                  {templatesLoading ? (
                    <div className="opacity-70">Loading…</div>
                  ) : tplError ? (
                    <div className="text-error">Failed to load: {tplError}</div>
                  ) : templates.length === 0 ? (
                    <div className="opacity-70">No templates saved yet.</div>
                  ) : (
                    <ul className="menu bg-base-200 rounded divide-y divide-base-300">
                      {templates.map((t) => (
                        <li key={t.id} className="!p-0">
                          <div className="flex items-center justify-between gap-3 px-3 py-2">
                            <div className="min-w-0">
                              <div className="truncate font-medium">{t.name}</div>
                              <div className="opacity-60 text-xs">
                                {t.updatedAt ? new Date(t.updatedAt).toLocaleString() : ""}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <button
                                className="btn btn-xs"
                                onClick={() => loadTemplate(t)}
                                title="Load this template"
                              >
                                Load
                              </button>
                              <button
                                className="btn btn-xs btn-error"
                                onClick={() => deleteTemplate(t)}
                                title="Delete this template"
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="mt-4">
                  <button className="btn btn-sm" onClick={fetchTemplates}>Refresh</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Name Template Modal */}
      {nameModalOpen && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => setNameModalOpen(false)} aria-hidden />
          <div className="absolute inset-0 p-4 grid place-items-center" role="dialog" aria-modal="true" aria-label="Name Template">
            <div className="card bg-base-100 shadow-xl w-full max-w-md">
              <div className="card-body">
                <h3 className="card-title">Save Template</h3>

                <label className="form-control mt-2">
                  <div className="label">
                    <span className="label-text">Template Name</span>
                  </div>
                  <input
                    className="input input-bordered"
                    placeholder="e.g., Weekly Newsletter"
                    value={newTemplateName}
                    onChange={(e) => setNewTemplateName(e.target.value)}
                  />
                </label>



                <div className="mt-4 flex items-center justify-end gap-2">
                  <button className="btn btn-ghost" onClick={() => setNameModalOpen(false)}>Cancel</button>
                  <button
                    className={`btn btn-primary ${templateSaving ? "loading" : ""}`}
                    onClick={saveTemplateToLibrary}
                    disabled={templateSaving || !newTemplateName.trim()}
                  >
                    {templateSaving ? "Saving…" : "Save"}
                  </button>
                </div>
                <div className="mt-2 text-xs opacity-70">
                  If a template with this name exists, it will be updated.
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
