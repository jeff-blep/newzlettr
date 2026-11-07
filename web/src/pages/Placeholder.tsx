import { Badge, Card, Group, Text } from "@mantine/core";
import { PageToolbar } from "../components/PageToolbar";

/** Stand-in for pages that arrive in a later milestone. */
export function Placeholder({ title, milestone, description }: { title: string; milestone: number; description: string }) {
  return (
    <>
      <PageToolbar title={title} />
      <Card bg="var(--nz-sidebar-bg)">
        <Group gap="sm">
          <Badge variant="light">Milestone {milestone}</Badge>
          <Text c="dimmed">{description}</Text>
        </Group>
      </Card>
    </>
  );
}
