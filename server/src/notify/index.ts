import type { SendRecord } from "../../../shared/types.js";
import type { DB } from "../db/index.js";
import { logger } from "../logging.js";
import { getSection } from "../settings.js";
import { sendTelegram, tgEscape } from "./telegram.js";

const log = logger("notify");

export type NotifyEvent = "sent" | "warning" | "failed" | "skipped";

/** Which event a finished send is, or null if it shouldn't notify at all (tests, still running). */
export function eventFor(r: Pick<SendRecord, "status" | "trigger" | "error">): NotifyEvent | null {
  if (r.trigger === "test") return null;
  if (r.status === "sent") return r.error ? "warning" : "sent";
  if (r.status === "failed") return "failed";
  if (r.status === "skipped") return "skipped";
  return null;
}

/** Whether the user's switches want this event. "Sent with warnings" counts as a problem too. */
export function wants(cfg: { onSent: boolean; onFailed: boolean; onSkipped: boolean }, ev: NotifyEvent): boolean {
  if (ev === "sent") return cfg.onSent;
  if (ev === "warning") return cfg.onSent || cfg.onFailed;
  if (ev === "failed") return cfg.onFailed;
  return cfg.onSkipped;
}

const TRIGGER_LABEL: Record<string, string> = { scheduled: "scheduled", manual: "sent manually" };

export function formatMessage(ev: NotifyEvent, r: Pick<SendRecord, "newsletterName" | "trigger" | "recipientCount" | "error">, activityUrl?: string): string {
  const name = `<b>${tgEscape(r.newsletterName)}</b>`;
  const people = `${r.recipientCount} ${r.recipientCount === 1 ? "person" : "people"}`;
  const how = TRIGGER_LABEL[r.trigger] ? ` (${TRIGGER_LABEL[r.trigger]})` : "";
  const detail = r.error ? `\n${tgEscape(r.error.length > 600 ? `${r.error.slice(0, 600)}…` : r.error)}` : "";
  const lines = {
    sent: `✅ ${name} went out to ${people}${how}.`,
    warning: `⚠️ ${name} went out to ${people}${how}, with problems:${detail}`,
    failed: `❌ ${name} didn't send${how}.${detail}`,
    skipped: `⏭️ ${name} was skipped.${detail}`,
  }[ev];
  return `${lines}${activityUrl ? `\n\n<a href="${tgEscape(activityUrl)}">Open Activity</a>` : ""}`;
}

/** Tells the configured channels about a finished send. Never throws; failures are logged. */
export async function notifySend(db: DB, r: SendRecord): Promise<void> {
  const ev = eventFor(r);
  if (!ev) return;
  const cfg = getSection(db, "notifications");
  if (!cfg.telegramEnabled || !cfg.telegramBotToken || !cfg.telegramChatId || !wants(cfg, ev)) return;
  const base = getSection(db, "general").applicationUrl.replace(/\/+$/, "");
  try {
    await sendTelegram({ botToken: cfg.telegramBotToken, chatId: cfg.telegramChatId }, formatMessage(ev, r, base ? `${base}/activity` : undefined));
    log.info({ event: ev, newsletter: r.newsletterName }, "telegram notification sent");
  } catch (e) {
    log.warn({ event: ev, newsletter: r.newsletterName, error: (e as Error).message }, "telegram notification failed");
  }
}

/** Fire-and-forget wrapper so a slow Telegram never holds up a send. */
export function notifySendInBackground(db: DB, r: SendRecord): void {
  notifySend(db, r).catch((e: unknown) => log.debug({ err: e }, "notification crashed"));
}
