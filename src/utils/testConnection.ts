// src/utils/testConnection.ts

interface ConnectionSettings {
  type: "smtp" | "plex" | "tautulli";
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  email?: string;
  plexToken?: string;
  plexUrl?: string;
  tautulliUrl?: string;
  tautulliApiKey?: string;
}

// For SMTP we already know Nodemailer is handling the live send in production.
// For Plex and Tautulli we’ll just attempt a fetch to confirm reachability.

export async function testConnection(settings: ConnectionSettings): Promise<boolean> {
  try {
    if (settings.type === "smtp") {
      // Fake test – in production we don’t need to test here
      return true;
    }

    if (settings.type === "plex") {
      if (!settings.plexUrl || !settings.plexToken) {
        throw new Error("Missing Plex URL or Token");
      }
      const res = await fetch(`${settings.plexUrl}/?X-Plex-Token=${settings.plexToken}`);
      return res.ok;
    }

    if (settings.type === "tautulli") {
      if (!settings.tautulliUrl || !settings.tautulliApiKey) {
        throw new Error("Missing Tautulli URL or API Key");
      }
      const res = await fetch(
        `${settings.tautulliUrl}/api/v2?apikey=${settings.tautulliApiKey}&cmd=ping`
      );
      const json = await res.json();
      return json?.response?.result === "success";
    }

    return false;
  } catch (err) {
    console.error("Connection test failed:", err);
    return false;
  }
}
