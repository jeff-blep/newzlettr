// src/components/ConnectionSettingsModal.tsx
import React, { useEffect, useState } from "react";
import { getConfig, postConfig, testPlex, testTautulli, testSmtp } from "../api";
// EDIT-PROBE: modal edit hook is working

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: () => void;
};

type Cfg = {
  plexUrl: string;
  plexToken: string;
  tautulliUrl: string;
  tautulliApiKey: string;

  fromAddress?: string;
  smtpEmailLogin?: string;
  smtpServer?: string;
  smtpPort?: number;
  smtpEncryption?: "TLS/SSL" | "STARTTLS" | "None";

  imageHost?: "embedded" | "cloudinary";
  cloudinary?: {
    cloudName?: string;
    apiKey?: string;
    apiSecret?: string; // masked from server as ****** when present
    folder?: string;
  };
};

export default function ConnectionSettingsModal({ isOpen, onClose, onSaved }: Props) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<null | "plex" | "tautulli" | "smtp">(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Plex / Tautulli
  const [plexUrl, setPlexUrl] = useState("");
  const [plexToken, setPlexToken] = useState("");
  const [tautulliUrl, setTautulliUrl] = useState("");
  const [tautulliApiKey, setTautulliApiKey] = useState("");

  // Image Hosting / Cloudinary
  const [imageHost, setImageHost] = useState<"embedded" | "cloudinary">("cloudinary");
  const [cloudName, setCloudName] = useState("");
  const [cloudApiKey, setCloudApiKey] = useState("");
  const [cloudApiSecret, setCloudApiSecret] = useState("");
  const [cloudFolder, setCloudFolder] = useState("newzlettr");
  const [hasCloudSecret, setHasCloudSecret] = useState(false);
  const [imageTestOk, setImageTestOk] = useState<boolean | null>(null);
  const [testingImage, setTestingImage] = useState(false);

  // SMTP
  const [smtpEmailLogin, setSmtpEmailLogin] = useState("");
  const [smtpEmailPassword, setSmtpEmailPassword] = useState("");
  const [smtpServer, setSmtpServer] = useState("");
  const [smtpPort, setSmtpPort] = useState(587);
  const [smtpEncryption, setSmtpEncryption] =
    useState<"TLS/SSL" | "STARTTLS" | "None">("TLS/SSL");
  const [fromAddress, setFromAddress] = useState("");
  const [sendTestTo, setSendTestTo] = useState("");

  // NEW: Track if a password already exists server-side (without revealing it)
  const [hasSavedPassword, setHasSavedPassword] = useState(false);
  // Track Cloudinary clear action
  const [clearingCloud, setClearingCloud] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    (async () => {
      setLoading(true);
      setError(null);
      setNotice(null);
      try {
        const raw = await getConfig();
        const cfg: Cfg = (raw && (raw as any).config) ? (raw as any).config : (raw as Cfg);
        console.debug("[ConnSettings] hydrate open: raw=", raw, "cfg=", cfg);
        setPlexUrl(cfg.plexUrl || "");
        setPlexToken(cfg.plexToken || "");
        setTautulliUrl(cfg.tautulliUrl || "");
        setTautulliApiKey(cfg.tautulliApiKey || "");

        setFromAddress(cfg.fromAddress || "");
        setSmtpEmailLogin(cfg.smtpEmailLogin || "");
        setSmtpServer(cfg.smtpServer || "");
        setSmtpPort(typeof cfg.smtpPort === "number" ? cfg.smtpPort : 587);
        setSmtpEncryption(cfg.smtpEncryption || "TLS/SSL");

        // Image hosting / Cloudinary
        setImageHost((cfg.imageHost as any) === "embedded" ? "embedded" : "cloudinary");
        const c = cfg.cloudinary || {} as any;
        const cn = c.cloudName ?? c.cloud_name ?? cfg.cloudName ?? "";
        const ck = c.apiKey ?? c.api_key ?? cfg.apiKey ?? "";
        const cs = c.apiSecret ?? c.api_secret ?? cfg.apiSecret ?? "";
        const cf = c.folder ?? c.path ?? cfg.folder ?? "newzlettr";
        console.debug("[ConnSettings] cloud parsed", { cn, ck, csMasked: !!cs, cf, imageHost: cfg.imageHost });
        setCloudName(cn);
        setCloudApiKey(ck);
        setCloudFolder(cf);
        // server masks apiSecret as ****** when present
        setHasCloudSecret(!!(typeof cs === "string" && cs.length > 0));
        setCloudApiSecret("");

        // Fallback: if server returned no cloud values (possible stale cache), refetch with no-cache
        if (
          (cfg.imageHost as any) === "cloudinary" &&
          (!cn || !ck) // missing name/key
        ) {
          try {
            const r = await fetch(`/api/config?ts=${Date.now()}`, { headers: { "Cache-Control": "no-cache" } });
            const freshRaw = await r.json();
            const fresh: Cfg = (freshRaw && (freshRaw as any).config) ? (freshRaw as any).config : (freshRaw as Cfg);
            const fc = (fresh.cloudinary || {}) as any;
            const fcn = fc.cloudName ?? fc.cloud_name ?? fresh.cloudName ?? "";
            const fck = fc.apiKey ?? fc.api_key ?? fresh.apiKey ?? "";
            const fcs = fc.apiSecret ?? fc.api_secret ?? fresh.apiSecret ?? "";
            const fcf = fc.folder ?? fc.path ?? fresh.folder ?? "newzlettr";
            if (fcn || fck) {
              setImageHost((fresh.imageHost as any) === "embedded" ? "embedded" : "cloudinary");
              setCloudName(fcn);
              setCloudApiKey(fck);
              setCloudFolder(fcf);
              setHasCloudSecret(!!(typeof fcs === "string" && fcs.length > 0));
              setCloudApiSecret("");
              console.debug("[ConnSettings] fallback hydrate applied", { fcn, fck, fcf });
            }
          } catch {
            // ignore fallback errors
          }
        }

        setImageTestOk(null);

        // If we have enough SMTP fields to have previously worked, assume a password exists.
        // We do NOT read the password from the server for security.
        setHasSavedPassword(!!(cfg.smtpEmailLogin || cfg.smtpServer));
        setSmtpEmailPassword(""); // keep input blank; we only send if user types a new one
      } catch (e: any) {
        setError(e?.message || String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [isOpen]);
  async function handleTestImageHost() {
    setTestingImage(true);
    setError(null);
    setNotice(null);
    try {
      // Build request body to match backend expectations
      const body =
        imageHost === "embedded"
          ? { imageHost: "embedded" }
          : {
              imageHost: "cloudinary",
              cloudinary: {
                cloudName,
                apiKey: cloudApiKey,
                // only send apiSecret if user typed one; avoids clearing stored secret
                ...(cloudApiSecret ? { apiSecret: cloudApiSecret } : {}),
                folder: cloudFolder || "newzlettr",
              },
            };

      const r = await fetch("/api/cloudinary/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await r.json().catch(() => ({} as any));
      if (!r.ok || !data || data.ok === false) {
        const msg = (data && (data.error || data.message)) || `HTTP ${r.status}`;
        setImageTestOk(false);
        throw new Error(msg || "Cloudinary test failed");
      }

      // Success: mark OK and refresh masked config from server so UI reflects persistence
      setImageTestOk(true);
      setNotice(
        imageHost === "embedded"
          ? "Embedded image mode OK."
          : "Cloudinary connection OK. Settings saved."
      );

      try {
        const raw2 = await getConfig();
        const fresh: Cfg = (raw2 && (raw2 as any).config) ? (raw2 as any).config : (raw2 as Cfg);
        console.debug("[ConnSettings] rehydrate after test", fresh);
        // rehydrate fields (server may mask apiSecret)
        setImageHost((fresh.imageHost as any) === "cloudinary" ? "cloudinary" : "embedded");
        const c = fresh.cloudinary || {} as any;
        const cn = c.cloudName ?? c.cloud_name ?? fresh.cloudName ?? "";
        const ck = c.apiKey ?? c.api_key ?? fresh.apiKey ?? "";
        const cs = c.apiSecret ?? c.api_secret ?? fresh.apiSecret ?? "";
        const cf = c.folder ?? c.path ?? fresh.folder ?? "newzlettr";
        console.debug("[ConnSettings] cloud parsed after test", { cn, ck, csMasked: !!cs, cf, imageHost: fresh.imageHost });
        setCloudName(cn);
        setCloudApiKey(ck);
        setCloudFolder(cf);
        setHasCloudSecret(!!(typeof cs === "string" && cs.length > 0));
        setCloudApiSecret("");
      } catch {
        /* non-fatal */
      }
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setTestingImage(false);
    }
  }

  async function handleClearCloudinary() {
    setClearingCloud(true);
    setError(null);
    setNotice(null);
    try {
      const folder = (cloudFolder && cloudFolder.trim()) ? cloudFolder.trim() : "newzlettr";
      const r = await fetch("/api/cloudinary/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folder }),
      });
      const data = await r.json().catch(() => ({} as any));
      if (!r.ok || !data || data.ok === false) {
        const msg = (data && (data.error || data.message)) || `HTTP ${r.status}`;
        throw new Error(msg || "Cloudinary clear failed");
      }
      setNotice(`Cleared Cloudinary folder “${folder}”.`);
      // reload server-side Cloudinary map (non-blocking)
      try { await fetch("/api/_reload_cloudinary_map", { method: "POST" }); } catch {}
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setClearingCloud(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const payload: any = {
        plexUrl,
        plexToken,
        tautulliUrl,
        tautulliApiKey,
        fromAddress,
        smtpEmailLogin,
        // Only send smtpEmailPassword if user typed something; otherwise server keeps existing pass
        smtpEmailPassword: smtpEmailPassword.length > 0 ? smtpEmailPassword : undefined,
        smtpServer,
        smtpPort,
        smtpEncryption,
        imageHost,
        cloudinary: {
          cloudName,
          apiKey: cloudApiKey,
          folder: cloudFolder || "newzlettr",
        },
      };
      if (cloudApiSecret.length > 0) {
        payload.cloudinary.apiSecret = cloudApiSecret;
      }

      await postConfig(payload);

      // Clear local secrets entered by the user
      if (smtpEmailPassword.length > 0) setSmtpEmailPassword("");
      if (cloudApiSecret.length > 0) setCloudApiSecret("");

      // Rehydrate from server so the modal reflects what actually persisted
      try {
        const raw3 = await getConfig();
        const cfg: Cfg = (raw3 && (raw3 as any).config) ? (raw3 as any).config : (raw3 as Cfg);
        console.debug("[ConnSettings] rehydrate after save", cfg);
        setImageHost((cfg.imageHost as any) === "cloudinary" ? "cloudinary" : "embedded");
        setPlexUrl(cfg.plexUrl || "");
        setPlexToken(cfg.plexToken || "");
        setTautulliUrl(cfg.tautulliUrl || "");
        setTautulliApiKey(cfg.tautulliApiKey || "");
        setFromAddress(cfg.fromAddress || "");
        setSmtpEmailLogin(cfg.smtpEmailLogin || "");
        setSmtpServer(cfg.smtpServer || "");
        setSmtpPort(typeof cfg.smtpPort === "number" ? cfg.smtpPort : 587);
        setSmtpEncryption(cfg.smtpEncryption || "TLS/SSL");

        const c = cfg.cloudinary || {} as any;
        const cn = c.cloudName ?? c.cloud_name ?? cfg.cloudName ?? "";
        const ck = c.apiKey ?? c.api_key ?? cfg.apiKey ?? "";
        const cs = c.apiSecret ?? c.api_secret ?? cfg.apiSecret ?? "";
        const cf = c.folder ?? c.path ?? cfg.folder ?? "newzlettr";
        console.debug("[ConnSettings] cloud parsed after save", { cn, ck, csMasked: !!cs, cf, imageHost: cfg.imageHost });
        setCloudName(cn);
        setCloudApiKey(ck);
        setCloudFolder(cf);
        setHasCloudSecret(!!(typeof cs === "string" && cs.length > 0));

        // Consider a saved SMTP pass present if we have prior login/server
        setHasSavedPassword(!!(cfg.smtpEmailLogin || cfg.smtpServer));
      } catch {}

      setNotice("Settings saved.");
      onSaved?.();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleTest(kind: "plex" | "tautulli" | "smtp") {
    setTesting(kind);
    setError(null);
    setNotice(null);
    try {
      if (kind === "plex") {
        const r = await testPlex({ plexUrl, plexToken });
        if (r?.ok) setNotice("Plex connection OK.");
        else throw new Error(r?.error || "Plex test failed");
      } else if (kind === "tautulli") {
        const r = await testTautulli({ tautulliUrl, tautulliApiKey });
        if (r?.ok) setNotice("Tautulli connection OK.");
        else throw new Error(r?.error || "Tautulli test failed");
      } else {
        const r = await testSmtp({
          smtpEmailLogin,
          // Only send a password for testing if user typed something; otherwise the server uses stored pass.
          smtpEmailPassword: smtpEmailPassword.length > 0 ? smtpEmailPassword : undefined,
          smtpServer,
          smtpPort,
          smtpEncryption,
          fromAddress,
          to: sendTestTo,
        } as any);
        if (r?.ok) setNotice("SMTP connection OK.");
        else throw new Error(r?.error || "SMTP test failed");
      }
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setTesting(null);
    }
  }

  async function handleSendTestEmail() {
    setTesting("smtp");
    setError(null);
    setNotice(null);
    try {
      const r = await testSmtp({
        smtpEmailLogin,
        smtpEmailPassword: smtpEmailPassword.length > 0 ? smtpEmailPassword : undefined,
        smtpServer,
        smtpPort,
        smtpEncryption,
        fromAddress,
        to: sendTestTo,
      } as any);
      if (r?.ok) setNotice("Sent test email (if server supports sending).");
      else throw new Error(r?.error || "Test email failed");
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setTesting(null);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-base-300/60 backdrop-blur-sm">
      <div className="w-full max-w-3xl max-h-[90vh] rounded-xl shadow-xl bg-base-100 border border-base-300 flex flex-col">
        {/* Header */}
        <div className="px-4 py-3 border-b border-base-300 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Connection Settings</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-8 overflow-y-auto">
          {loading && <div>Loading…</div>}
          {notice && (
            <div className="p-2 rounded bg-green-500/15 text-green-700">{notice}</div>
          )}
          {error && (
            <div className="p-2 rounded bg-red-500/15 text-red-700">{error}</div>
          )}

          {/* SMTP (compact 2-col layout) */}
          <section className="space-y-3">
            <h3 className="font-semibold">SMTP</h3>

            {/* Row 1: Login | Password */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <input
                className="input input-bordered w-full"
                placeholder="Login (name@domain.com)"
                value={smtpEmailLogin}
                onChange={(e) => setSmtpEmailLogin(e.target.value)}
              />
              <input
                type="password"
                className="input input-bordered w-full"
                placeholder={hasSavedPassword ? "Password (saved)" : "Password"}
                value={smtpEmailPassword}
                onChange={(e) => setSmtpEmailPassword(e.target.value)}
              />
            </div>

            {/* Row 2: SMTP Server | Send As */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <input
                className="input input-bordered w-full"
                placeholder="SMTP Server (e.g. smtp.mail.com)"
                value={smtpServer}
                onChange={(e) => setSmtpServer(e.target.value)}
              />
              <input
                className="input input-bordered w-full"
                placeholder="Send As (From Address)"
                value={fromAddress}
                onChange={(e) => setFromAddress(e.target.value)}
              />
            </div>

            {/* Row 3: TLS/SSL | Port */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <select
                className="select select-bordered w-full"
                value={smtpEncryption}
                onChange={(e) => setSmtpEncryption(e.target.value as any)}
              >
                <option value="TLS/SSL">TLS/SSL</option>
                <option value="STARTTLS">STARTTLS</option>
                <option value="None">None</option>
              </select>
              <input
                type="number"
                className="input input-bordered w-full"
                placeholder="587"
                value={smtpPort}
                onChange={(e) => setSmtpPort(Number(e.target.value))}
              />
            </div>

            {/* Row 4: Buttons under TLS/SSL | Send Test To */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <div>
                <button
                  className={`btn ${testing === "smtp" ? "btn-disabled" : "btn-primary"}`}
                  onClick={() => handleTest("smtp")}
                  disabled={testing === "smtp" || !sendTestTo}
                >
                  {testing === "smtp" ? "Testing…" : "Test SMTP"}
                </button>
              </div>

              <input
                className="input input-bordered w-full"
                placeholder="Send Test To (email)"
                value={sendTestTo}
                onChange={(e) => setSendTestTo(e.target.value)}
              />
            </div>
          </section>

          {/* Image Hosting */}
          <section className="space-y-3">
            <h3 className="font-semibold">Image Hosting</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <div className="flex items-center gap-2">
                <label className="label w-28">Host</label>
                <select
                  className="select select-bordered w-full"
                  value={imageHost}
                  onChange={(e) => setImageHost(e.target.value as any)}
                >
                  <option value="embedded">Embed images in email</option>
                  <option value="cloudinary">Cloudinary (hosted)</option>
                </select>
              </div>
            </div>

            {imageHost === "cloudinary" && (
              <div className="space-y-2">
                <div className="alert alert-info text-sm">
                  <div>
                    Don’t have a Cloudinary account? <a className="link" href="https://cloudinary.com/users/register_free" target="_blank" rel="noreferrer">Create one here</a>.
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <input
                    className="input input-bordered w-full"
                    placeholder="Cloud Name"
                    value={cloudName}
                    onChange={(e) => setCloudName(e.target.value)}
                  />
                  <input
                    className="input input-bordered w-full"
                    placeholder="API Key"
                    value={cloudApiKey}
                    onChange={(e) => setCloudApiKey(e.target.value)}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <div className="flex flex-col">
                    <input
                      type="password"
                      className="input input-bordered w-full"
                      placeholder={hasCloudSecret ? "API Secret (saved)" : "API Secret"}
                      value={cloudApiSecret}
                      onChange={(e) => setCloudApiSecret(e.target.value)}
                    />
                    <div className="text-xs opacity-70 mt-1">
                      Secret is stored on the server and returned masked. Enter a new value to replace it.
                    </div>
                  </div>
                  <input
                    className="input input-bordered w-full"
                    placeholder="Folder (optional, default newzlettr)"
                    value={cloudFolder}
                    onChange={(e) => setCloudFolder(e.target.value)}
                  />
                </div>
              </div>
            )}

            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
              <div className="flex flex-col md:flex-row gap-2">
                <button
                  className="btn btn-primary"
                  onClick={handleSave}
                  disabled={
                    saving ||
                    (imageHost === "cloudinary" &&
                      (!cloudName.trim() || !cloudApiKey.trim() || (!hasCloudSecret && !cloudApiSecret.trim())))
                  }
                >
                  {saving ? "Saving…" : "Save"}
                </button>
                <button
                  className="btn"
                  onClick={handleTestImageHost}
                  disabled={
                    testingImage ||
                    (imageHost === "cloudinary" &&
                      (!cloudName.trim() || !cloudApiKey.trim() || (!hasCloudSecret && !cloudApiSecret.trim())))
                  }
                >
                  {testingImage ? "Testing…" : "Test Cloudinary"}
                </button>
              </div>
              <div className="flex">
                <button
                  className="btn btn-outline"
                  onClick={handleClearCloudinary}
                  disabled={
                    clearingCloud ||
                    imageHost !== "cloudinary" ||
                    !cloudName.trim() ||
                    !cloudApiKey.trim() ||
                    (!hasCloudSecret && !cloudApiSecret.trim())
                  }
                  title="Delete all resources under the configured Cloudinary folder and purge cache"
                >
                  {clearingCloud ? "Clearing…" : "Clear Cloudinary Cache"}
                </button>
              </div>
            </div>
          </section>

          {/* Plex */}
          <section className="space-y-3">
            <h3 className="font-semibold">Plex</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <input
                className="input input-bordered w-full"
                placeholder="Plex URL (http://your-plex-host:32400)"
                value={plexUrl}
                onChange={(e) => setPlexUrl(e.target.value)}
              />
              <input
                className="input input-bordered w-full"
                placeholder="Plex Token"
                value={plexToken}
                onChange={(e) => setPlexToken(e.target.value)}
              />
            </div>
            <div className="flex flex-col md:flex-row gap-2">
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </button>
              <button
                className={`btn ${testing === "plex" ? "btn-disabled" : ""}`}
                onClick={() => handleTest("plex")}
                disabled={testing === "plex"}
              >
                {testing === "plex" ? "Testing…" : "Test Plex"}
              </button>
            </div>
          </section>

          {/* Tautulli */}
          <section className="space-y-3">
            <h3 className="font-semibold">Tautulli</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <input
                className="input input-bordered w-full"
                placeholder="Tautulli URL (http://your-tautulli-host:8181)"
                value={tautulliUrl}
                onChange={(e) => setTautulliUrl(e.target.value)}
              />
              <input
                className="input input-bordered w-full"
                placeholder="Tautulli API Key"
                value={tautulliApiKey}
                onChange={(e) => setTautulliApiKey(e.target.value)}
              />
            </div>
            <div className="flex flex-col md:flex-row gap-2">
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </button>
              <button
                className={`btn ${testing === "tautulli" ? "btn-disabled" : ""}`}
                onClick={() => handleTest("tautulli")}
                disabled={testing === "tautulli"}
              >
                {testing === "tautulli" ? "Testing…" : "Test Tautulli"}
              </button>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-base-300 flex justify-end gap-2">
          <button className="btn btn-ghost" onClick={onClose}>
            Close
          </button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save All"}
          </button>
        </div>
      </div>
    </div>
  );
}
