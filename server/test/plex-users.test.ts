import { describe, expect, it } from "vitest";
import { parseSharedUsers } from "../src/integrations/plex.js";

// Shape of plex.tv/api/users (synthetic people).
const XML = `<?xml version="1.0" encoding="UTF-8"?>
<MediaContainer friendlyName="myPlex" identifier="com.plexapp.plugins.myplex" machineIdentifier="x" size="4">
  <User id="1" title="Ann &amp; Co" username="ann" email="Ann@Example.com" home="0" restricted="0">
    <Server id="9" serverId="9" machineIdentifier="MINE" name="Home" lastSeenAt="1" numLibraries="3" allLibraries="1" owned="1" pending="0"/>
  </User>
  <User id="2" title="Bob" username="bob" email="bob@example.com" home="0">
    <Server machineIdentifier="SOMEONE_ELSE" pending="0"/>
  </User>
  <User id="3" title="Cat" username="cat" email="cat@example.com" home="0">
    <Server machineIdentifier="OTHER" pending="0"/>
    <Server machineIdentifier="MINE" pending="1"/>
  </User>
  <User id="4" title="Kid" username="" email="" home="1">
    <Server machineIdentifier="MINE" pending="0"/>
  </User>
</MediaContainer>`;

describe("parseSharedUsers", () => {
  it("keeps only users with access to this server, decodes entities, lowercases email, flags pending", () => {
    const users = parseSharedUsers(XML, "MINE");
    expect(users.map((u) => u.id)).toEqual(["1", "3", "4"]);
    expect(users[0]).toMatchObject({ title: "Ann & Co", email: "ann@example.com", pending: false });
    expect(users[1]).toMatchObject({ email: "cat@example.com", pending: true });
    expect(users[2]).toMatchObject({ email: "", home: true });
  });

  it("handles a single user and an empty list", () => {
    expect(parseSharedUsers(`<MediaContainer size="0"></MediaContainer>`, "MINE")).toEqual([]);
    expect(parseSharedUsers(`<MediaContainer><User id="1" email="a@b.co"><Server machineIdentifier="MINE"/></User></MediaContainer>`, "MINE")).toHaveLength(1);
  });
});
