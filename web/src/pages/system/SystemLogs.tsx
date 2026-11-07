import { useState } from "react";
import { Alert, Badge, Button, Card, Center, Code, Group, Loader, Select, Table, Text, TextInput, Tooltip } from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { IconDownload, IconRefresh, IconSearch } from "@tabler/icons-react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { get } from "../../api/client";
import { PageToolbar } from "../../components/PageToolbar";

interface LogEntry {
  time: string;
  level: "trace" | "debug" | "info" | "warn" | "error" | "fatal";
  component?: string;
  msg: string;
  extra?: Record<string, unknown>;
}

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
          Newest first · last 500 matching entries. Change verbosity in Settings → General.
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
                  <Table.Th w={170}>Time</Table.Th>
                  <Table.Th w={80}>Level</Table.Th>
                  <Table.Th w={120}>Component</Table.Th>
                  <Table.Th>Message</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {data.map((e, i) => (
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
