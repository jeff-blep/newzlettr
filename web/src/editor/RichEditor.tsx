import { useEffect, useState } from "react";
import { ActionIcon, Box, Button, Divider, Group, Menu, Modal, SegmentedControl, Stack, Text, Textarea, TextInput, Tooltip } from "@mantine/core";
import {
  IconAlignCenter,
  IconAlignLeft,
  IconAlignRight,
  IconArrowBackUp,
  IconArrowForwardUp,
  IconBold,
  IconH2,
  IconH3,
  IconItalic,
  IconLayoutDashboard,
  IconLink,
  IconList,
  IconListNumbers,
  IconQuote,
  IconStrikethrough,
  IconUnderline,
} from "@tabler/icons-react";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import { Placeholder } from "@tiptap/extensions";
import type { CardInfo } from "../../../shared/types";
import { CardToken, cardLabels, tokensToChips } from "./CardToken";
import classes from "./RichEditor.module.css";

interface Props {
  value: string;
  onChange: (html: string) => void;
  cards: CardInfo[];
}

export function RichEditor({ value, onChange, cards }: Props) {
  const [mode, setMode] = useState<"visual" | "html">("visual");
  const [linkOpen, setLinkOpen] = useState(false);
  for (const c of cards) cardLabels.set(c.token, c.label);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] }, code: false, codeBlock: false, link: { openOnClick: false, autolink: true } }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Placeholder.configure({ placeholder: "Write your intro… then use “Insert card” to add Plex stats and new arrivals." }),
      CardToken,
    ],
    content: tokensToChips(value),
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    immediatelyRender: true,
    shouldRerenderOnTransaction: false,
  });

  // External changes (template loaded, HTML mode edits) -> editor.
  useEffect(() => {
    if (!editor || mode !== "visual") return;
    if (editor.getHTML() !== value) editor.commands.setContent(tokensToChips(value), { emitUpdate: false });
  }, [editor, value, mode]);

  return (
    <Box className={classes.wrap}>
      <Group justify="space-between" className={classes.toolbar} wrap="wrap" gap={4}>
        {mode === "visual" && editor ? <Toolbar editor={editor} cards={cards} onLink={() => setLinkOpen(true)} /> : <Text size="xs" c="dimmed" px="xs">Editing raw HTML. Card tokens look like {"{{CARD_RECENT_MOVIES}}"}.</Text>}
        <SegmentedControl
          size="xs"
          value={mode}
          onChange={(v) => setMode(v as "visual" | "html")}
          data={[
            { value: "visual", label: "Visual" },
            { value: "html", label: "HTML" },
          ]}
        />
      </Group>
      {mode === "visual" ? (
        <EditorContent editor={editor} className={classes.content} />
      ) : (
        <Textarea
          value={value}
          onChange={(e) => onChange(e.currentTarget.value)}
          autosize
          minRows={18}
          styles={{ input: { fontFamily: "ui-monospace, Menlo, monospace", fontSize: 12, border: 0, background: "transparent" } }}
        />
      )}
      {editor && <LinkModal opened={linkOpen} onClose={() => setLinkOpen(false)} editor={editor} />}
    </Box>
  );
}

