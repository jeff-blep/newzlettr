import { Alert, Badge, Button, Card, Group, Loader, Progress, SimpleGrid, Stack, Text, Tooltip } from "@mantine/core";
import { IconRefresh } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import type { ImagesUsageResponse } from "../../../shared/types";
import { get } from "../api/client";

const bytes = (n: number) =>
  n >= 1024 ** 3 ? `${(n / 1024 ** 3).toFixed(1)} GB` : n >= 1024 ** 2 ? `${(n / 1024 ** 2).toFixed(0)} MB` : `${Math.round(n / 1024)} KB`;
const num = new Intl.NumberFormat();

/** Meter colour carries severity (accent -> warning -> danger), always paired with a text label. */
function level(pct: number): { color: string; label: string } {
  if (pct >= 90) return { color: "red", label: "Almost out" };
  if (pct >= 70) return { color: "yellow", label: "Getting close" };
  return { color: "newz", label: "Plenty left" };
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card bg="var(--nz-header-bg)" padding="sm">
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <Text fw={600} size="lg" c="gray.1">
        {value}
      </Text>
      {hint && (
        <Text size="xs" c="dimmed">
          {hint}
        </Text>
      )}
    </Card>
  );
}

export function CloudinaryUsageCard() {
  const q = useQuery({
    queryKey: ["cloudinary-usage"],
    queryFn: () => get<ImagesUsageResponse>("/api/settings/images/usage"),
    staleTime: 5 * 60_000,
  });
  const refresh = useQuery({
    queryKey: ["cloudinary-usage", "fresh"],
    queryFn: () => get<ImagesUsageResponse>("/api/settings/images/usage?fresh=1"),
    enabled: false,
  });
  const data = refresh.data ?? q.data;

  if (q.isPending) return <Loader size="sm" />;
  if (q.error) return <Alert color="red">{String(q.error)}</Alert>;
  if (!data || !data.configured) return <Text size="sm" c="dimmed">Save your Cloudinary details above to see usage.</Text>;
  if (data.error || !data.usage) return <Alert color="red" variant="light">Couldn't load usage: {data.error}</Alert>;
  const u = data.usage;
  const lvl = u.credits ? level(u.credits.usedPercent) : null;

  return (
    <Card bg="var(--nz-sidebar-bg)" maw={760}>
      <Stack gap="md">
        <Group justify="space-between">
          <Group gap="xs">
            <Text fw={600}>Cloudinary account</Text>
            <Badge variant="light" color="gray" size="sm">
              {u.plan} plan
            </Badge>
          </Group>
          <Group gap="xs">
            {u.lastUpdated && (
              <Text size="xs" c="dimmed">
                Cloudinary updated {new Date(`${u.lastUpdated}T00:00:00`).toLocaleDateString()}
              </Text>
            )}
            <Tooltip label="Refresh from Cloudinary">
              <Button size="compact-xs" variant="subtle" loading={refresh.isFetching} onClick={() => void refresh.refetch()}>
                <IconRefresh size={14} />
              </Button>
            </Tooltip>
          </Group>
        </Group>

        {u.credits && lvl && (
          <div>
            <Group justify="space-between" mb={6}>
              <Text size="sm">
                <b>{u.credits.usage.toFixed(2)}</b> of {u.credits.limit} monthly credits used ({Math.round(u.credits.usedPercent)}%)
              </Text>
              <Badge variant="light" color={lvl.color} size="sm">
                {lvl.label}
              </Badge>
            </Group>
            <Progress value={Math.min(100, u.credits.usedPercent)} color={lvl.color} size="lg" radius="xl" aria-label="Cloudinary credits used" />
            <Text size="xs" c="dimmed" mt={6}>
              1 credit ≈ 1 GB stored, 1 GB served to inboxes, or 1,000 image transformations. Serving images to readers (bandwidth) is usually the biggest part.
            </Text>
          </div>
        )}

        <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="xs">
          <Tile label="Storage" value={bytes(u.storageBytes)} />
          <Tile label="Bandwidth" value={bytes(u.bandwidthBytes)} hint="last 30 days" />
          <Tile label="Transformations" value={num.format(u.transformations)} />
          <Tile label="Images in account" value={num.format(u.totalImages)} />
        </SimpleGrid>

        <Text size="sm">
          Newzlettr's folder <b>“{u.folder.name}”</b>: {num.format(u.folder.images)}
          {u.folder.truncated ? "+" : ""} images, {bytes(u.folder.bytes)}.
        </Text>
      </Stack>
    </Card>
  );
}
