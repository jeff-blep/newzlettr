// src/components/ScheduleCard.tsx
import React, {
  useEffect,
  useState,
  forwardRef,
  useImperativeHandle,
} from "react";
import { postConfig, getSchedule as apiGetSchedule, getConfig as apiGetConfig } from "../api";

type Schedule = {
  mode?: "standard" | "custom";
  cron?: string;
  frequency?: "hour" | "day" | "week" | "month" | "year";
  dayOfWeek?: string; // e.g., "monday"
  dayOfMonth?: number;
  month?: number;
  hour?: number;   // 0-23
  minute?: number; // 0-59
};

export type ScheduleCardHandle = {
  open: () => void;
};

type Props = {
  schedule?: Schedule | null;
  save?: (partial: { schedule: Schedule }) => Promise<void> | void;
};

const DAYS = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];
const HOURS12 = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);
const DAYS_OF_MONTH = Array.from({ length: 31 }, (_, i) => i + 1);
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

const LS_KEY = "schedule";

function to24h(hour12: number, ampm: "AM" | "PM") {
  return ampm === "AM" ? hour12 % 12 : (hour12 % 12) + 12;
}

function isConfigured(s: Schedule | null): boolean {
  const x = s || {};
  if (x?.mode === "custom" && x?.cron && String(x.cron).trim()) return true;
  return Boolean(x?.frequency);
}

function describeSchedule(s: Schedule | null): string {
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
  return "Schedule not set";
}

/** Normalize whatever the server returns into our local Schedule shape. */
function normalizeServerSchedule(raw: any): Schedule | null {
  if (!raw) return null;
  const data = raw && raw.schedule ? raw.schedule : raw;
  if (typeof data !== "object" || data === null) return null;

  if (typeof data.cron === "string" && data.cron.trim().length > 0) {
    return { mode: "custom", cron: data.cron };
  }

  const out: Schedule = { mode: "standard" };

  if (typeof data.frequency === "string") {
    const f = data.frequency.toLowerCase();
    if (["hour", "day", "week", "month", "year"].includes(f)) {
      out.frequency = f as Schedule["frequency"];
    }
  }

  if (typeof data.hour === "number") out.hour = data.hour;
  if (typeof data.minute === "number") out.minute = data.minute;

  if (typeof data.dayOfWeek === "number" && data.dayOfWeek >= 0 && data.dayOfWeek <= 6) {
    out.dayOfWeek = DAYS[data.dayOfWeek];
  } else if (typeof data.dayOfWeek === "string" && data.dayOfWeek.length > 0) {
    out.dayOfWeek = data.dayOfWeek.toLowerCase();
  }

  if (typeof data.dayOfMonth === "number") out.dayOfMonth = data.dayOfMonth;
  if (typeof data.month === "number") out.month = data.month;

  return isConfigured(out) ? out : null;
}

/** Load from localStorage (if present and valid) */
function loadLocalSchedule(): Schedule | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return normalizeServerSchedule(parsed);
  } catch {
    return null;
  }
}

/** Save to localStorage */
function saveLocalSchedule(s: Schedule) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({ schedule: s }));
  } catch {
    // ignore
  }
}

