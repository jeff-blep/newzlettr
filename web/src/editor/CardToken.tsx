import { mergeAttributes, Node } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from "@tiptap/react";
import { Group, Text } from "@mantine/core";
import { IconLayoutDashboard } from "@tabler/icons-react";

/** Labels for chips; filled from /api/templates/cards at runtime (fallback = token). */
export const cardLabels = new Map<string, string>();

/** v1 aliases -> canonical token, so old templates show the right chip name. */
const ALIASES: Record<string, string> = {
  CARD_OWNER_RECOMMENDATION: "CARD_HOST_PICK",
  CARD_HOST_RECOMMENDATION: "CARD_HOST_PICK",
  HOST_RECOMMENDATION: "CARD_HOST_PICK",
  HOSTS_RECOMMENDATION: "CARD_HOST_PICK",
  CARD_STREAMING_DATA: "CARD_SERVER_TOTALS",
  CARD_MOST_WATCHED_EPISODES: "CARD_MOST_WATCHED_SHOWS",
  CARD_RECENT_SHOWS: "CARD_RECENT_EPISODES",
};
export const canonical = (token: string) => ALIASES[token] ?? token;

function Chip({ node, selected }: ReactNodeViewProps) {
  const token = canonical(String(node.attrs.token));
  return (
    <NodeViewWrapper>
      <div
        contentEditable={false}
        data-drag-handle
        style={{
          margin: "10px 0",
          padding: "12px 14px",
          borderRadius: 8,
          border: `1px dashed ${selected ? "var(--mantine-color-newz-4)" : "var(--mantine-color-dark-3)"}`,
          background: "rgba(124, 92, 255, 0.08)",
          cursor: "grab",
          userSelect: "none",
        }}
      >
        <Group gap={8}>
          <IconLayoutDashboard size={18} color="var(--mantine-color-newz-3)" />
          <Text size="sm" fw={600} c="newz.2">
            {cardLabels.get(token) ?? token}
          </Text>
          <Text size="xs" c="dimmed">
            card · filled in when the email is built
          </Text>
        </Group>
      </div>
    </NodeViewWrapper>
  );
}

/** A Plex/Tautulli card placeholder. Stored in HTML as <div data-card="TOKEN">{{TOKEN}}</div>. */
export const CardToken = Node.create({
  name: "cardToken",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,
  addAttributes() {
    return { token: { default: "" } };
  },
  parseHTML() {
    return [{ tag: "div[data-card]", getAttrs: (el) => ({ token: canonical((el as HTMLElement).getAttribute("data-card") ?? "") }) }];
  },
  renderHTML({ node, HTMLAttributes }) {
    const token = canonical(String(node.attrs.token));
    return ["div", mergeAttributes(HTMLAttributes, { "data-card": token }), `{{${token}}}`];
  },
  addNodeView() {
    return ReactNodeViewRenderer(Chip);
  },
});

/**
 * Turns literal {{TOKEN}} text (v1 / HTML mode) into chip markup the editor can parse.
 * A paragraph holding only a token becomes the chip; inline tokens split the paragraph.
 */
export function tokensToChips(html: string): string {
  let out = html.replace(
    /<(p|div)(?:\s[^>]*)?>\s*(?:<span[^>]*>\s*)?\{\{\s*([A-Z_]+)\s*\}\}(?:\s*<\/span>)?\s*(?:<br\s*\/?>\s*)*<\/\1>/g,
    (_m, _t, token: string) => `<div data-card="${canonical(token)}"></div>`,
  );
  out = out.replace(/(?<!data-card=")\{\{\s*([A-Z_]+)\s*\}\}/g, (_m, token: string) => `</p><div data-card="${canonical(token)}"></div><p>`);
  return out;
}
