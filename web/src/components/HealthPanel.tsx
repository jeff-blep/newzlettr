import { Button, Card, Group, Stack, Text, ThemeIcon } from "@mantine/core";
import { IconAlertTriangle, IconCircleCheck, IconCircleX, IconRefresh } from "@tabler/icons-react";
import { Link } from "react-router-dom";
import { useHealth, useRunHealth } from "../api/sections";

export function HealthPanel() {
  const { data } = useHealth();
  const run = useRunHealth();
  const checks = data?.checks ?? [];

  return (
    <Card bg="var(--nz-sidebar-bg)" maw={900} mb="lg">
      <Group justify="space-between" mb="sm">
        <Text fw={600} size="lg">
          Health
        </Text>
        <Button variant="default" size="xs" leftSection={<IconRefresh size={14} />} loading={run.isPending} onClick={() => run.mutate()}>
          Check now
        </Button>
      </Group>
      {checks.length === 0 ? (
        <Group gap="xs">
          <ThemeIcon color="green" variant="light" radius="xl">
            <IconCircleCheck size={16} />
          </ThemeIcon>
          <Text size="sm">No issues found{data?.checkedAt ? ` (checked ${new Date(data.checkedAt).toLocaleTimeString()})` : ""}.</Text>
        </Group>
      ) : (
        <Stack gap="xs">
          {checks.map((c, i) => (
            <Group key={i} justify="space-between" wrap="nowrap">
              <Group gap="xs" wrap="nowrap">
                <ThemeIcon color={c.level === "error" ? "red" : "yellow"} variant="light" radius="xl">
                  {c.level === "error" ? <IconCircleX size={16} /> : <IconAlertTriangle size={16} />}
                </ThemeIcon>
                <Text size="sm">{c.message}</Text>
              </Group>
              {c.fixPath && (
                <Button component={Link} to={c.fixPath} variant="subtle" size="xs">
                  Fix
                </Button>
              )}
            </Group>
          ))}
        </Stack>
      )}
    </Card>
  );
}
