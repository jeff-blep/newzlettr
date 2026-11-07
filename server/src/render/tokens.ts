import type { CardInfo } from "../../../shared/types.js";

export type CardId =
  | "HOST_PICK"
  | "SERVER_TOTALS"
  | "MOST_WATCHED_MOVIES"
  | "MOST_WATCHED_SHOWS"
  | "POPULAR_MOVIES"
  | "POPULAR_SHOWS"
  | "POPULAR_PLATFORMS"
  | "RECENT_MOVIES"
  | "RECENT_EPISODES";

/** Canonical tokens shown in the editor, in menu order. */
export const CARDS: (CardInfo & { id: CardId })[] = [
  { id: "HOST_PICK", token: "CARD_HOST_PICK", label: "Host's Pick", description: "Your featured title and note" },
  { id: "SERVER_TOTALS", token: "CARD_SERVER_TOTALS", label: "Server totals", description: "Library size and what was streamed" },
  { id: "RECENT_MOVIES", token: "CARD_RECENT_MOVIES", label: "New movies", description: "Movies added in the window" },
  { id: "RECENT_EPISODES", token: "CARD_RECENT_EPISODES", label: "New episodes", description: "TV added in the window, by show" },
  { id: "MOST_WATCHED_MOVIES", token: "CARD_MOST_WATCHED_MOVIES", label: "Most watched movies", description: "Ranked by plays" },
  { id: "MOST_WATCHED_SHOWS", token: "CARD_MOST_WATCHED_SHOWS", label: "Most watched shows", description: "Ranked by plays" },
  { id: "POPULAR_MOVIES", token: "CARD_POPULAR_MOVIES", label: "Popular movies", description: "Ranked by number of viewers" },
  { id: "POPULAR_SHOWS", token: "CARD_POPULAR_SHOWS", label: "Popular shows", description: "Ranked by number of viewers" },
  { id: "POPULAR_PLATFORMS", token: "CARD_POPULAR_PLATFORMS", label: "Platforms", description: "Devices people watched on" },
];

/** v1 token names keep working so imported templates render unchanged. */
const ALIASES: Record<string, CardId> = {
  CARD_OWNER_RECOMMENDATION: "HOST_PICK",
  CARD_HOST_RECOMMENDATION: "HOST_PICK",
  HOST_RECOMMENDATION: "HOST_PICK",
  HOSTS_RECOMMENDATION: "HOST_PICK",
  CARD_STREAMING_DATA: "SERVER_TOTALS",
  SERVER_TOTALS: "SERVER_TOTALS",
  LIBRARY_TOTALS: "SERVER_TOTALS",
  CARD_MOST_WATCHED_EPISODES: "MOST_WATCHED_SHOWS",
  CARD_RECENT_SHOWS: "RECENT_EPISODES",
};

export function cardForToken(token: string): CardId | null {
  const t = token.toUpperCase();
  const direct = CARDS.find((c) => c.token === t);
  return direct?.id ?? ALIASES[t] ?? null;
}

/** Matches {{TOKEN}} anywhere. */
export const TOKEN_RE = /\{\{\s*([A-Z_]+)\s*\}\}/g;

export function tokensIn(html: string): CardId[] {
  const out = new Set<CardId>();
  for (const m of html.matchAll(TOKEN_RE)) {
    const id = cardForToken(m[1]!);
    if (id) out.add(id);
  }
  return [...out];
}