const ScheduleCard = forwardRef<ScheduleCardHandle, Props>(
  ({ schedule: scheduleProp, save }, ref) => {
    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState<any>(null);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [schedule, setSchedule] = useState<Schedule | null>(scheduleProp ?? null);
    useEffect(() => {
      setSchedule(scheduleProp ?? null);
    }, [scheduleProp]);

    // -------- Load order on mount: localStorage → /api/schedule → /api/config --------
    useEffect(() => {
      let alive = true;

      const ls = loadLocalSchedule();
      if (ls && alive) setSchedule(ls);

      (async () => {
        try {
          let data: any = null;
          try {
            data = await apiGetSchedule(); // may not exist
          } catch {
            data = null;
          }
          if (!data) {
            try {
              const cfg = await apiGetConfig();
              data = cfg?.schedule ? { schedule: cfg.schedule } : null;
            } catch {
              data = null;
            }
          }
          if (!alive) return;
          const normalized = normalizeServerSchedule(data);
          if (normalized) {
            setSchedule(normalized);
            saveLocalSchedule(normalized);
          }
        } catch {
          // swallow
        }
      })();

      const onKey = (e: KeyboardEvent) => {
        if (e.key === "Escape") setOpen(false);
      };
      window.addEventListener("keydown", onKey);

      return () => {
        alive = false;
        window.removeEventListener("keydown", onKey);
      };
    }, []);

    // ---------------- Edit flow ----------------
    function openEditor() {
      const s = schedule || {};
      setDraft({
        frequency: s.frequency || "week",
        dayOfWeek: s.dayOfWeek || "monday",
        hour: typeof s.hour === "number" ? s.hour : 9,
        minute: typeof s.minute === "number" ? s.minute : 0,
        dayOfMonth: s.dayOfMonth || 1,
        month: s.month || 0,
        cron: s.cron || (s.mode === "custom" ? s.cron : ""),
        mode: s.mode || (s.cron ? "custom" : "standard"),
      });
      setError(null);
      setOpen(true);
    }

    useImperativeHandle(ref, () => ({
      open: () => openEditor(),
    }));

    function closeModal(e?: React.SyntheticEvent) {
      e?.stopPropagation?.();
      setOpen(false);
    }

    async function saveSchedule() {
      try {
        setSaving(true);
        setError(null);
        const d = draft || {};

        // Custom CRON path
        if (d.cron && String(d.cron).trim()) {
          const payload: Schedule = { mode: "custom", cron: d.cron };
          if (save) {
            await Promise.resolve(save({ schedule: payload }));
          } else {
            await postConfig({ schedule: payload });
            setSchedule(payload);
          }
          saveLocalSchedule(payload);
          setOpen(false);
          return;
        }

        // Standard schedule path
        const hh = to24h(
          Number(d.hour12 || ((((d.hour ?? 9) + 11) % 12) + 1)),
          d.ampm || ((d.hour ?? 9) >= 12 ? "PM" : "AM")
        );

        const payload: Schedule = {
          frequency: d.frequency,
          hour: hh,
          minute: Number(d.minute || 0),
        };

        if (d.frequency === "week") payload.dayOfWeek = d.dayOfWeek;
        if (d.frequency === "month") payload.dayOfMonth = Number(d.dayOfMonth || 1);
        if (d.frequency === "year") payload.month = Number(d.month || 0);

        if (save) {
          await Promise.resolve(save({ schedule: payload }));
        } else {
          await postConfig({ schedule: payload });
          setSchedule(payload);
        }
        saveLocalSchedule(payload);
        setOpen(false);
      } catch (e: any) {
        setError(e?.message || "Failed to save schedule");
      } finally {
        setSaving(false);
      }
    }

    // ---------------- View ----------------
    return (
      <>
        {/* Entire card container clickable */}
        <div className="flex flex-col items-center justify-center min-h-[4rem]">
          <span className="text-center text-base md:text-lg font-medium">
            {describeSchedule(schedule)}
          </span>
        </div>

        {/* Modal */}
        {open && (
          <div
            className="modal modal-open"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div
              className="modal-box max-w-2xl"
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-label="Sending Schedule"
            >
              <h3 className="font-bold text-lg mb-2">Sending Schedule</h3>
              <p className="text-sm opacity-70 mb-4">
                Choose when the newsletter is sent automatically.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Frequency */}
                <label className="form-control">
                  <div className="label"><span className="label-text">Every</span></div>
                  <select
                    className="select select-bordered"
                    value={draft?.frequency || "week"}
                    onChange={(e) => setDraft({ ...draft, frequency: e.target.value })}
                  >
                    <option value="hour">Hour</option>
                    <option value="day">Day</option>
                    <option value="week">Week</option>
                    <option value="month">Month</option>
                    <option value="year">Year</option>
                  </select>
                </label>

                {/* Day of week */}
                {draft?.frequency === "week" && (
                  <label className="form-control">
                    <div className="label"><span className="label-text">On</span></div>
                    <select
                      className="select select-bordered"
                      value={draft?.dayOfWeek || "monday"}
                      onChange={(e) => setDraft({ ...draft, dayOfWeek: e.target.value })}
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
                {draft?.frequency === "month" && (
                  <label className="form-control">
                    <div className="label"><span className="label-text">Day</span></div>
                    <select
                      className="select select-bordered"
                      value={draft?.dayOfMonth || 1}
                      onChange={(e) => setDraft({ ...draft, dayOfMonth: Number(e.target.value) })}
                    >
                      {DAYS_OF_MONTH.map((d) => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </label>
                )}

                {/* Month for yearly */}
                {draft?.frequency === "year" && (
                  <label className="form-control">
                    <div className="label"><span className="label-text">Month</span></div>
                    <select
                      className="select select-bordered"
                      value={draft?.month || 0}
                      onChange={(e) => setDraft({ ...draft, month: Number(e.target.value) })}
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
                      value={draft?.hour12 ?? ((((draft?.hour ?? 9) + 11) % 12) + 1)}
                      onChange={(e) => setDraft({ ...draft, hour12: Number(e.target.value) })}
                    >
                      {HOURS12.map((h) => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </label>

                  <label className="form-control">
                    <div className="label"><span className="label-text">Minute</span></div>
                    <select
                      className="select select-bordered"
                      value={draft?.minute ?? 0}
                      onChange={(e) => setDraft({ ...draft, minute: Number(e.target.value) })}
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
                      value={draft?.ampm ?? ((draft?.hour ?? 9) >= 12 ? "PM" : "AM")}
                      onChange={(e) => setDraft({ ...draft, ampm: e.target.value as "AM" | "PM" })}
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
                    value={draft?.cron || ""}
                    onChange={(e) => setDraft({ ...draft, cron: e.target.value })}
                  />
                </label>
              </div>

              {error && <div className="mt-3 text-error text-sm">{error}</div>}

              <div className="modal-action">
                <button className="btn" onClick={closeModal} disabled={saving}>
                  Cancel
                </button>
                <button className="btn btn-primary" onClick={saveSchedule} disabled={saving}>
                  {saving ? "Saving..." : "Save"}
                </button>
              </div>
            </div>

            {/* Backdrop closes */}
            <div className="modal-backdrop" onClick={closeModal} />
          </div>
        )}
      </>
    );
  }
);

export default ScheduleCard;
export type { Schedule };
