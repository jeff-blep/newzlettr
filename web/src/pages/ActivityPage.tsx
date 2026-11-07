import { useState } from "react";
import { Alert, Badge, Card, Center, Group, Loader, Pagination, SegmentedControl, Stack, Table, Text, Tooltip } from "@mantine/core";
import { useActivity } from "../api/newsletters";
import { PageToolbar } from "../components/PageToolbar";
import { SortTh, useSortState } from "../components/sortable";
import { SendStatusBadge } from "./newsletters/NewslettersPage";
import { relTime } from "./system/SystemTasks";

const TRIGGER: Record<string, string> = { scheduled: "Scheduled", manual: "Send now", test: "Test" };
const PAGE = 25;

export function ActivityPage() {
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(0);
  const { sort, toggle } = useSortState("activity", ["when", "newsletter", "type", "status", "recipients"], { key: "when", dir: "desc" });
  const onSort = (k: typeof sort.key) => {
    toggle(k);
    setPage(0);
  };
  const { data, isPending, error } = useActivity(status === "all" ? null : status, page, sort, PAGE);

  return (
    <>
      <PageToolbar
        title="Activity"
        actions={
          <SegmentedControl
            value={status}
            onChange={(v) => {
              setStatus(v);
              setPage(0);
            }}
            data={[
              { value: "all", label: "All" },
              { value: "sent", label: "Sent" },
              { value: "failed", label: "Failed" },
              { value: "skipped", label: "Skipped" },
            ]}
          />
        }
      />
      {isPending ? (
        <Center p="xl">
          <Loader />
        </Center>
      ) : error || !data ? (
        <Alert color="red">{String(error)}</Alert>
      ) : (
        <Stack>
          <Card bg="var(--nz-sidebar-bg)" p={0}>
            {data.records.length === 0 ? (
              <Center p="xl">
                <Text c="dimmed">{status === "all" ? "Nothing has been sent yet." : `No ${status} sends.`}</Text>
              </Center>
            ) : (
              <Table verticalSpacing="sm" highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <SortTh label="When" column="when" sort={sort} onSort={onSort} />
                    <SortTh label="Newsletter" column="newsletter" sort={sort} onSort={onSort} />
                    <SortTh label="Type" column="type" sort={sort} onSort={onSort} />
                    <SortTh label="Status" column="status" sort={sort} onSort={onSort} />
                    <SortTh label="Recipients" column="recipients" sort={sort} onSort={onSort} />
                    <Table.Th>Details</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {data.records.map((r) => (
                    <Table.Tr key={r.id}>
                      <Table.Td>
                        <Tooltip label={new Date(r.startedAt).toLocaleString()}>
                          <Text size="sm">{relTime(r.startedAt)}</Text>
                        </Tooltip>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm">{r.newsletterName || "(deleted)"}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Badge variant="outline" color="gray" size="sm">
                          {TRIGGER[r.trigger] ?? r.trigger}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        <SendStatusBadge rec={r} />
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm">{r.status === "sent" ? r.recipientCount : "—"}</Text>
                      </Table.Td>
                      <Table.Td maw={420}>
                        <Text size="xs" c={r.status === "failed" ? "red.4" : "dimmed"} lineClamp={2}>
                          {r.error ?? (r.scheduledFor ? `Slot ${new Date(r.scheduledFor).toLocaleString()}` : "")}
                        </Text>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            )}
          </Card>
          {data.total > PAGE && (
            <Group justify="center">
              <Pagination total={Math.ceil(data.total / PAGE)} value={page + 1} onChange={(p) => setPage(p - 1)} />
            </Group>
          )}
        </Stack>
      )}
    </>
  );
}
