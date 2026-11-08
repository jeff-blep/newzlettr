import { useState } from "react";
import { Alert, Box, Card, Center, Group, Loader, SegmentedControl, SimpleGrid, Stack, Text, Tooltip } from "@mantine/core";
import type { MediaRef, PlatformStat } from "../../../shared/types";
import { useStats } from "../api/media";
import { PageToolbar } from "../components/PageToolbar";
import { Poster } from "../components/Poster";

const compact = new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 });
const full = new Intl.NumberFormat();
const hours = (s: number) => compact.format(Math.round(s / 3600));

/** Stat tile: sentence-case label, semibold compact value, exact value on hover. */
function StatTile({ label, value, exact, hint }: { label: string; value: string; exact?: string; hint?: string }) {
  return (
    <Card bg="var(--nz-sidebar-bg)" padding="md">
      <Text size="sm" c="dimmed">
        {label}
      </Text>
      <Tooltip label={exact} disabled={!exact}>
        <Text fz={30} fw={600} lh={1.2} mt={4} c="gray.1" w="fit-content">
          {value}
        </Text>
      </Tooltip>
      {hint && (
        <Text size="xs" c="dimmed" mt={2}>
          {hint}
        </Text>
      )}
    </Card>
  );
}

/** One ranked row: poster, title, and a thin bar on a shared baseline (one hue, largest first). */
function RankedList({ title, items, metric }: { title: string; items: MediaRef[]; metric: "plays" | "users" }) {
  const max = Math.max(1, ...items.map((i) => i[metric] ?? 0));
  const unit = metric === "plays" ? "play" : "viewer";
  return (
    <Card bg="var(--nz-sidebar-bg)">
      <Text fw={600} mb="sm">
        {title}
      </Text>
      {items.length === 0 ? (
        <Text size="sm" c="dimmed">
          Nothing watched in this window.
        </Text>
      ) : (
        <Stack gap={10}>
          {items.map((m, i) => {
            const v = m[metric] ?? 0;
            return (
              <Group key={`${m.ratingKey}-${i}`} wrap="nowrap" gap="sm">
                <Poster thumb={m.thumb} width={32} />
                <Box style={{ flex: 1, minWidth: 0 }}>
                  <Group justify="space-between" wrap="nowrap" gap="xs">
                    <Text size="sm" truncate>
                      {m.title}
                      {m.year ? <Text span c="dimmed" size="xs"> {m.year}</Text> : null}
                    </Text>
                    <Text size="sm" fw={600} c="gray.2" style={{ flexShrink: 0 }}>
                      {full.format(v)} <Text span size="xs" c="dimmed" fw={400}>{unit}{v === 1 ? "" : "s"}</Text>
                    </Text>
                  </Group>
                  <Box mt={4} h={6} bg="dark.5" style={{ borderRadius: 3 }}>
                    <Box h={6} w={`${(v / max) * 100}%`} bg="newz.4" style={{ borderRadius: 3, minWidth: 6 }} />
                  </Box>
                </Box>
              </Group>
            );
          })}
        </Stack>
      )}
    </Card>
  );
}

function PlatformList({ items }: { items: PlatformStat[] }) {
  const max = Math.max(1, ...items.map((i) => i.plays));
  return (
    <Card bg="var(--nz-sidebar-bg)">
      <Text fw={600} mb="sm">
        Most used platforms
      </Text>
      {items.length === 0 ? (
        <Text size="sm" c="dimmed">
          No plays in this window.
        </Text>
      ) : (
        <Stack gap={10}>
          {items.map((p) => (
            <Group key={p.name} wrap="nowrap" gap="sm">
              <img src={`/email-assets/platforms/${p.icon}`} width={32} height={32} alt="" style={{ borderRadius: 6, flexShrink: 0 }} />
              <Box style={{ flex: 1, minWidth: 0 }}>
                <Group justify="space-between" wrap="nowrap" gap="xs">
                  <Text size="sm" truncate>
                    {p.name}
                  </Text>
                  <Text size="sm" fw={600} c="gray.2">
                    {full.format(p.plays)} <Text span size="xs" c="dimmed" fw={400}>plays</Text>
                  </Text>
                </Group>
                <Box mt={4} h={6} bg="dark.5" style={{ borderRadius: 3 }}>
                  <Box h={6} w={`${(p.plays / max) * 100}%`} bg="newz.4" style={{ borderRadius: 3, minWidth: 6 }} />
                </Box>
              </Box>
            </Group>
          ))}
        </Stack>
      )}
    </Card>
  );
}

