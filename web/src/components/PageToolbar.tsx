import type { ReactNode } from "react";
import { Box, Button, Group, Title } from "@mantine/core";
import { IconDeviceFloppy } from "@tabler/icons-react";

interface Props {
  title: string;
  /** Extra toolbar buttons (left of Save). */
  actions?: ReactNode;
  /** When provided, renders an *arr-style "Save Changes" button. */
  onSave?: () => void;
  dirty?: boolean;
  saving?: boolean;
}

/** Sticky page header: title on the left, actions + Save on the right (like *arr Settings pages). */
export function PageToolbar({ title, actions, onSave, dirty, saving }: Props) {
  return (
    <Box
      pos="sticky"
      top={56}
      py="sm"
      mb="md"
      style={{ zIndex: 5, background: "var(--nz-page-bg)", borderBottom: "1px solid var(--nz-border)" }}
    >
      <Group justify="space-between" wrap="nowrap">
        <Title order={2} fw={500} size="h3">
          {title}
        </Title>
        <Group gap="xs">
          {actions}
          {onSave && (
            <Button leftSection={<IconDeviceFloppy size={16} />} onClick={onSave} disabled={!dirty} loading={saving}>
              {dirty ? "Save Changes" : "No Changes"}
            </Button>
          )}
        </Group>
      </Group>
    </Box>
  );
}
