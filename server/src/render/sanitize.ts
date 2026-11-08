import sanitizeHtml from "sanitize-html";

/**
 * Template HTML is reduced to structure + basic formatting. Pasted font/colour styling is
 * dropped on purpose: the email design supplies typography, and white-on-white pastes
 * (as found in real v1 templates) would otherwise vanish.
 */
export function sanitizeTemplate(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ["p", "div", "br", "span", "b", "strong", "i", "em", "u", "s", "a", "h1", "h2", "h3", "ul", "ol", "li", "blockquote", "hr", "img"],
    allowedAttributes: {
      a: ["href"],
      img: ["src", "alt", "width", "height"],
      span: ["data-card"],
      div: ["data-card"],
      p: ["style"],
      h1: ["style"],
      h2: ["style"],
      h3: ["style"],
    },
    allowedStyles: { "*": { "text-align": [/^(left|right|center|justify)$/] } },
    allowedSchemes: ["http", "https", "mailto"],
    allowedSchemesByTag: { img: ["https", "http"] },
    allowProtocolRelative: false,
    transformTags: {
      a: (tagName, attribs) => ({ tagName, attribs: { href: attribs.href ?? "" } }),
    },
    exclusiveFilter: (frame) => frame.tag === "span" && !frame.text.trim() && !frame.attribs["data-card"],
  });
}

/** Plain-text alternative for clients that prefer it (and spam filters that like it). */
export function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<(br|\/p|\/div|\/h[1-6]|\/li|\/tr)\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href: string, text: string) =>
      href.startsWith("http") && !text.includes(href) ? `${text} (${href})` : text,
    )
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
