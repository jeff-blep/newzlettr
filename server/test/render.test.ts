import { describe, expect, it } from "vitest";
import { dateRange, normalizeCardMarkers } from "../src/render/render.js";
import { htmlToText, sanitizeTemplate } from "../src/render/sanitize.js";
import { cardForToken, tokensIn } from "../src/render/tokens.js";
import { esc, truncate } from "../src/render/html.js";

describe("sanitizeTemplate", () => {
  it("drops pasted font/colour styles and scripts but keeps structure and formatting", () => {
    const dirty = `<p style="color:rgb(255,255,255);font-family:Helvetica;text-align:center"><span style="font-size:16px">Hi <b>there</b></span></p>
      <script>alert(1)</script><img src="javascript:alert(1)"><a href="javascript:alert(1)" onclick="x()">bad</a><a href="https://ok.example">ok</a>
      <div data-card="CARD_RECENT_MOVIES">{{CARD_RECENT_MOVIES}}</div>`;
    const clean = sanitizeTemplate(dirty);
    expect(clean).toContain('<p style="text-align:center">');
    expect(clean).toContain("<b>there</b>");
    expect(clean).not.toMatch(/color|font-family|font-size|script|onclick|javascript/i);
    expect(clean).toContain('<a href="https://ok.example">ok</a>');
    expect(clean).toContain('<div data-card="CARD_RECENT_MOVIES">{{CARD_RECENT_MOVIES}}</div>');
  });
});

describe("tokens", () => {
  it("maps canonical tokens and v1 aliases", () => {
    expect(cardForToken("CARD_HOST_PICK")).toBe("HOST_PICK");
    expect(cardForToken("CARD_OWNER_RECOMMENDATION")).toBe("HOST_PICK");
    expect(cardForToken("card_recent_movies")).toBe("RECENT_MOVIES");
    expect(cardForToken("CARD_MOST_WATCHED_EPISODES")).toBe("MOST_WATCHED_SHOWS");
    expect(cardForToken("CARD_NOPE")).toBeNull();
  });

  it("finds each card once", () => {
    expect(tokensIn("<p>{{CARD_RECENT_MOVIES}}</p><p>{{ CARD_RECENT_MOVIES }}</p>{{CARD_OWNER_RECOMMENDATION}}{{CARD_X}}")).toEqual(["RECENT_MOVIES", "HOST_PICK"]);
  });
});

describe("text helpers", () => {
  it("htmlToText keeps paragraphs and link targets", () => {
    const t = htmlToText('<p>Hello &amp; welcome</p><p>See <a href="https://x.example">the site</a></p><ul><li>One</li></ul>');
    expect(t).toBe("Hello & welcome\nSee the site (https://x.example)\n• One");
  });

  it("escapes and truncates on word boundaries", () => {
    expect(esc(`<a href="x">'&`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;");
    expect(truncate("one two three four", 9)).toBe("one two…");
    expect(truncate("short", 10)).toBe("short");
  });

  it("dateRange formats the window in the given zone", () => {
    const now = new Date("2026-11-07T15:00:00Z");
    expect(dateRange(now, 7, "America/New_York")).toBe("Nov 1 – Nov 7, 2026");
    expect(dateRange(now, 1, "UTC")).toBe("Nov 7, 2026");
  });
});

describe("card markers", () => {
  it("empty and filled data-card markers both become tokens (empty ones used to render nothing)", () => {
    const html = '<p>Hi</p><div data-card="CARD_RECENT_MOVIES"></div><div data-card="CARD_SERVER_TOTALS">{{CARD_SERVER_TOTALS}}</div><span data-card="CARD_HOST_PICK"></span>';
    const out = normalizeCardMarkers(sanitizeTemplate(html));
    expect(tokensIn(out)).toEqual(["RECENT_MOVIES", "SERVER_TOTALS", "HOST_PICK"]);
    expect(out).not.toContain("data-card");
  });
});
