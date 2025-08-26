// src/components/OwnerRecommendationCard.tsx
import React from "react";

type Props = {
  /** Optional: pass current config if you already have it */
  config?: any;
  /** Optional: override how the card persists (defaults to POST /api/config) */
  save?: (partial: any) => Promise<void> | void;
};

type SearchResult = {
  ratingKey: string | number;
  title?: string;
  year?: number;
  type?: string;
  showTitle?: string;
  episodeTitle?: string;
  seasonIndex?: number;
  episodeIndex?: number;
  thumbPath?: string;
  grandparentThumb?: string;
  parentThumb?: string;
  art?: string;
  deepLink?: string;
  href?: string;
};

// ------------------- helpers -------------------
function nnum(n: any): number | undefined {
  const x = Number(n);
  return Number.isFinite(x) ? x : undefined;
}

function pickThumbPath(it: any): string | undefined {
  return (
    it?.thumbPath ||
    it?.thumb ||
    it?.grandparentThumb ||
    it?.parentThumb ||
    it?.grandparent_thumb ||
    it?.parent_thumb ||
    it?.art ||
    it?.poster
  );
}

function unwrapPlexNode(raw: any): any {
  if (!raw) return raw;
  const mc = raw.MediaContainer ?? raw.mediacontainer;
  if (mc?.Metadata && Array.isArray(mc.Metadata) && mc.Metadata.length) return mc.Metadata[0];
  if (raw?.Metadata && Array.isArray(raw.Metadata) && raw.Metadata.length) return raw.Metadata[0];
  return raw;
}

function normalizeItem(input: any): SearchResult {
  if (!input) return { ratingKey: "" };
  const raw = unwrapPlexNode(input);

  const ratingKey =
    raw.ratingKey ?? raw.rating_key ?? raw.id ?? raw.key ?? raw.guid ?? "";

  const title =
    raw.title ?? raw.name ?? raw.grandparent_title ?? raw.parent_title ?? "";

  const year =
    nnum(raw.year) ?? nnum(raw.originallyAvailableAt?.slice?.(0, 4)) ?? undefined;

  let type: string | undefined = raw.type ?? raw.librarySectionType ?? raw.media_type;
  if (!type && (raw.grandparent_title || raw.grandparentTitle)) type = "episode";

  const showTitle =
    raw.grandparent_title ??
    raw.grandparentTitle ??
    raw.seriesTitle ??
    raw.showTitle ??
    raw.parent_title ??
    raw.parentTitle ??
    raw.parent_name ??
    undefined;

  const episodeTitle =
    String(type || "").toLowerCase() === "episode"
      ? (raw.title ?? raw.episodeTitle)
      : raw.episodeTitle ?? undefined;

  const seasonIndex =
    nnum(raw.parentIndex) ??
    nnum(raw.parent_index) ??
    nnum(raw.season) ??
    nnum(raw.seasonIndex) ??
    undefined;

  const episodeIndex =
    nnum(raw.index) ??
    nnum(raw.episodeIndex) ??
    nnum(raw.episode) ??
    undefined;

  const thumbPath = pickThumbPath(raw);
  const deepLink = raw.deepLink ?? raw.href ?? raw.url ?? undefined;
  const href = raw.href ?? raw.deepLink ?? raw.url ?? undefined;

  return {
    ratingKey,
    title,
    year,
    type,
    showTitle,
    episodeTitle,
    seasonIndex,
    episodeIndex,
    thumbPath,
    grandparentThumb: raw.grandparentThumb ?? raw.grandparent_thumb,
    parentThumb: raw.parentThumb ?? raw.parent_thumb,
    art: raw.art,
    deepLink,
    href,
  };
}

async function enrichEpisodes(base: SearchResult[]): Promise<SearchResult[]> {
  // Fill in missing bits for episodes by fetching the exact item
  const candidates = base
    .map((r, idx) => ({ r, idx }))
    .filter(({ r }) => {
      const t = String(r.type || "").toLowerCase();
      const looksEpisode = t === "episode" || (!!r.ratingKey && !t);
      const missing = !r.showTitle || r.seasonIndex == null || r.episodeIndex == null;
      return looksEpisode && missing;
    })
    .slice(0, 12);

  if (!candidates.length) return base;

  const updates = await Promise.all(
    candidates.map(async ({ r, idx }) => {
      try {
        const resp = await fetch(`/api/plex/item/${encodeURIComponent(String(r.ratingKey))}`);
        if (!resp.ok) return null;
        const j = await resp.json();
        const full = j?.item ? normalizeItem(j.item) : normalizeItem(j);
        return full ? { idx, full } : null;
      } catch {
        return null;
      }
    })
  );

  const out = base.slice();
  for (const u of updates) if (u && out[u.idx]) out[u.idx] = { ...out[u.idx], ...u.full };
  return out;
}

// Cache Plex machineIdentifier so we can build app.plex.tv deep links
let CACHED_MACHINE_ID: string | null | undefined = undefined;

