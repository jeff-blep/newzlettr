import { ColorInput, Group, SegmentedControl, Stack, Text } from "@mantine/core";
import type { EmailTheme } from "../../../shared/types";

export const ACCENT_SWATCHES = ["#7c5cff", "#e5a00d", "#35c5f4", "#ff5c8a", "#2fb380", "#f06543"];

export const THEME_HELP: Record<EmailTheme, string> = {
  dark: "Everyone gets the dark design. Some Gmail/Outlook phone apps in dark mode may still adjust colours.",
  light: "Everyone gets the light design, and Apple Mail is told not to darken it. Some Gmail/Outlook phone apps may still recolour it.",
  auto: "Light design that switches to dark when the reader's device is in dark mode — in Apple Mail (iPhone, iPad, Mac), Outlook for Mac/iOS and others. Gmail ignores this and shows light (the Gmail app may recolour it itself).",
};

/** Appearance + accent colour for a newsletter (or a template preview). */
export function LookPicker({
  emailTheme,
  accentColor,
  onChange,
  compact,
}: {
  emailTheme: EmailTheme;
  accentColor: string;
  onChange: (look: { emailTheme: EmailTheme; accentColor: string }) => void;
  compact?: boolean;
}) {
  const themeControl = (
    <SegmentedControl
      size={compact ? "xs" : "sm"}
      value={emailTheme}
      onChange={(v) => onChange({ emailTheme: v as EmailTheme, accentColor })}
      data={[
        { value: "dark", label: "Dark" },
        { value: "light", label: "Light" },
        { value: "auto", label: compact ? "Match device" : "Match reader's device" },
      ]}
    />
  );
  const colorControl = (
    <ColorInput
      size={compact ? "xs" : "sm"}
      value={accentColor}
      onChange={(v) => /^#[0-9a-fA-F]{6}$/.test(v) && onChange({ emailTheme, accentColor: v })}
      format="hex"
      swatches={ACCENT_SWATCHES}
      w={compact ? 120 : 160}
      aria-label="Accent colour"
    />
  );
  if (compact)
    return (
      <Group gap="xs" wrap="nowrap">
        {themeControl}
        {colorControl}
      </Group>
    );
  return (
    <Stack gap={6}>
      <Group gap="sm" align="center">
        {themeControl}
        {colorControl}
      </Group>
      <Text size="xs" c="dimmed">
        {THEME_HELP[emailTheme]} The accent colour is used for card labels, buttons and bars.
      </Text>
    </Stack>
  );
}
