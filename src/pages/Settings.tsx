import React from "react";
import { getConfig, postConfig, testPlex, testTautulli } from "../api";
import NewsletterCard from "./NewsletterCard";

type Cfg = {
  plexUrl: string;
  plexToken: string;
  tautulliUrl: string;
  tautulliApiKey: string;
  smtpUser?: string;
  fromAddress?: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpSecure?: boolean;
  smtpPass?: string;
};

export default function Settings() {
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [testing, setTesting] = React.useState<null | "plex" | "tautulli">(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  // form state
  const [plexUrl, setPlexUrl] = React.useState("");
  const [plexToken, setPlexToken] = React.useState("");
  const [tautulliUrl, setTautulliUrl] = React.useState("");
  const [tautulliApiKey, setTautulliApiKey] = React.useState("");

  // also show SMTP values (read-only in this modal)
  const [smtpUser, setSmtpUser] = React.useState("");
  const [fromAddress, setFromAddress] = React.useState("");

  React.useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      setNotice(null);
      try {
        const cfg = (await getConfig()) as Cfg;
        setPlexUrl(cfg.plexUrl || "");
        setPlexToken(cfg.plexToken || "");
        setTautulliUrl(cfg.tautulliUrl || "");
        setTautulliApiKey(cfg.tautulliApiKey || "");
        setSmtpUser(cfg.smtpUser || "");
        setFromAddress(cfg.fromAddress || "");
      } catch (e: any) {
        setError(e?.message || String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await postConfig({
        plexUrl,
        plexToken,
        tautulliUrl,
        tautulliApiKey,
      });
      setNotice("Connection settings saved.");
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleTest(kind: "plex" | "tautulli") {
    setTesting(kind);
    setError(null);
    setNotice(null);
    try {
      if (kind === "plex") {
        const r = await testPlex();
        if ((r as any)?.ok) setNotice("Plex connection OK.");
        else throw new Error((r as any)?.error || "Plex test failed");
      } else {
        const r = await testTautulli();
        if ((r as any)?.ok) {
          const sc = (r as any)?.streamCount;
          setNotice(`Tautulli connection OK${typeof sc === "number" ? ` (streams: ${sc})` : ""}.`);
        } else {
          throw new Error((r as any)?.error || "Tautulli test failed");
        }
      }
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setTesting(null);
    }
  }

  if (loading) {
    return <div className="p-4">Loading settings…</div>;
  }

  return (
    <div className="p-4 space-y-6">
      <h2 className="text-xl font-bold">Connection Settings</h2>

      {notice && (
        <div className="p-3 rounded border border-green-500/40 bg-green-500/10 text-green-300">
          {notice}
        </div>
      )}
      {error && (
        <div className="p-3 rounded border border-red-500/40 bg-red-500/10 text-red-300">
          {error}
        </div>
      )}

      {/* SMTP (read-only here, just so you can see what’s active) */}
      <section className="space-y-2">
        <h3 className="font-semibold">SMTP (active)</h3>
        <div className="grid gap-2 md:grid-cols-2">
          <label className="flex flex-col">
            <span className="text-sm opacity-70">Sender Name (smtpUser)</span>
            <input className="input input-bordered" value={smtpUser} readOnly />
          </label>
          <label className="flex flex-col">
            <span className="text-sm opacity-70">Sender Email (fromAddress)</span>
            <input className="input input-bordered" value={fromAddress} readOnly />
          </label>
        </div>
      </section>
      {/* Newsletters */}
      <section className="space-y-2">
        <NewsletterCard />
      </section>

      {/* Plex */}
      <section className="space-y-2">
        <h3 className="font-semibold">Plex</h3>
        <div className="grid gap-2 md:grid-cols-2">
          <label className="flex flex-col">
            <span className="text-sm opacity-70">Plex URL</span>
            <input
              className="input input-bordered"
              value={plexUrl}
              onChange={(e) => setPlexUrl(e.target.value)}
              placeholder="http://your-plex-host:32400"
            />
          </label>
          <label className="flex flex-col">
            <span className="text-sm opacity-70">Plex Token</span>
            <input
              className="input input-bordered"
              value={plexToken}
              onChange={(e) => setPlexToken(e.target.value)}
              placeholder="your-plex-token"
            />
          </label>
        </div>
        <div className="flex gap-2">
          <button
            className={`btn btn-primary ${saving ? "btn-disabled" : ""}`}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            className={`btn ${testing === "plex" ? "btn-disabled" : ""}`}
            onClick={() => handleTest("plex")}
            disabled={testing === "plex"}
          >
            {testing === "plex" ? "Testing Plex…" : "Test Plex"}
          </button>
        </div>
      </section>

      {/* Tautulli */}
      <section className="space-y-2">
        <h3 className="font-semibold">Tautulli</h3>
        <div className="grid gap-2 md:grid-cols-2">
          <label className="flex flex-col">
            <span className="text-sm opacity-70">Tautulli URL</span>
            <input
              className="input input-bordered"
              value={tautulliUrl}
              onChange={(e) => setTautulliUrl(e.target.value)}
              placeholder="http://your-tautulli-host:8181"
            />
          </label>
          <label className="flex flex-col">
            <span className="text-sm opacity-70">Tautulli API Key</span>
            <input
              className="input input-bordered"
              value={tautulliApiKey}
              onChange={(e) => setTautulliApiKey(e.target.value)}
              placeholder="your-tautulli-api-key"
            />
          </label>
        </div>
        <div className="flex gap-2">
          <button
            className={`btn btn-primary ${saving ? "btn-disabled" : ""}`}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            className={`btn ${testing === "tautulli" ? "btn-disabled" : ""}`}
            onClick={() => handleTest("tautulli")}
            disabled={testing === "tautulli"}
          >
            {testing === "tautulli" ? "Testing Tautulli…" : "Test Tautulli"}
          </button>
        </div>
      </section>
    </div>
  );
}
