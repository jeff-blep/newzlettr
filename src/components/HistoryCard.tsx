// src/components/HistoryCard.tsx
import React from "react";
import { getConfig, postConfig } from "../api";

type Props = {
  onDaysChange?: (days: number) => void;
};

export default function HistoryCard({ onDaysChange }: Props) {
  const [days, setDays] = React.useState<number>(7);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  // NEW: broadcast helper so other components can react (no prop wiring needed)
  const broadcastDays = React.useCallback((d: number) => {
    try {
      window.dispatchEvent(new CustomEvent("lookbackDays:update", { detail: d }));
    } catch {}
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const cfg = await getConfig();
        const d = typeof (cfg as any)?.lookbackDays === "number" ? (cfg as any).lookbackDays : 7;
        if (!cancelled) {
          setDays(d);
          onDaysChange?.(d);      // existing parent callback (if provided)
          broadcastDays(d);       // NEW: tell the rest of the app
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onDaysChange]);

  async function save() {
    try {
      setSaving(true);
      setError(null);
      setNotice(null);
      await postConfig({ lookbackDays: days });
      setNotice("Saved history window.");
      onDaysChange?.(days);   // existing callback
      broadcastDays(days);    // NEW: broadcast change
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <div />
        {loading ? <span className="loading loading-spinner loading-sm" /> : null}
      </div>

      {notice && (
        <div className="mt-2 p-2 rounded bg-green-500/15 text-green-700 text-sm">{notice}</div>
      )}
      {error && (
        <div className="mt-2 p-2 rounded bg-red-500/15 text-red-700 text-sm">{error}</div>
      )}

      <div className="mt-3 join">
        <input
          type="number"
          min={1}
          max={90}
          className="input input-bordered w-24 join-item"
          value={days}
          onChange={(e) => setDays(Math.max(1, Math.min(90, Number(e.target.value) || 1)))}
        />
        <button className="btn btn-primary join-item" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>

    </>
  );
}
