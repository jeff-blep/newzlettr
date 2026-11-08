/** Email-safe HTML building blocks. Everything is tables + inline styles (Gmail/Outlook). */

export type Scheme = "dark" | "light";

export interface Theme {
  scheme: Scheme;
  accent: string;
  page: string;
  container: string;
  card: string;
  cardAlt: string;
  text: string;
  muted: string;
  faint: string;
  /** Box shown where a poster is missing. */
  placeholder: string;
  font: string;
}

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

/** Every colour is unique per palette: the "match device" CSS maps light -> dark by exact value. */
const PALETTES: Record<Scheme, Omit<Theme, "accent" | "font" | "scheme">> = {
  dark: {
    page: "#111214",
    container: "#18191c",
    card: "#222327",
    cardAlt: "#2a2b30",
    text: "#e8e8ed",
    muted: "#a0a1ab",
    faint: "#6c6d76",
    placeholder: "#2f3036",
  },
  light: {
    page: "#eef0f4",
    container: "#ffffff",
    card: "#fcfcfd",
    cardAlt: "#f0f1f5",
    text: "#1d1e24",
    muted: "#5b5c68",
    faint: "#8a8b97",
    placeholder: "#dcdde4",
  },
};

export function themeFor(accent: string, scheme: Scheme = "dark"): Theme {
  return { scheme, accent, font: FONT, ...PALETTES[scheme] };
}

/**
 * CSS that turns the light design dark where the mail app supports prefers-color-scheme
 * (Apple Mail, iOS Mail, Outlook for Mac/iOS...). Gmail ignores it and shows light.
 * Rules match the exact light colour values in inline styles and swap in the dark ones.
 */
export function darkModeCss(forceDark = false): string {
  const light = PALETTES.light;
  const dark = PALETTES.dark;
  const keys = Object.keys(light) as (keyof typeof light)[];
  const rules: string[] = [];
  for (const k of keys) {
    const from = light[k];
    const to = dark[k];
    rules.push(`[style*="background:${from}"]{background:${to}!important}`);
    rules.push(`[style*="color:${from}"]{color:${to}!important}`);
    rules.push(`[style*="solid ${from}"]{border-color:${to}!important}`);
  }
  const body = `body,.nz-bg{background:${dark.page}!important} ${rules.join(" ")}`;
  // forceDark: used by the in-app preview to show the dark variant regardless of the viewer's OS.
  return forceDark ? body : `@media (prefers-color-scheme: dark){${body}}`;
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

export function img(t: Theme, src: string, w: number, h: number, alt = "", radius = 6): string {
  return `<img src="${esc(src)}" width="${w}" height="${h}" alt="${esc(alt)}" style="display:block;width:${w}px;height:${h}px;max-width:100%;border:0;border-radius:${radius}px;object-fit:cover;background:${t.placeholder}">`;
}

/** Poster with a neutral box when there's no image. */
export function poster(t: Theme, thumb: string | undefined, w: number, alt = "", radius = 6): string {
  const h = Math.round(w * 1.5);
  if (!thumb) {
    return `<div style="width:${w}px;height:${h}px;border-radius:${radius}px;background:${t.placeholder}"></div>`;
  }
  return img(t, plexImg(thumb, w * 2, h * 2), w, h, alt, radius);
}

export function link(href: string | null | undefined, inner: string, color: string): string {
  return href ? `<a href="${esc(href)}" style="color:${color};text-decoration:none">${inner}</a>` : inner;
}

export function button(t: Theme, href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:14px"><tr>
    <td style="border-radius:8px;background:${t.accent}">
      <a href="${esc(href)}" style="display:inline-block;padding:10px 18px;font:600 14px ${t.font};color:#fff;text-decoration:none;border-radius:8px">${esc(label)}</a>
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