// ------------------- component -------------------
export default function OwnerRecommendationCard({ config, save }: Props) {
  const [initialLoaded, setInitialLoaded] = React.useState(false);

  // Self-load config if not supplied
  const [cfg, setCfg] = React.useState<any>(config ?? null);

  const doSave = React.useCallback(
    async (partial: any) => {
      if (typeof save === "function") return await save(partial);
      const r = await fetch(`/api/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(partial),
      });
      if (!r.ok) {
        const text = await r.text().catch(() => "");
        throw new Error(text || `HTTP ${r.status}`);
      }
    },
    [save]
  );

  React.useEffect(() => {
    if (config) {
      setCfg(config);
      setInitialLoaded(true);
      return;
    }
    (async () => {
      try {
        const r = await fetch(`/api/config`);
        const j = r.ok ? await r.json() : null;
        setCfg(j || {});
      } finally {
        setInitialLoaded(true);
      }
    })();
  }, [config]);

  const [query, setQuery] = React.useState("");
  const [searching, setSearching] = React.useState(false);
  const [results, setResults] = React.useState<SearchResult[]>([]);

  const [note, setNote] = React.useState<string>(cfg?.ownerRecommendation?.note || "");
  const [selectedId, setSelectedId] = React.useState<string | number | undefined>(
    cfg?.ownerRecommendation?.plexItemId || undefined
  );
  const [selectedItem, setSelectedItem] = React.useState<SearchResult | null>(null);

  const [machineId, setMachineId] = React.useState<string | null>(CACHED_MACHINE_ID ?? null);

  const [saving, setSaving] = React.useState(false);
  const [savedAt, setSavedAt] = React.useState<number | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const inputRef = React.useRef<HTMLInputElement | null>(null);

  // Keep local state in sync when cfg changes
  React.useEffect(() => {
    setNote(cfg?.ownerRecommendation?.note || "");
    setSelectedId(cfg?.ownerRecommendation?.plexItemId || undefined);
  }, [cfg?.ownerRecommendation?.note, cfg?.ownerRecommendation?.plexItemId]);

  // Plex server id
  React.useEffect(() => {
    if (CACHED_MACHINE_ID !== undefined && CACHED_MACHINE_ID !== null) {
      setMachineId(CACHED_MACHINE_ID);
      return;
    }
    (async () => {
      try {
        const r = await fetch(`/api/plex/server-id`);
        if (r.ok) {
          const j = await r.json();
          const id = j?.machineIdentifier || null;
          CACHED_MACHINE_ID = id;
          setMachineId(id);
        } else {
          CACHED_MACHINE_ID = null;
          setMachineId(null);
        }
      } catch {
        CACHED_MACHINE_ID = null;
        setMachineId(null);
      }
    })();
  }, []);

  // Load selected item details for preview
  React.useEffect(() => {
    if (!selectedId) {
      setSelectedItem(null);
      return;
    }
    (async () => {
      try {
        const r = await fetch(`/api/plex/item/${encodeURIComponent(String(selectedId))}`);
        const j = r.ok ? await r.json() : null;
        setSelectedItem(j ? normalizeItem(j?.item ?? j) : null);
      } catch {
        setSelectedItem(null);
      }
    })();
  }, [selectedId]);

  // Search (debounced)
  React.useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await fetch(`/api/plex/search?q=${encodeURIComponent(q)}`);
        const j = r.ok ? await r.json() : null;
        const arr = Array.isArray(j?.results) ? j.results.map(normalizeItem) : [];
        setResults(await enrichEpisodes(arr));
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  // Build poster URL
  function posterUrl(it: SearchResult | null): string | undefined {
    if (!it) return undefined;
    const p = pickThumbPath(it);
    if (!p) return undefined;
    if (p.startsWith("/")) return `/api/plex/image?path=${encodeURIComponent(p)}`;
    return `/api/plex/image?u=${encodeURIComponent(p)}`;
  }

  // Build Plex Web deeplink (fallback to provided href)
  function plexHref(it: SearchResult | null): string | undefined {
    const id = machineId;
    const rk = it?.ratingKey;
    if (id && rk != null && rk !== "") {
      const key = `/library/metadata/${encodeURIComponent(String(rk))}`;
      return `https://app.plex.tv/desktop/#!/server/${id}/details?key=${encodeURIComponent(key)}`;
    }
    return it?.deepLink || it?.href;
  }

  function chooseItem(it: SearchResult) {
    const immediate = normalizeItem(it);
    setSelectedItem(immediate);
    setSelectedId(immediate.ratingKey);
    setResults([]);
    setQuery("");
    inputRef.current?.blur();
  }

  async function handleSave() {
    try {
      setSaving(true);
      setError(null);
      await doSave({ ownerRecommendation: { plexItemId: selectedId || "", note } });
      setSavedAt(Date.now());
      // refresh cfg so other parts of the app (passing config) stay consistent
      if (!config) {
        try {
          const r = await fetch(`/api/config`);
          const j = r.ok ? await r.json() : null;
          if (j) setCfg(j);
        } catch { /* ignore */ }
      }
    } catch (e: any) {
      setError(e?.message || "Failed to save Host’s Recommendation.");
    } finally {
      setSaving(false);
    }
  }

  async function handleClear() {
    try {
      setSaving(true);
      setError(null);
      setSelectedId(undefined);
      setSelectedItem(null);
      setNote("");
      await doSave({ ownerRecommendation: { plexItemId: "", note: "" } });
      setSavedAt(Date.now());
      if (!config) {
        try {
          const r = await fetch(`/api/config`);
          const j = r.ok ? await r.json() : null;
          if (j) setCfg(j);
        } catch { /* ignore */ }
      }
    } catch (e: any) {
      setError(e?.message || "Failed to clear Host’s Recommendation.");
    } finally {
      setSaving(false);
    }
  }

  const poster = posterUrl(selectedItem);
  const titleText =
    selectedItem?.title
      ? `${selectedItem.title}${selectedItem.year ? ` (${selectedItem.year})` : ""}`
      : "";

  return (
    <div className="card bg-base-100 shadow">
      <div className="card-body space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="card-title">Host’s Recommendation</h2>
          {!initialLoaded && <span className="loading loading-spinner loading-sm" />}
        </div>

        {error && (
          <div className="p-2 rounded bg-red-500/15 text-red-700 text-sm">{error}</div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-[120px_1fr] gap-4">
          {/* Poster + Title */}
          <div className="flex flex-col items-center">
            {poster ? (
              <img src={poster} alt="" className="w-24 h-36 object-cover rounded border border-base-300" />
            ) : (
              <div className="w-24 h-36 rounded bg-base-200 border border-base-300" />
            )}
            <div className="mt-2 text-center text-sm min-h-[1.25rem]">
              {titleText ? (
                plexHref(selectedItem) ? (
                  <a
                    href={plexHref(selectedItem)}
                    target="_blank"
                    rel="noreferrer"
                    className="link"
                    title={titleText}
                  >
                    {titleText}
                  </a>
                ) : (
                  <span title={titleText}>{titleText}</span>
                )
              ) : (
                <span className="opacity-60">No selection</span>
              )}
            </div>
          </div>

          {/* Search + Note */}
          <div className="space-y-3">
            <label className="form-control">
              <div className="label">
                <span className="label-text">Search title (movies &amp; shows)</span>
              </div>
              <input
                ref={inputRef}
                type="text"
                className="input input-bordered"
                placeholder="Start typing to search…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>

            {searching ? (
              <div className="text-sm opacity-70">Searching…</div>
            ) : results.length > 0 ? (
              <div className="border border-base-300 rounded">
                <ul className="menu bg-base-100 max-h-56 overflow-auto">
                  {results.map((r, i) => {
                    let label: string;
                    const t = String(r.type || "").toLowerCase();
                    if (t === "episode") {
                      const show = r.showTitle || undefined;
                      const epName = r.episodeTitle || r.title || "(untitled episode)";
                      const s = r.seasonIndex ? `Season ${r.seasonIndex}` : null;
                      const e = r.episodeIndex ? `Episode ${r.episodeIndex}` : null;
                      const se = s && e ? `${s}, ${e}` : s || e || "";
                      label = show
                        ? `${show} - ${epName}${se ? ` (${se})` : ""} • EPISODE`
                        : `${epName}${se ? ` (${se})` : ""} • EPISODE`;
                    } else {
                      label = `${r.title || "(untitled)"}${r.year ? ` (${r.year})` : ""}${
                        r.type ? ` • ${String(r.type).toUpperCase()}` : ""
                      }`;
                    }
                    return (
                      <li key={`${r.ratingKey}-${i}`}>
                        <button className="justify-start" onClick={() => chooseItem(r)} title={String(r.ratingKey)}>
                          <div className="flex items-center gap-2">
                            <span className="truncate">{label}</span>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}

            <label className="form-control">
              <div className="label">
                <span className="label-text">Host’s Comments (optional)</span>
              </div>
              <textarea
                className="textarea textarea-bordered h-32"
                placeholder="Why you’re recommending this"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>

            {/* Save / Clear */}
            <div className="flex items-center justify-end gap-2">
              <button
                className={`btn btn-ghost btn-sm ${saving ? "loading" : ""}`}
                onClick={handleClear}
                disabled={saving}
                title="Clear selection and note"
              >
                {saving ? "Clearing…" : "Clear"}
              </button>
              <button
                className={`btn btn-primary btn-sm ${saving ? "loading" : ""}`}
                onClick={handleSave}
                disabled={saving}
                title="Persist this recommendation"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
            {savedAt ? (
              <div className="text-xs opacity-70 text-right">Saved {new Date(savedAt).toLocaleString()}</div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
