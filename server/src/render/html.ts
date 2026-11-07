/** Email-safe HTML building blocks. Everything is tables + inline styles (Gmail/Outlook). */

export interface Theme {
  accent: string;
  page: string;
  container: string;
  card: string;
  cardAlt: string;
  text: string;
  muted: string;
  faint: string;
  font: string;
}

export function themeFor(accent: string): Theme {
  return {
    accent,
    page: "#111214",
    container: "#18191c",
    card: "#222327",
    cardAlt: "#2a2b30",
    text: "#e8e8ed",
    muted: "#a0a1ab",
    faint: "#6c6d76",
    font: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  };
}

export function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Placeholder image URLs, resolved later per mode (preview / embedded / hosted). */
export const plexImg = (path: string, w: number, h: number) => `nzimg://plex?path=${encodeURIComponent(path)}&w=${w}&h=${h}`;
export const assetImg = (file: string) => `nzimg://asset/${file}`;

export function img(src: string, w: number, h: number, alt = "", radius = 6): string {
  return `<img src="${esc(src)}" width="${w}" height="${h}" alt="${esc(alt)}" style="display:block;width:${w}px;height:${h}px;max-width:100%;border:0;border-radius:${radius}px;object-fit:cover;background:#2f3036">`;
}

/** Poster with a neutral box when there's no image. */
export function poster(thumb: string | undefined, w: number, alt = "", radius = 6): string {
  const h = Math.round(w * 1.5);
  if (!thumb) {
    return `<div style="width:${w}px;height:${h}px;border-radius:${radius}px;background:#2f3036"></div>`;
  }
  return img(plexImg(thumb, w * 2, h * 2), w, h, alt, radius);
}

export function link(href: string | null | undefined, inner: string, color: string): string {
  return href ? `<a href="${esc(href)}" style="color:${color};text-decoration:none">${inner}</a>` : inner;
}

export function button(t: Theme, href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:14px"><tr>
    <td style="border-radius:8px;background:${t.accent}">
      <a href="${esc(href)}" style="display:inline-block;padding:10px 18px;font:600 14px ${t.font};color:#ffffff;text-decoration:none;border-radius:8px">${esc(label)}</a>
    </td></tr></table>`;
}

/** A section card with an eyebrow label and title. */
export function card(t: Theme, eyebrow: string, title: string, body: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px 0">
  <tr><td style="background:${t.card};border-radius:14px;padding:22px 22px 20px 22px">
    <div style="font:700 11px ${t.font};letter-spacing:0.12em;text-transform:uppercase;color:${t.accent};margin:0 0 4px 0">${esc(eyebrow)}</div>
    <div style="font:600 20px/1.3 ${t.font};color:${t.text};margin:0 0 16px 0">${esc(title)}</div>
    ${body}
  </td></tr></table>`;
}

export function emptyNote(t: Theme, text: string): string {
  return `<div style="font:400 14px ${t.font};color:${t.muted}">${esc(text)}</div>`;
}

export const fmt = new Intl.NumberFormat("en-US");

export function truncate(s: string | undefined, n: number): string {
  if (!s) return "";
  const clean = s.replace(/\s+/g, " ").trim();
  return clean.length <= n ? clean : `${clean.slice(0, n).replace(/\s+\S*$/, "")}…`;
}

export function runtime(minutes: number | undefined): string {
  if (!minutes) return "";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}
