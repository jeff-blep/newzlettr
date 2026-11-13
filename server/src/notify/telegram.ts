import { HttpError, httpFetch } from "../integrations/http.js";

export interface TelegramTarget {
  botToken: string;
  chatId: string;
}

/** Escapes text for Telegram's HTML parse mode. */
export function tgEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Sends one HTML-formatted message. Errors are turned into plain-English hints. */
export async function sendTelegram(t: TelegramTarget, html: string): Promise<void> {
  if (!t.botToken || !t.chatId) throw new Error("Enter a bot token and a chat ID");
  // The token is part of the URL, so never put the URL in an error message or log.
  const res = await httpFetch(`https://api.telegram.org/bot${encodeURIComponent(t.botToken)}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: t.chatId, text: html, parse_mode: "HTML", link_preview_options: { is_disabled: true } }),
    timeoutMs: 15_000,
  });
  if (res.ok) return;
  let description = "";
  try {
    description = ((await res.json()) as { description?: string }).description ?? "";
  } catch {
    /* not JSON */
  }
  throw new HttpError(telegramHint(res.status, description), res.status);
}

export function telegramHint(status: number, description: string): string {
  if (status === 401 || status === 404) return "Telegram rejected the bot token. Copy it again from @BotFather.";
  if (/chat not found/i.test(description)) {
    return "Telegram can't find that chat. Send your bot a message first (or add it to the group), then check the chat ID.";
  }
  if (/bot was blocked/i.test(description)) return "You've blocked the bot in Telegram. Unblock it and try again.";
  if (/not enough rights|kicked/i.test(description)) return "The bot isn't allowed to post in that chat. Add it to the group/channel.";
  return `Telegram error ${status}${description ? `: ${description}` : ""}`;
}
