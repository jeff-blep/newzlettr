import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { applyShares } from "../src/data/plexAccess.js";
import { openDb } from "../src/db/index.js";
import { parseSharedUsers } from "../src/integrations/plex.js";

// Shape of plex.tv/api/servers/<machine>/shared_servers (synthetic people, fake tokens).
const XML = `<?xml version="1.0" encoding="UTF-8"?>
<MediaContainer friendlyName="myPlex" machineIdentifier="MINE" size="4">
  <SharedServer id="11" username="ann" email="Ann@Example.com" userID="101" accessToken="SECRET-A" name="Ann &amp; Co" acceptedAt="1700000000" invitedAt="1690000000" allowSync="1" allLibraries="1" owned="0">
    <Section id="1" key="1" title="Movies" type="movie" shared="1"/>
    <Section id="2" key="3" title="TV Shows" type="show" shared="1"/>
    <Section id="3" key="6" title="Home Videos" type="movie" shared="1"/>
  </SharedServer>
  <SharedServer id="12" username="bob" email="bob@example.com" userID="102" accessToken="SECRET-B" name="Bob" acceptedAt="1700000000" allLibraries="0">
    <Section id="1" key="1" title="Movies" type="movie" shared="1"/>
    <Section id="2" key="3" title="TV Shows" type="show" shared="1"/>
    <Section id="3" key="6" title="Home Videos" type="movie" shared="0"/>
  </SharedServer>
  <SharedServer id="13" username="cat" email="cat@example.com" userID="103" accessToken="SECRET-C" name="Cat" acceptedAt="1700000000" allLibraries="0">
    <Section id="1" key="1" title="Movies" type="movie" shared="0"/>
    <Section id="2" key="3" title="TV Shows" type="show" shared="0"/>
    <Section id="3" key="6" title="Home Videos" type="movie" shared="0"/>
  </SharedServer>
  <SharedServer id="14" username="dan" email="dan@example.com" userID="104" accessToken="SECRET-D" name="Dan" acceptedAt="0" allLibraries="0">
    <Section id="1" key="1" title="Movies" type="movie" shared="1"/>
  </SharedServer>
</MediaContainer>`;

describe("parseSharedUsers (shared_servers)", () => {
  it("reads libraries per person, decodes entities, flags pending, and never exposes the access token", () => {
    const users = parseSharedUsers(XML);
    expect(users.map((u) => [u.username, u.libraries, u.pending])).toEqual([
      ["ann", ["Home Videos", "Movies", "TV Shows"], false],
      ["bob", ["Movies", "TV Shows"], false],
      ["cat", [], false],
      ["dan", ["Movies"], true],
    ]);
    expect(users[0]).toMatchObject({ title: "Ann & Co", email: "ann@example.com", userId: "101", allLibraries: true });
    expect(JSON.stringify(users)).not.toContain("SECRET");
  });

  it("handles one share and none", () => {
    expect(parseSharedUsers(`<MediaContainer size="0"></MediaContainer>`)).toEqual([]);
    expect(parseSharedUsers(`<MediaContainer><SharedServer email="a@b.co" acceptedAt="1"><Section title="Movies" shared="1"/></SharedServer></MediaContainer>`)).toHaveLength(1);
  });
});

describe("applyShares", () => {
  it("classifies every recipient: libraries / friend with no libraries / invited / no access", () => {
    const db = openDb(path.join(fs.mkdtempSync(path.join(os.tmpdir(), "nz-pa-")), "t.db"));
    for (const e of ["ann@example.com", "BOB@example.com", "cat@example.com", "dan@example.com", "eve@example.com"]) {
      db.prepare("INSERT INTO recipients(email) VALUES(?)").run(e.toLowerCase());
    }
    const s = applyShares(db, parseSharedUsers(XML));
    expect(s).toEqual({ shares: 4, libraries: 2, noLibraries: 1, invited: 1, noAccess: 1 });
    const rows = db.prepare("SELECT email, plex_status, plex_libraries, plex_user_id FROM recipients ORDER BY email").all() as Record<string, string>[];
    expect(rows.map((r) => [r.email, r.plex_status])).toEqual([
      ["ann@example.com", "libraries"],
      ["bob@example.com", "libraries"],
      ["cat@example.com", "no_libraries"],
      ["dan@example.com", "invited"],
      ["eve@example.com", "no_access"],
    ]);
    expect(JSON.parse(rows[1]!.plex_libraries!)).toEqual(["Movies", "TV Shows"]);

    // Matched by Plex user id even if the recipient's email changed since.
    db.prepare("UPDATE recipients SET email = 'cat-new@example.com' WHERE email = 'cat@example.com'").run();
    applyShares(db, parseSharedUsers(XML));
    expect((db.prepare("SELECT plex_status FROM recipients WHERE email = 'cat-new@example.com'").get() as { plex_status: string }).plex_status).toBe("no_libraries");
  });
});
