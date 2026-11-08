import { ActionIcon, Alert, Badge, Card, Center, Loader, Table, Text, Tooltip } from "@mantine/core";
import { IconPlayerPlay } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { get, post } from "../../api/client";
import { notifyError } from "../../components/notify";
import { PageToolbar } from "../../components/PageToolbar";
import { SortTh, useSortedRows } from "../../components/sortable";

interface TaskInfo {
  id: string;
  name: string;
  intervalMs: number;
  lastStartedAt: string | null;
  lastDurationMs: number | null;
  lastResult: "ok" | "failed" | null;
  lastMessage: string | null;
  nextRunAt: string | null;
  running: boolean;
}

const every = (ms: number) => (ms >= 3_600_000 ? `${ms / 3_600_000} hour${ms === 3_600_000 ? "" : "s"}` : `${Math.round(ms / 60_000)} minutes`);

export function relTime(iso: string | null): string {
  if (!iso) return "—";
  const diff = new Date(iso).getTime() - Date.now();
  const abs = Math.abs(diff);
  const unit = abs < 60_000 ? [Math.round(abs / 1000), "second"] : abs < 3_600_000 ? [Math.round(abs / 60_000), "minute"] : abs < 86_400_000 ? [Math.round(abs / 3_600_000), "hour"] : [Math.round(abs / 86_400_000), "day"];
  const s = `${unit[0]} ${unit[1]}${unit[0] === 1 ? "" : "s"}`;
  return diff >= 0 ? `in ${s}` : `${s} ago`;
}

export function SystemTasks() {
  const qc = useQueryClient();
  const { data, isPending, error } = useQuery({ queryKey: ["system", "tasks"], queryFn: () => get<TaskInfo[]>("/api/system/tasks"), refetchInterval: 5000 });
  const run = useMutation({
    mutationFn: (id: string) => post<TaskInfo>(`/api/system/tasks/${id}/run`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["system"] }),
    onError: (e) => notifyError(e, "Task failed to start"),
  });
  const { rows, sort, toggle } = useSortedRows(
    "tasks",
    data,
    {
      name: (t: TaskInfo) => t.name,
      interval: (t: TaskInfo) => t.intervalMs,
      last: (t: TaskInfo) => (t.lastStartedAt ? Date.parse(t.lastStartedAt) : null),
      result: (t: TaskInfo) => (t.running ? "running" : t.lastResult),
      next: (t: TaskInfo) => (t.nextRunAt ? Date.parse(t.nextRunAt) : null),
    },
    { key: "name", dir: "asc" },
  );

  if (isPending) return <Center p="xl"><Loader /></Center>;
  if (error || !data) return <Alert color="red">{String(error)}</Alert>;

  return (
    <>
      <PageToolbar title="Tasks" />
      <Card bg="var(--nz-sidebar-bg)" p={0}>
        <Table verticalSpacing="sm" highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <SortTh label="Name" column="name" sort={sort} onSort={toggle} />
              <SortTh label="Interval" column="interval" sort={sort} onSort={toggle} />
              <SortTh label="Last Execution" column="last" sort={sort} onSort={toggle} />
              <SortTh label="Last Result" column="result" sort={sort} onSort={toggle} />
              <SortTh label="Next Execution" column="next" sort={sort} onSort={toggle} />
              <Table.Th w={60} />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map((t) => (
              <Table.Tr key={t.id}>
                <Table.Td>{t.name}</Table.Td>
                <Table.Td>{every(t.intervalMs)}</Table.Td>
                <Table.Td>
                  <Tooltip label={t.lastStartedAt ? new Date(t.lastStartedAt).toLocaleString() : "never"}>
                    <Text size="sm">{relTime(t.lastStartedAt)}</Text>
                  </Tooltip>
                </Table.Td>
                <Table.Td>
                  {t.running ? (
                    <Badge variant="light">Running</Badge>
                  ) : t.lastResult ? (
                    <Tooltip label={t.lastMessage ?? ""} disabled={!t.lastMessage}>
                      <Badge variant="light" color={t.lastResult === "ok" ? "green" : "red"}>
                        {t.lastResult === "ok" ? t.lastMessage ?? "OK" : "Failed"}
                      </Badge>
                    </Tooltip>
                  ) : (
                    "—"
                  )}
                </Table.Td>
                <Table.Td>{t.running ? "—" : relTime(t.nextRunAt)}</Table.Td>
                <Table.Td>
                  <Tooltip label="Run now">
                    <ActionIcon variant="subtle" onClick={() => run.mutate(t.id)} loading={t.running || (run.isPending && run.variables === t.id)}>
                      <IconPlayerPlay size={16} />
                    </ActionIcon>
                  </Tooltip>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Card>
    </>
  );
}
