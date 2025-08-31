// src/components/NewsletterCard.tsx
import React, { useEffect, useMemo, useState } from "react";

import { sendNewsletterNow } from "../api";
import { API_BASE } from "../api";


/** ----------------------------- Types & helpers ----------------------------- */
type Template = { id: string; name: string; html: string; updatedAt?: number };
type Recipient = { fullName: string; email: string };

type Schedule = {
  mode?: "standard" | "custom";
  cron?: string;
  frequency?: "hour" | "day" | "week" | "month" | "year";
  dayOfWeek?: string; // "monday"..."sunday"
  dayOfMonth?: number; // 1..31
  month?: number; // 0..11
  hour?: number; // 0..23
  minute?: number; // 0..59
};

type Newsletter = {
  id: string;
  name: string;
  subject?: string; // email subject line for this newsletter
  description?: string;
  schedule?: Schedule | null;
  historyDays?: number; // lookback window for this newsletter (default from /api/config)
  templateId?: string; // points to /api/templates item
  templateName?: string; // denormalized for display convenience
  recipients?: string[]; // selected recipient emails for this newsletter
  sendAsBcc?: boolean;
  enabled?: boolean;
  updatedAt?: number;
  createdAt?: number;
  lastSentAt?: number;
};

const STORAGE_KEY = "newsletters.v1";

/** ID generator for local usage */
function newId() {
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

async function safeJson<T>(p: Promise<Response>): Promise<T> {
  const r = await p;
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return (await r.json()) as T;
}

/** Try server; fallback to localStorage */
const store = {
  async list(): Promise<Newsletter[]> {
    try {
      return await safeJson<Newsletter[]>(fetch(`${API_BASE}/api/newsletters`));
    } catch {
      const raw = localStorage.getItem(STORAGE_KEY);
      const arr = raw ? (JSON.parse(raw) as Newsletter[]) : [];
      return Array.isArray(arr) ? arr : [];
    }
  },
  async saveAll(list: Newsletter[]): Promise<void> {
    try {
      await safeJson<{ ok: boolean }>(
        fetch(`${API_BASE}/api/newsletters`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(list),
        })
      );
    } catch {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    }
  },
  async remove(id: string): Promise<void> {
    try {
      await safeJson<{ ok: boolean }>(fetch(`${API_BASE}/api/newsletters/${encodeURIComponent(id)}`, { method: "DELETE" }));
    } catch {
      // local fallback
      const raw = localStorage.getItem(STORAGE_KEY);
      const arr = raw ? (JSON.parse(raw) as Newsletter[]) : [];
      const next = arr.filter((n) => n.id !== id);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    }
  },
};

