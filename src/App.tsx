// src/App.tsx
import React from "react";
import ConnectionSettingsModal from "./components/ConnectionSettingsModal";
import PlexMediaServerDataCard from "./components/PlexMediaServerDataCard";
import OwnerRecommendationCard from "./components/OwnerRecommendationCard";
// NOTE: removed ScheduleCard import
import HistoryCard from "./components/HistoryCard";
import RecipientsCard from "./components/RecipientsCard";
import EmailTemplateCard from "./components/EmailTemplateCard";
import NewsletterCard from "./components/NewsletterCard";
import TopBar from "./components/TopBar";
import { getStatus } from "./api";

type ConnStatus = {
  emailOk: boolean;
  plexOk: boolean;
  tautulliOk: boolean;
  imageHost?: "embedded" | "cloudinary";
  imageOk?: boolean;
};

export default function App() {
  const [showConn, setShowConn] = React.useState(false);


  // Connection status
  const [connStatus, setConnStatus] = React.useState<ConnStatus>({
    emailOk: false,
    plexOk: false,
    tautulliOk: false,
  });
  const [statusLoading, setStatusLoading] = React.useState(false);
  const [statusError, setStatusError] = React.useState<string | null>(null);

  const refreshStatus = React.useCallback(async () => {
    try {
      setStatusLoading(true);
      setStatusError(null);
      const s = await getStatus();
      setConnStatus({
        emailOk: !!s?.emailOk,
        plexOk: !!s?.plexOk,
        tautulliOk: !!s?.tautulliOk,
        imageHost: (s?.imageHost === "cloudinary" ? "cloudinary" : "embedded"),
        // If embedded, always OK; if cloudinary, depend on server's last test flag (cloudinaryOk)
        imageOk: s?.imageHost === "embedded" ? true : !!(s?.cloudinaryOk ?? s?.imageOk),
      });
    } catch (e: any) {
      setStatusError(e?.message || String(e));
    } finally {
      setStatusLoading(false);
    }
  }, []);

  React.useEffect(() => { refreshStatus(); }, [refreshStatus]);
  React.useEffect(() => {
    const onVis = () => { if (document.visibilityState === "visible") refreshStatus(); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [refreshStatus]);

  const handleConnClose = () => { setShowConn(false); setTimeout(() => refreshStatus(), 150); };
  const handleConnSaved = () => { setShowConn(false); refreshStatus(); };

  return (
    <div className="min-h-screen bg-base-100 text-base-content">
      <TopBar status={connStatus} onOpenSettings={() => setShowConn(true)} />
      {/* Offset */}
      <main className="max-w-6xl mx-auto p-5 pt-14 mt-4 space-y-6">

        {/* Plex Media Server Data */}
        <section className="card bg-base-200 shadow-sm">
          <div className="card-body">
            <h2 className="text-xl font-semibold">Plex Media Server Data</h2>
            {/* History lookback controls moved here under the title */}
            <div className="mt-2">
              <div className="text-xs md:text-sm opacity-70 mb-2">Window lookback</div>
              <div className="max-w-sm">
                <HistoryCard />
              </div>
            </div>
            <div className="mt-4">
              <PlexMediaServerDataCard />
            </div>
          </div>
        </section>

        {/* Host Recommendation */}
        <section className="card bg-base-200 shadow-sm">
          <div className="card-body">
            <h2 className="text-xl font-semibold">Plex Media Server Host’s Recommendation</h2>
            <div className="mt-3">
              <OwnerRecommendationCard />
            </div>
          </div>
        </section>

        {/* Email Template (editor) */}
        <section className="card bg-base-200 shadow-sm">
          <div className="card-body">
            <h2 className="text-xl font-semibold">Email Template</h2>
            <div className="mt-3">
              <EmailTemplateCard />
            </div>
          </div>
        </section>

        {/* Newsletters */}
        <section className="card bg-base-200 shadow-sm">
          <div className="card-body">
            <NewsletterCard />
          </div>
        </section>

        {/* Recipients */}
        <section className="card bg-base-200 shadow-sm">
          <div className="card-body">
            <h2 className="text-xl font-semibold">Recipients</h2>
            <div className="mt-3">
              <RecipientsCard />
            </div>
          </div>
        </section>
      </main>

      <ConnectionSettingsModal
        isOpen={showConn}
        onClose={handleConnClose}
        onSaved={handleConnSaved}
      />
    </div>
  );
}
