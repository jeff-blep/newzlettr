import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { openDb } from "../src/db/index.js";
import { button, darkModeCss, themeFor } from "../src/render/html.js";
import { renderNewsletter } from "../src/render/render.js";

describe("email themes", () => {
  it("palettes are internally unique and don't share values across schemes", () => {
    const light = themeFor("#7c5cff", "light");
    const dark = themeFor("#7c5cff", "dark");
    const keys = ["page", "container", "card", "cardAlt", "text", "muted", "faint", "placeholder"] as const;
    const lv = keys.map((k) => light[k]);
    const dv = keys.map((k) => dark[k]);
    expect(new Set(lv).size).toBe(lv.length);
    expect(new Set(dv).size).toBe(dv.length);
    expect(lv.filter((v) => dv.includes(v))).toEqual([]);
  });

  it("dark-mode CSS maps every light colour and never touches the button's white text", () => {
    const css = darkModeCss(true);
    expect(css).toContain('[style*="background:#ffffff"]{background:#18191c!important}');
    expect(css).toContain('[style*="color:#1d1e24"]{color:#e8e8ed!important}');
    const btn = button(themeFor("#7c5cff", "light"), "https://x", "Watch");
    const textStyle = /color:(#[0-9a-f]+);text-decoration/.exec(btn)![1];
    expect(css).not.toContain(`[style*="color:${textStyle}"]`);
    expect(darkModeCss(false).startsWith("@media (prefers-color-scheme: dark)")).toBe(true);
  });

  async function render(theme: "dark" | "light" | "auto", previewScheme?: "light" | "dark") {
    const db = openDb(path.join(fs.mkdtempSync(path.join(os.tmpdir(), "nz-theme-")), "t.db"));
    // No card tokens -> no Plex/Tautulli calls, renders offline.
    return (await renderNewsletter(db, { templateHtml: "<p>Hello</p>", days: 7, previewScheme, look: { emailTheme: theme, headerTitle: "Test News" } })).html;
  }

  it("dark: dark palette, dark color-scheme, no switching CSS", async () => {
    const h = await render("dark");
    expect(h).toContain('content="dark"');
    expect(h).toContain("background:#111214");
    expect(h).not.toContain("prefers-color-scheme");
  });

  it("light: light palette and 'light only' so Apple Mail won't darken it", async () => {
    const h = await render("light");
    expect(h).toContain('content="light only"');
    expect(h).toContain("background:#eef0f4");
    expect(h).not.toContain("prefers-color-scheme");
  });

  it("auto: light palette + light/dark color-scheme + prefers-color-scheme rules", async () => {
    const h = await render("auto");
    expect(h).toContain('content="light dark"');
    expect(h).toContain("background:#eef0f4");
    expect(h).toContain("@media (prefers-color-scheme: dark)");
  });

  it("auto preview: Light omits dark rules (app UI is dark); Dark forces them", async () => {
    const light = await render("auto", "light");
    expect(light).not.toContain("[style*=");
    expect(light).not.toContain("prefers-color-scheme");
    const dark = await render("auto", "dark");
    expect(dark).not.toContain("@media (prefers-color-scheme");
    expect(dark).toContain('[style*="background:#eef0f4"]{background:#111214!important}');
  });
});

describe("per-newsletter look", () => {
  it("accent colour from the look is used in the email", async () => {
    const db = openDb(path.join(fs.mkdtempSync(path.join(os.tmpdir(), "nz-look-")), "t.db"));
    const h = (
      await renderNewsletter(db, {
        templateHtml: "<p>Hi</p>",
        days: 7,
        look: { emailTheme: "light", accentColor: "#e5a00d", headerTitle: "Donation Drive", footerText: "Venmo: @someone" },
      })
    ).html;
    expect(h).toContain("border-top:4px solid #e5a00d");
    expect(h).not.toContain("#7c5cff");
    expect(h).toContain("Donation Drive");
    expect(h).toContain("Venmo: @someone");
  });

  it("migrations 5+6 carry the old Content look, header and footer onto existing newsletters", async () => {
    const { DatabaseSync } = await import("node:sqlite");
    const { migrate } = await import("../src/db/index.js");
    const { MIGRATIONS } = await import("../src/db/migrations.js");
    const d = new DatabaseSync(":memory:");
    // Bring a DB to v4, store an old-style Content look, add a newsletter, then migrate to v5.
    for (const m of MIGRATIONS.filter((x) => x.version <= 4)) d.exec(m.sql);
    d.exec("PRAGMA user_version = 4");
    d.prepare("INSERT INTO settings(key, value) VALUES('content', ?)").run(
      JSON.stringify({ emailTheme: "auto", accentColor: "#ff5c8a", headerTitle: "My News", footerText: "Bye" }),
    );
    d.prepare("INSERT INTO newsletters(name) VALUES('Old')").run();
    migrate(d);
    expect(d.prepare("SELECT email_theme, accent_color, header_title, footer_text FROM newsletters").get()).toEqual({
      email_theme: "auto",
      accent_color: "#ff5c8a",
      header_title: "My News",
      footer_text: "Bye",
    });
  });
});