export function StatsPage() {
  const [days, setDays] = useState("7");
  const { data, isPending, error, isFetching } = useStats(Number(days));

  return (
    <>
      <PageToolbar
        title="Stats"
        actions={
          <Group gap="sm">
            {isFetching && <Loader size="xs" />}
            <SegmentedControl
              value={days}
              onChange={setDays}
              data={[
                { value: "7", label: "7 days" },
                { value: "14", label: "14 days" },
                { value: "30", label: "30 days" },
                { value: "90", label: "90 days" },
              ]}
            />
          </Group>
        }
      />
      {isPending ? (
        <Center p="xl">
          <Loader />
        </Center>
      ) : error || !data ? (
        <Alert color="red">{String(error)}</Alert>
      ) : (
        <Stack gap="lg">
          {data.errors.length > 0 && (
            <Alert color="yellow" variant="light" title="Some stats couldn't be loaded">
              {data.errors.map((e) => (
                <Text size="sm" key={e}>
                  {e}
                </Text>
              ))}
            </Alert>
          )}

          {data.excludedUsers.length > 0 && (
            <Text size="sm" c="dimmed">
              Most watched lists leave out plays by <b>{data.excludedUsers.join(", ")}</b> (Settings → Content → Most Watched).
            </Text>
          )}

          <div>
            <Text fw={600} mb="xs">
              Library
            </Text>
            <SimpleGrid cols={{ base: 1, xs: 3 }}>
              <StatTile label="Movies" value={data.library ? compact.format(data.library.movies) : "—"} exact={data.library ? full.format(data.library.movies) : undefined} />
              <StatTile label="TV shows" value={data.library ? compact.format(data.library.shows) : "—"} exact={data.library ? full.format(data.library.shows) : undefined} />
              <StatTile label="Episodes" value={data.library ? compact.format(data.library.episodes) : "—"} exact={data.library ? full.format(data.library.episodes) : undefined} />
            </SimpleGrid>
          </div>

          <div>
            <Text fw={600} mb="xs">
              Last {data.days} days
            </Text>
            <SimpleGrid cols={{ base: 1, xs: 3 }}>
              <StatTile label="Movies streamed" value={data.window ? compact.format(data.window.moviePlays) : "—"} exact={data.window ? full.format(data.window.moviePlays) : undefined} />
              <StatTile label="Episodes streamed" value={data.window ? compact.format(data.window.episodePlays) : "—"} exact={data.window ? full.format(data.window.episodePlays) : undefined} />
              <StatTile
                label="Hours watched"
                value={data.window ? hours(data.window.seconds) : "—"}
                exact={data.window ? `${full.format(Math.round(data.window.seconds / 3600))} hours` : undefined}
              />
            </SimpleGrid>
          </div>

          <SimpleGrid cols={{ base: 1, md: 2, xl: 3 }}>
            <RankedList title="Most watched movies" items={data.mostWatchedMovies.slice(0, 8)} metric="plays" />
            <RankedList title="Most watched shows" items={data.mostWatchedShows.slice(0, 8)} metric="plays" />
            <PlatformList items={data.platforms.slice(0, 8)} />
            <RankedList title="Popular movies (most viewers)" items={data.popularMovies.slice(0, 8)} metric="users" />
            <RankedList title="Popular shows (most viewers)" items={data.popularShows.slice(0, 8)} metric="users" />
          </SimpleGrid>
        </Stack>
      )}
    </>
  );
}