function Toolbar({ editor, cards, onLink }: { editor: Editor; cards: CardInfo[]; onLink: () => void }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      underline: e.isActive("underline"),
      strike: e.isActive("strike"),
      h2: e.isActive("heading", { level: 2 }),
      h3: e.isActive("heading", { level: 3 }),
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      quote: e.isActive("blockquote"),
      link: e.isActive("link"),
      left: e.isActive({ textAlign: "left" }),
      center: e.isActive({ textAlign: "center" }),
      right: e.isActive({ textAlign: "right" }),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });
  const btn = (label: string, active: boolean, icon: React.ReactNode, run: () => void, disabled = false) => (
    <Tooltip label={label} key={label} openDelay={400}>
      <ActionIcon variant={active ? "light" : "subtle"} color={active ? "newz" : "gray"} onClick={run} disabled={disabled} aria-label={label}>
        {icon}
      </ActionIcon>
    </Tooltip>
  );
  const c = () => editor.chain().focus();
  return (
    <Group gap={2} wrap="wrap">
      {btn("Bold", s.bold, <IconBold size={16} />, () => c().toggleBold().run())}
      {btn("Italic", s.italic, <IconItalic size={16} />, () => c().toggleItalic().run())}
      {btn("Underline", s.underline, <IconUnderline size={16} />, () => c().toggleUnderline().run())}
      {btn("Strikethrough", s.strike, <IconStrikethrough size={16} />, () => c().toggleStrike().run())}
      <Divider orientation="vertical" mx={4} />
      {btn("Heading", s.h2, <IconH2 size={16} />, () => c().toggleHeading({ level: 2 }).run())}
      {btn("Subheading", s.h3, <IconH3 size={16} />, () => c().toggleHeading({ level: 3 }).run())}
      {btn("Bulleted list", s.bullet, <IconList size={16} />, () => c().toggleBulletList().run())}
      {btn("Numbered list", s.ordered, <IconListNumbers size={16} />, () => c().toggleOrderedList().run())}
      {btn("Quote", s.quote, <IconQuote size={16} />, () => c().toggleBlockquote().run())}
      {btn("Link", s.link, <IconLink size={16} />, onLink)}
      <Divider orientation="vertical" mx={4} />
      {btn("Align left", s.left, <IconAlignLeft size={16} />, () => c().setTextAlign("left").run())}
      {btn("Center", s.center, <IconAlignCenter size={16} />, () => c().setTextAlign("center").run())}
      {btn("Align right", s.right, <IconAlignRight size={16} />, () => c().setTextAlign("right").run())}
      <Divider orientation="vertical" mx={4} />
      {btn("Undo", false, <IconArrowBackUp size={16} />, () => c().undo().run(), !s.canUndo)}
      {btn("Redo", false, <IconArrowForwardUp size={16} />, () => c().redo().run(), !s.canRedo)}
      <Divider orientation="vertical" mx={4} />
      <Menu position="bottom-start" width={300}>
        <Menu.Target>
          <Button size="xs" variant="light" leftSection={<IconLayoutDashboard size={14} />}>
            Insert card
          </Button>
        </Menu.Target>
        <Menu.Dropdown>
          {cards.map((card) => (
            <Menu.Item key={card.token} onClick={() => c().insertContent({ type: "cardToken", attrs: { token: card.token } }).run()}>
              <Text size="sm">{card.label}</Text>
              <Text size="xs" c="dimmed">
                {card.description}
              </Text>
            </Menu.Item>
          ))}
        </Menu.Dropdown>
      </Menu>
    </Group>
  );
}

function LinkModal({ opened, onClose, editor }: { opened: boolean; onClose: () => void; editor: Editor }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (opened) setUrl((editor.getAttributes("link").href as string | undefined) ?? "https://");
  }, [opened, editor]);
  const apply = () => {
    const u = url.trim();
    if (!u || u === "https://") editor.chain().focus().extendMarkRange("link").unsetLink().run();
    else editor.chain().focus().extendMarkRange("link").setLink({ href: /^(https?:|mailto:)/i.test(u) ? u : `https://${u}` }).run();
    onClose();
  };
  return (
    <Modal opened={opened} onClose={onClose} title="Link" centered size="sm">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          apply();
        }}
      >
        <Stack>
          <TextInput label="URL" value={url} onChange={(e) => setUrl(e.currentTarget.value)} data-autofocus />
          <Group justify="space-between">
            <Button variant="subtle" color="red" onClick={() => (setUrl(""), editor.chain().focus().unsetLink().run(), onClose())}>
              Remove link
            </Button>
            <Button type="submit">Apply</Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
