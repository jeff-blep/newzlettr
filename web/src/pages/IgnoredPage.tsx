import { useEffect, useState } from "react";
import { ActionIcon, Alert, Button, Card, Center, Checkbox, Group, Loader, Stack, Table, Text, Tooltip } from "@mantine/core";
import { IconArrowBackUp, IconX } from "@tabler/icons-react";
import type { IgnoredPerson } from "../../../shared/types";
import { useIgnored, useUnignore } from "../api/media";
import { notifyError, notifyOk } from "../components/notify";
import { PageToolbar } from "../components/PageToolbar";
import { SortTh, useSortedRows } from "../components/sortable";
import { relTime } from "./system/SystemTasks";

/** People Import from Plex skips - like Sonarr's import list exclusions. */
export function IgnoredPage() {
  const { data, isPending, error } = useIgnored();
  const unignore = useUnignore();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const { rows, sort, toggle } = useSortedRows(
    "ignored",
    data,
    {
      name: (p: IgnoredPerson) => p.name,
      email: (p: IgnoredPerson) => p.email,
      ignoredAt: (p: IgnoredPerson) => Date.parse(p.ignoredAt),
    },
    { key: "name", dir: "asc" },
  );

  useEffect(() => {
    if (!data) return;
    const ids = new Set(data.map((p) => p.id));
    setSelected((s) => {
      const next = new Set([...s].filter((id) => ids.has(id)));
      return next.size === s.size ? s : next;
    });
  }, [data]);

  if (isPending) return <Center p="xl"><Loader /></Center>;
  if (error || !data) return <Alert color="red">{String(error)}</Alert>;

  const all = rows.length > 0 && rows.every((p) => selected.has(p.id));
  const some = rows.some((p) => selected.has(p.id));
  const remove = (ids: number[]) =>
    unignore.mutate(ids, {
      onSuccess: (r) => {
        notifyOk(`${r.removed} taken off the Ignore list. They'll come back on the next Import from Plex if they still have access.`, "Un-ignored");
        setSelected(new Set());
      },
      onError: (e) => notifyError(e),
    });

  return (
    <>
      <PageToolbar title="Ignored" />
      <Text size="sm" c="dimmed" mb="md" maw={760}>
        People here are skipped by <b>Import from Plex</b>, even if they still have access to your server. This prevents them from being added from an import.
      </Text>

      {selected.size > 0 && (
        <Card bg="rgba(124, 92, 255, 0.10)" withBorder mb="sm" py={8} px="md" style={{ borderColor: "var(--mantine-color-newz-7)" }}>
          <Group justify="space-between">
            <Text size="sm" fw={600}>
              {selected.size} selected
            </Text>
            <Group gap="xs">
              <Button size="xs" variant="default" leftSection={<IconArrowBackUp size={14} />} loading={unignore.isPending} onClick={() => remove([...selected])}>
                Remove from Ignore list
              </Button>
              <Button size="xs" variant="subtle" color="gray" leftSection={<IconX size={14} />} onClick={() => setSelected(new Set())}>
                Clear
              </Button>
            </Group>
          </Group>
        </Card>
      )}

      <Card bg="var(--nz-sidebar-bg)" p={0}>
        {data.length === 0 ? (
          <Center p="xl">
            <Stack align="center" gap={4}>
              <Text c="dimmed">Nobody is ignored.</Text>
              <Text size="sm" c="dimmed">
                Use Ignore on the People page for anyone you don't want re-imported.
              </Text>
            </Stack>
          </Center>
        ) : (
          <Table verticalSpacing="xs" highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th w={44}>
                  <Checkbox
                    aria-label="Select all"
                    checked={all}
                    indeterminate={some && !all}
                    onChange={() => setSelected(all ? new Set() : new Set(rows.map((p) => p.id)))}
                  />
                </Table.Th>
                <SortTh label="Name" column="name" sort={sort} onSort={toggle} />
                <SortTh label="Email" column="email" sort={sort} onSort={toggle} />
                <SortTh label="Ignored" column="ignoredAt" sort={sort} onSort={toggle} />
                <Table.Th w={60} />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map((p) => (
                <Table.Tr key={p.id} bg={selected.has(p.id) ? "rgba(124, 92, 255, 0.07)" : undefined}>
                  <Table.Td>
                    <Checkbox
                      aria-label={`Select ${p.email ?? p.name}`}
                      checked={selected.has(p.id)}
                      onChange={() =>
                        setSelected((s) => {
                          const n = new Set(s);
                          if (n.has(p.id)) n.delete(p.id);
                          else n.add(p.id);
                          return n;
                        })
                      }
                    />
                  </Table.Td>
                  <Table.Td>{p.name || <Text c="dimmed" span size="sm">—</Text>}</Table.Td>
                  <Table.Td>{p.email ?? <Text c="dimmed" span size="sm">—</Text>}</Table.Td>
                  <Table.Td>
                    <Tooltip label={new Date(p.ignoredAt).toLocaleString()}>
                      <Text size="sm">{relTime(p.ignoredAt)}</Text>
                    </Tooltip>
                  </Table.Td>
                  <Table.Td>
                    <Tooltip label="Remove from Ignore list">
                      <ActionIcon variant="subtle" onClick={() => remove([p.id])}>
                        <IconArrowBackUp size={16} />
                      </ActionIcon>
                    </Tooltip>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
