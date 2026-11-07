import { useState } from "react";
import { Alert, Badge, Button, Card, Center, Code, Group, Loader, Select, Table, Text, TextInput, Tooltip } from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { IconDownload, IconRefresh, IconSearch } from "@tabler/icons-react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { get } from "../../api/client";
import { PageToolbar } from "../../components/PageToolbar";
import { SortTh, useSortedRows } from "../../components/sortable";

interface LogEntry {
  time: string;
  level: "trace" | "debug" | "info" | "warn" | "error" | "fatal";
  component?: string;
  msg: string;
  extra?: Record<string, unknown>;
}

const RANK: Record<LogEntry["level"], number> = { trace: 0, debug: 1, info: 2, warn: 3, error: 4, fatal: 5 };
const COLOR: Record<LogEntry["level"], string> = { trace: "gray", debug: "gray", info: "blue", warn: "yellow", error: "red", fatal: "red" };

export function SystemLogs() {
  const [level, setLevel] = useState("info");
  const [q, setQ] = useState("");
  const [debounced] = useDebouncedValue(q, 300);
  const [open, setOpen] = useState<number | null>(null);
  const { data, isPending, error, refetch, isFetching } = useQuery({
    queryKey: ["logs", level, debounced],
    queryFn: () => get<LogEntry[]>(`/api/system/logs?level=${level}&limit=500${debounced ? `&q=${encodeURIComponent(debounced)}` : ""}`),
    placeholderData: keepPreviousData,
    refetchInterval: 10_000,
  });
  const sorted = useSortedRows(
    "logs",
    data,
    {
      time: (e: LogEntry) => e.time,
      level: (e: LogEntry) => RANK[e.level],
      component: (e: LogEntry) => e.component ?? "app",
      message: (e: LogEntry) => e.msg,
    },
    { key: "time", dir: "desc" },
  );

  return (
    <>
      <PageToolbar
        title="Logs"
        actions={
          <>
            <Button variant="default" leftSection={<IconRefresh size={16} />} loading={isFetching} onClick={() => void refetch()}>
              Refresh
            </Button>
            <Button variant="default" leftSection={<IconDownload size={16} />} component="a" href="/api/system/logs/download">
              Download
            </Button>
          </>
        }
      />
      <Group mb="sm">
        <Select
          value={level}
          onChange={(v) => v && setLevel(v)}
          data={[
            { value: "error", label: "Errors only" },
            { value: "warn", label: "Warnings and up" },
            { value: "info", label: "Info and up" },
            { value: "debug", label: "Debug and up" },
            { value: "trace", label: "Everything" },
          ]}
          allowDeselect={false}
          w={190}
        />
        <TextInput leftSection={<IconSearch size={16} />} placeholder="Search" value={q} onChange={(e) => setQ(e.currentTarget.value)} w={300} />
        <Text size="xs" c="dimmed">
          Last 500 matching entries. Change verbosity in Settings → General.
        </Text>
      </Group>
      {isPending ? (
        <Center p="xl">
          <Loader />
        </Center>
      ) : error || !data ? (
        <Alert color="red">{String(error)}</Alert>
      ) : (
        <Card bg="var(--nz-sidebar-bg)" p={0}>
          {data.length === 0 ? (
            <Center p="xl">
              <Text c="dimmed">No log entries match.</Text>
            </Center>
          ) : (
            <Table verticalSpacing={6} highlightOnHover fz="sm">
              <Table.Thead>
                <Table.Tr>
                  <SortTh label="Time" column="time" sort={sorted.sort} onSort={sorted.toggle} w={190} />
                  <SortTh label="Level" column="level" sort={sorted.sort} onSort={sorted.toggle} w={100} />
                  <SortTh label="Component" column="component" sort={sorted.sort} onSort={sorted.toggle} w={140} />
                  <SortTh label="Message" column="message" sort={sorted.sort} onSort={sorted.toggle} />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {sorted.rows.map((e, i) => (
                  <Table.Tr key={`${e.time}-${i}`} onClick={() => setOpen(open === i ? null : i)} style={{ cursor: e.extra ? "pointer" : undefined }}>
                    <Table.Td>
                      <Tooltip label={e.time}>
                        <Text size="xs" c="dimmed">
                          {new Date(e.time).toLocaleString()}
                        </Text>
                      </Tooltip>
                    </Table.Td>
                    <Table.Td>
                      <Badge size="xs" variant="light" color={COLOR[e.level]}>
                        {e.level}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Text size="xs" c="dimmed">
                        {e.component ?? "app"}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{e.msg}</Text>
                      {e.extra && open === i && (
                        <Code block mt={6} fz={11}>
                          {JSON.stringify(e.extra, null, 2)}
                        </Code>
                      )}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}
        </Card>
      )}
    </>
  );
}