/** fetch templates from server; no local fallback needed (UI handles empty) */
async function fetchTemplates(): Promise<Template[]> {
  try {
    const list = await safeJson<any>(fetch(`${API_BASE}/api/templates`));
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

async function fetchRecipients(): Promise<Recipient[]> {
  try {
    const list = await safeJson<any>(fetch(`${API_BASE}/api/recipients`));
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

async function fetchConfig(): Promise<any> {
  try {
    return await safeJson<any>(fetch(`${API_BASE}/api/config`));
  } catch {
    return { lookbackDays: 7 };
  }
}

function fmtDate(ms?: number) {
  return ms ? new Date(ms).toLocaleString() : "";
}

/** ----- Pretty schedule (consistent with ScheduleCard.describeSchedule) ----- */
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
function describeSchedule(s?: Schedule | null): string {
  const x = s || {};
  if (x?.mode === "custom" && x?.cron) {
    return `Custom CRON: ${x.cron}`;
  }
  if (x?.frequency) {
    const freq = String(x.frequency).toLowerCase();
    const hh = typeof x.hour === "number" ? x.hour : 9;
    const mm = typeof x.minute === "number" ? x.minute : 0;
    const ampm = hh >= 12 ? "PM" : "AM";
    const hour12 = ((hh + 11) % 12) + 1;
    const t = `${hour12}:${String(mm).padStart(2, "0")} ${ampm}`;
    if (freq === "week") {
      const dow = (x.dayOfWeek || "monday").toString();
      const label = dow[0].toUpperCase() + dow.slice(1);
      return `${label}s at ${t}`;
    }
    if (freq === "hour") return `Every hour at minute ${mm}`;
    if (freq === "month") return `Day ${x.dayOfMonth || 1} each month at ${t}`;
    if (freq === "year") return `Every ${MONTHS[x.month || 0]} 1 at ${t}`;
    return `Daily at ${t}`;
  }
  return "—";
}

/** ---------------- scheduler control helpers (inline UI) ------------------- */
const DAYS = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];
const HOURS12 = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);
const DAYS_OF_MONTH = Array.from({ length: 31 }, (_, i) => i + 1);

function to24h(hour12: number, ampm: "AM" | "PM") {
  return ampm === "AM" ? hour12 % 12 : (hour12 % 12) + 12;
}

/** --------------------------------- UI ---------------------------------- */
export default function NewsletterCard() {
  const [list, setList] = useState<Newsletter[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [templates, setTemplates] = useState<Template[]>([]);
  const [tplLoading, setTplLoading] = useState(false);

  const [recipientsAll, setRecipientsAll] = useState<Recipient[]>([]);
  const [defaultHistory, setDefaultHistory] = useState<number>(7);

  // Editor modal state
  const [openModal, setOpenModal] = useState(false);
  const [draft, setDraft] = useState<Newsletter | null>(null);
  const isEditing = !!draft?.id;

  // per-row send-now spinner
  const [sendingId, setSendingId] = useState<string | null>(null);

  // Load data
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setErr(null);
        const [newsletters, cfg] = await Promise.all([store.list(), fetchConfig()]);
        if (!cancelled) {
          setList(newsletters);
          setDefaultHistory(Number(cfg?.lookbackDays || 7));
        }
      } catch (e: any) {
        if (!cancelled) setErr(e?.message || String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Load templates & recipients (whenever modal opens)
  useEffect(() => {
    if (!openModal) return;
    let cancelled = false;
    (async () => {
      try {
        setTplLoading(true);
        const [tpls, recips] = await Promise.all([fetchTemplates(), fetchRecipients()]);
        if (!cancelled) {
          setTemplates(tpls);
          setRecipientsAll(recips);
        }
      } finally {
        if (!cancelled) setTplLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [openModal]);

  // Helpers
  function openNew() {
    setDraft({
      id: newId(),
      name: "",
      subject: "",
      description: "",
      schedule: {
        mode: "standard",
        frequency: "week",
        dayOfWeek: "friday",
        hour: 9,
        minute: 0,
      },
      historyDays: defaultHistory,
      templateId: undefined,
      templateName: undefined,
      recipients: [], // none selected by default
      sendAsBcc: false,
      enabled: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    setOpenModal(true);
  }

  function openEdit(n: Newsletter) {
    setDraft({
      ...n,
      recipients: Array.isArray(n.recipients) ? n.recipients : [],
      sendAsBcc: !!(n as any).sendAsBcc,
    });
    setOpenModal(true);
  }

  async function remove(n: Newsletter) {
    const ok = confirm(`Delete newsletter “${n.name || "(unnamed)"}”? This cannot be undone.`);
    if (!ok) return;
    await store.remove(n.id);
    const next = (await store.list()).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    setList(next);
  }

  async function toggleEnabled(n: Newsletter, enabled: boolean) {
    const next = list.map((x) => (x.id === n.id ? { ...x, enabled, updatedAt: Date.now() } : x));
    setList(next);
    await store.saveAll(next);
  }

  function pickTemplateName(id?: string) {
    if (!id) return undefined;
    return templates.find((t) => t.id === id)?.name;
  }

  // Save draft
  async function saveDraft() {
    if (!draft) return;
    if (!draft.name.trim()) {
      alert("Please provide a Name for the newsletter.");
      return;
    }
    const normalized: Newsletter = {
      ...draft,
      templateName: pickTemplateName(draft.templateId) ?? draft.templateName,
      recipients: Array.isArray(draft.recipients) ? draft.recipients : [],
      sendAsBcc: !!draft.sendAsBcc,
      updatedAt: Date.now(),
    };
    const exists = list.find((x) => x.id === normalized.id);
    const next = exists
      ? list.map((x) => (x.id === normalized.id ? normalized : x))
      : [normalized, ...list];

    // sort a copy to avoid mutating state
    setList([...next].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)));
    await store.saveAll(next);
    setOpenModal(false);
  }

  // Derived (sort a copy to avoid mutating)
  const rows = useMemo(
    () => [...list].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)),
    [list]
  );

  // ------------- Inline Scheduler: handy setters on draft.schedule ----------
  function ensureSchedule(): Schedule {
    const s = draft?.schedule || {};
    return {
      mode: s.mode || "standard",
      frequency: s.frequency || "week",
      dayOfWeek: s.dayOfWeek || "friday",
      dayOfMonth: typeof s.dayOfMonth === "number" ? s.dayOfMonth : 1,
      month: typeof s.month === "number" ? s.month : 0,
      hour: typeof s.hour === "number" ? s.hour : 9,
      minute: typeof s.minute === "number" ? s.minute : 0,
      cron: s.cron || "",
    };
  }
  function setSchedule(partial: Partial<Schedule>) {
    setDraft((d) => {
      if (!d) return d;
      const base = ensureSchedule();
      const next: Schedule = { ...base, ...partial };
      // keep mode in sync with cron presence
      if (typeof next.cron === "string" && next.cron.trim()) next.mode = "custom";
      else if (partial.frequency) next.mode = "standard";
      return { ...d, schedule: next };
    });
  }

  // helpers for hour12/ampm view
  const s = ensureSchedule();
  const hour12 = ((s.hour + 11) % 12) + 1;
  const ampm: "AM" | "PM" = s.hour >= 12 ? "PM" : "AM";

  // ---------- Recipients selection helpers ----------
  const allEmails = recipientsAll.map((r) => r.email);
  const selectedSet = new Set(draft?.recipients || []);
  const allChecked = allEmails.length > 0 && allEmails.every((e) => selectedSet.has(e));
  const someChecked = allEmails.some((e) => selectedSet.has(e)) && !allChecked;

  function toggleAllRecipients(checked: boolean) {
    setDraft((d) => {
      if (!d) return d;
      return { ...d, recipients: checked ? [...allEmails] : [] };
    });
  }
  function toggleRecipient(email: string, checked: boolean) {
    setDraft((d) => {
      if (!d) return d;
      const cur = new Set(d.recipients || []);
      if (checked) cur.add(email);
      else cur.delete(email);
      return { ...d, recipients: [...cur] };
    });
  }

  // ---------- Send Now ----------
  async function sendNow(n: Newsletter) {
    if (!n.id) return;
    setSendingId(n.id);
    try {
      // Fetch home stats passthrough for Most Watched blocks
      const timeRange = n.historyDays ?? defaultHistory;
      const homeStats = await safeJson<any>(
        fetch(`${API_BASE}/api/tautulli/passthrough?cmd=get_home_stats&time_range=${encodeURIComponent(timeRange)}`)
      );
      const resp = await sendNewsletterNow(n.id, { subject: n.subject || "", homeStats, lookbackDays: timeRange });
      if ((resp as any)?.ok) {
        // reflect lastSentAt immediately; server also persists
        const next = list.map((x) =>
          x.id === n.id ? { ...x, lastSentAt: Date.now(), updatedAt: Date.now() } : x
        );
        setList(next);
        alert("Newsletter sent.");
      } else {
        const msg = (resp as any)?.error || "Send failed.";
        alert(msg);
      }
    } catch (e: any) {
      alert(e?.message || "Send failed.");
    } finally {
      setSendingId(null);
    }
  }

  return (
    <div className="card bg-base-100 shadow">
      <div className="card-body">
        <div className="flex items-center justify-between">
          <h2 className="card-title">Newsletters</h2>
          <div className="flex items-center gap-2">
            {loading ? <span className="loading loading-spinner loading-sm" /> : null}
            <button className="btn btn-primary btn-sm" onClick={openNew}>New Newsletter</button>
          </div>
        </div>

        {err ? (
          <div className="alert alert-error mt-2">
            <span>{err}</span>
          </div>
        ) : null}

        <div className="mt-3 overflow-x-auto">
          <table className="table table-zebra">
            <thead>
              <tr>
                <th className="whitespace-nowrap">Name</th>
                <th className="whitespace-nowrap">Schedule</th>
                <th className="whitespace-nowrap">History</th>
                <th className="whitespace-nowrap">Template</th>
                <th className="whitespace-nowrap">Enabled</th>
                <th className="whitespace-nowrap text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="opacity-70">No newsletters yet. Click “New Newsletter”.</td>
                </tr>
              ) : (
                rows.map((n) => (
                  <tr key={n.id}>
                    <td className="align-top">
                      <div className="font-medium truncate max-w-[220px]" title={n.name}>{n.name || "—"}</div>
                      <div className="opacity-60 text-xs">Last edited {fmtDate(n.updatedAt)}</div>
                      {n.lastSentAt ? (
                        <div className="opacity-60 text-xs">Last sent {fmtDate(n.lastSentAt)}</div>
                      ) : (
                        <div className="opacity-40 text-xs">Not sent yet</div>
                      )}
                    </td>
                    <td className="align-top">{describeSchedule(n.schedule)}</td>
                    <td className="align-top">{typeof n.historyDays === "number" ? `${n.historyDays} day${n.historyDays === 1 ? "" : "s"}` : "—"}</td>
                    <td className="align-top">
                      <span className="truncate inline-block max-w-[220px]" title={n.templateName || ""}>
                        {n.templateName || "—"}
                      </span>
                    </td>
                    <td className="align-top">
                      <input
                        type="checkbox"
                        className="toggle toggle-primary"
                        checked={!!n.enabled}
                        onChange={(e) => toggleEnabled(n, e.target.checked)}
                      />
                    </td>
                    <td className="align-top">
                      <div className="flex justify-end gap-2">
                        <button className="btn btn-xs" onClick={() => openEdit(n)}>Edit</button>
                        <button
                          className="btn btn-xs btn-secondary"
                          onClick={() => sendNow(n)}
                          disabled={sendingId === n.id}
                          title="Send this newsletter immediately"
                        >
                          {sendingId === n.id ? (
                            <>
                              <span className="loading loading-spinner loading-xs" /> Sending…
                            </>
                          ) : (
                            "Send Now"
                          )}
                        </button>
                        <button className="btn btn-xs btn-error" onClick={() => remove(n)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Editor Modal */}
      {openModal && draft && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpenModal(false)} aria-hidden />
          <div className="absolute inset-0 p-4 grid place-items-center" role="dialog" aria-modal="true" aria-label="Newsletter Editor">
            <div className="card bg-base-100 shadow-xl w-full max-w-2xl max-h-[90vh]">
              <div className="card-body overflow-auto">
                <div className="flex items-center justify-between">
                  <h3 className="card-title">{isEditing ? "Edit Newsletter" : "New Newsletter"}</h3>
                  <div className="flex items-center gap-2">
                    {isEditing && (
                      <button
                        className="btn btn-sm"
                        onClick={() => draft && sendNow(draft)}
                        disabled={sendingId === draft?.id}
                        title="Send this newsletter immediately"
                      >
                        {sendingId === draft?.id ? <span className="loading loading-spinner loading-sm" /> : "Send Now"}
                      </button>
                    )}
                    <button className="btn btn-sm" onClick={() => setOpenModal(false)}>Close</button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
                  {/* Basics */}
                  <label className="form-control">
                    <div className="label"><span className="label-text">Name</span></div>
                    <input
                      className="input input-bordered"
                      value={draft.name}
                      onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                      placeholder="e.g., Weekly Highlights"
                    />
                  </label>

                  <label className="form-control">
                    <div className="label"><span className="label-text">Enabled</span></div>
                    <div className="flex items-center h-12 px-3 rounded border border-base-300">
                      <input
                        type="checkbox"
                        className="toggle toggle-primary"
                        checked={!!draft.enabled}
                        onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })}
                      />
                    </div>
                  </label>

                  {/* Description field first */}
                  <label className="form-control md:col-span-2">
                    <div className="label"><span className="label-text">Description</span></div>
                    <textarea
                      className="textarea textarea-bordered"
                      rows={2}
                      value={draft.description || ""}
                      onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                      placeholder="Brief details about this newsletter"
                    />
                    <div className="label">
                      <span className="label-text-alt">A brief description of what is in the Newsletter</span>
                    </div>
                  </label>

                  {/* Subject field after Description */}
                  <label className="form-control md:col-span-2">
                    <div className="label"><span className="label-text">Email Subject</span></div>
                    <input
                      className="input input-bordered"
                      value={draft.subject || ""}
                      onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
                      placeholder="e.g., New this week on Plex 📺"
                    />
                    <div className="label">
                      <span className="label-text-alt">
                        If Subject is left empty, the “Description” above will be the subject line when sent.
                      </span>
                    </div>
                  </label>

                  {/* Inline Scheduler */}
                  <div className="md:col-span-2 rounded-lg border border-base-300 p-3 bg-base-200/50">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="label-text font-medium">Schedule</div>
                        <div className="text-sm opacity-70">
                          Choose when this newsletter will be sent automatically.
                        </div>
                      </div>
                      <div className="text-sm opacity-70">
                        Current: <span className="font-medium">{describeSchedule(draft.schedule)}</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                      {/* Frequency */}
                      <label className="form-control">
                        <div className="label"><span className="label-text">Every</span></div>
                        <select
                          className="select select-bordered"
                          value={draft.schedule?.frequency || "week"}
                          onChange={(e) => setSchedule({ frequency: e.target.value as Schedule["frequency"] })}
                        >
                          <option value="hour">Hour</option>
                          <option value="day">Day</option>
                          <option value="week">Week</option>
                          <option value="month">Month</option>
                          <option value="year">Year</option>
                        </select>
                      </label>

                      {/* Day of week */}
                      {draft.schedule?.frequency === "week" && (
                        <label className="form-control">
                          <div className="label"><span className="label-text">On</span></div>
                          <select
                            className="select select-bordered"
                            value={draft.schedule?.dayOfWeek || "monday"}
                            onChange={(e) => setSchedule({ dayOfWeek: e.target.value })}
                          >
                            {DAYS.map((d) => (
                              <option key={d} value={d}>
                                {d[0].toUpperCase() + d.slice(1)}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}

                      {/* Day of month */}
                      {draft.schedule?.frequency === "month" && (
                        <label className="form-control">
                          <div className="label"><span className="label-text">Day</span></div>
                          <select
                            className="select select-bordered"
                            value={draft.schedule?.dayOfMonth || 1}
                            onChange={(e) => setSchedule({ dayOfMonth: Number(e.target.value) })}
                          >
                            {DAYS_OF_MONTH.map((d) => (
                              <option key={d} value={d}>{d}</option>
                            ))}
                          </select>
                        </label>
                      )}

                      {/* Month (yearly) */}
                      {draft.schedule?.frequency === "year" && (
                        <label className="form-control">
                          <div className="label"><span className="label-text">Month</span></div>
                          <select
                            className="select select-bordered"
                            value={draft.schedule?.month ?? 0}
                            onChange={(e) => setSchedule({ month: Number(e.target.value) })}
                          >
                            {MONTHS.map((m, i) => (
                              <option key={i} value={i}>{m}</option>
                            ))}
                          </select>
                        </label>
                      )}

                      {/* Time */}
                      <div className="grid grid-cols-3 gap-3 md:col-span-2">
                        <label className="form-control">
                          <div className="label"><span className="label-text">Hour</span></div>
                          <select
                            className="select select-bordered"
                            value={hour12}
                            onChange={(e) => {
                              const h12 = Number(e.target.value);
                              const newH = to24h(h12, ampm);
                              setSchedule({ hour: newH });
                            }}
                          >
                            {HOURS12.map((h) => <option key={h} value={h}>{h}</option>)}
                          </select>
                        </label>

                        <label className="form-control">
                          <div className="label"><span className="label-text">Minute</span></div>
                          <select
                            className="select select-bordered"
                            value={draft.schedule?.minute ?? 0}
                            onChange={(e) => setSchedule({ minute: Number(e.target.value) })}
                          >
                            {MINUTES.map((m) => (
                              <option key={m} value={m}>{String(m).padStart(2, "0")}</option>
                            ))}
                          </select>
                        </label>

                        <label className="form-control">
                          <div className="label"><span className="label-text">AM / PM</span></div>
                          <select
                            className="select select-bordered"
                            value={ampm}
                            onChange={(e) => {
                              const next = e.target.value as "AM" | "PM";
                              const newH = to24h(hour12, next);
                              setSchedule({ hour: newH });
                            }}
                          >
                            <option value="AM">AM</option>
                            <option value="PM">PM</option>
                          </select>
                        </label>
                      </div>
                    </div>

                    {/* Custom CRON */}
                    <div className="mt-4">
                      <label className="form-control">
                        <div className="label">
                          <span className="label-text">Custom CRON (optional)</span>
                          <span className="label-text-alt opacity-70">Overrides above</span>
                        </div>
                        <input
                          className="input input-bordered"
                          placeholder="e.g., 0 9 * * 1"
                          value={draft.schedule?.cron || ""}
                          onChange={(e) => setSchedule({ cron: e.target.value })}
                        />
                      </label>
                    </div>
                  </div>

                  {/* History */}
                  <label className="form-control">
                    <div className="label"><span className="label-text">History Window (days)</span></div>
                    <input
                      type="number"
                      min={1}
                      max={90}
                      className="input input-bordered"
                      value={typeof draft.historyDays === "number" ? draft.historyDays : defaultHistory}
                      onChange={(e) =>
                        setDraft({ ...draft, historyDays: Math.max(1, Math.min(90, Number(e.target.value) || 1)) })
                      }
                    />
                    <div className="label">
                      <span className="label-text-alt">Defaults to your global History setting.</span>
                    </div>
                  </label>

                  {/* Template select */}
                  <label className="form-control md:col-span-2">
                    <div className="label"><span className="label-text">Template</span></div>
                    <select
                      className="select select-bordered"
                      value={draft.templateId || ""}
                      onChange={(e) => {
                        const id = e.target.value || undefined;
                        const name = templates.find((t) => t.id === id)?.name;
                        setDraft({ ...draft, templateId: id, templateName: name });
                      }}
                    >
                      <option value="">— Select a Template —</option>
                      {tplLoading ? (
                        <option disabled>Loading templates…</option>
                      ) : templates.length === 0 ? (
                        <option disabled>No saved templates</option>
                      ) : (
                        templates.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))
                      )}
                    </select>
                    <div className="label">
                      <span className="label-text-alt">
                        Uses the chosen template when sending this newsletter.
                      </span>
                    </div>
                  </label>

                  {/* Recipients selector */}
                  <div className="md:col-span-2 rounded-lg border border-base-300 p-3 bg-base-200/40">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-medium">Recipients</div>
                      <div className="flex items-center gap-3">
                        <label className="label cursor-pointer gap-2" title="If enabled, all selected Recipients will be placed on BCC. The To: field will be set to your From address.">
                          <span className="label-text text-sm">Send to recipients as BCC</span>
                          <input
                            type="checkbox"
                            className="toggle toggle-sm toggle-primary"
                            checked={!!draft.sendAsBcc}
                            onChange={(e) => setDraft({ ...draft, sendAsBcc: e.target.checked })}
                          />
                        </label>
                        <div className="text-xs opacity-70">
                          {draft.recipients?.length || 0} selected
                        </div>
                      </div>
                    </div>

                    <div className="mt-2 overflow-x-auto">
                      <table className="table table-compact">
                        <thead>
                          <tr>
                            <th>
                              <input
                                type="checkbox"
                                className="checkbox"
                                checked={allChecked}
                                ref={(el) => {
                                  if (el) el.indeterminate = someChecked;
                                }}
                                onChange={(e) => toggleAllRecipients(e.target.checked)}
                                aria-label="Select all recipients"
                              />
                            </th>
                            <th>Name</th>
                            <th>Email</th>
                          </tr>
                        </thead>
                        <tbody>
                          {recipientsAll.length === 0 ? (
                            <tr>
                              <td colSpan={3} className="opacity-70">
                                No recipients found. Manage recipients on the main settings page.
                              </td>
                            </tr>
                          ) : (
                            recipientsAll.map((r) => {
                              const checked = selectedSet.has(r.email);
                              return (
                                <tr key={r.email}>
                                  <td>
                                    <input
                                      type="checkbox"
                                      className="checkbox"
                                      checked={checked}
                                      onChange={(e) => toggleRecipient(r.email, e.target.checked)}
                                      aria-label={`Select ${r.fullName || r.email}`}
                                    />
                                  </td>
                                  <td className="truncate max-w-[220px]">{r.fullName || "—"}</td>
                                  <td className="truncate max-w-[260px]">{r.email}</td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>

                    <div className="text-xs opacity-70 mt-2">
                      Recipients are managed on the main page. Selections here apply to this newsletter only.
                    </div>
                  </div>

                  {/* Host Recommendation info */}
                  <div className="md:col-span-2 rounded-lg border border-dashed border-base-300 p-3 bg-base-200/30 text-sm">
                    The <span className="font-medium">“Host’s Recommendation”</span> saved on the settings page will be
                    included in the scheduled newsletter if the snippet is part of your template.
                  </div>
                </div>

                <div className="mt-5 flex items-center justify-end gap-2">
                  <button className="btn btn-ghost" onClick={() => setOpenModal(false)}>Cancel</button>
                  <button className="btn btn-primary" onClick={saveDraft}>
                    {isEditing ? "Save Changes" : "Create Newsletter"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
