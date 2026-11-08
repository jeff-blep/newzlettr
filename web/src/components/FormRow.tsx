import type { ReactNode } from "react";
import { Box, Fieldset, Grid, Text } from "@mantine/core";

/** *arr-style settings group: a titled fieldset of label | control rows. */
export function SettingsSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Fieldset
      legend={
        <Text fw={600} size="lg">
          {title}
        </Text>
      }
      mb="xl"
      variant="unstyled"
      style={{ borderTop: "1px solid var(--nz-border)", paddingTop: 12 }}
    >
      {children}
    </Fieldset>
  );
}

export function FormRow({ label, help, children }: { label: string; help?: ReactNode; children: ReactNode }) {
  return (
    <Grid gutter="md" mb="md" align="flex-start">
      <Grid.Col span={{ base: 12, sm: 3 }} pt={{ sm: 6 }}>
        <Text size="sm" fw={600} ta={{ base: "left", sm: "right" }}>
          {label}
        </Text>
      </Grid.Col>
      <Grid.Col span={{ base: 12, sm: 9 }} maw={640}>
        <Box>{children}</Box>
        {help && (
          <Text size="xs" c="dimmed" mt={4}>
            {help}
          </Text>
        )}
      </Grid.Col>
    </Grid>
  );
}
