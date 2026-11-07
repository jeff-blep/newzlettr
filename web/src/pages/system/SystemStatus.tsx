import { Alert, Card, Center, Loader, Table, Text } from "@mantine/core";
import { useSystemStatus } from "../../api/settings";
import { PageToolbar } from "../../components/PageToolbar";

const bytes = (n: number) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`);

function uptime(s: number): string {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return [d && `${d}d`, (d || h) && `${h}h`, `${m}m`].filter(Boolean).join(" ");
}

export function SystemStatus() {
  const { data, isPending, error } = useSystemStatus();
  if (isPending) return <Center p="xl"><Loader /></Center>;
  if (error || !data) return <Alert color="red">{String(error)}</Alert>;

  const rows: [string, string][] = [
    ["Version", data.version],
    ["Node", data.nodeVersion],
    ["OS", `${data.platform} (${data.arch})${data.runningInDocker ? " — Docker" : ""}`],
    ["Time Zone", data.timezone],
    ["Uptime", uptime(data.uptimeSeconds)],
    ["Started", new Date(data.startedAt).toLocaleString()],
    ["AppData Directory", data.configDir],
    ["Database", `${data.databaseFile} (${bytes(data.databaseSizeBytes)})`],
    ["Log File", data.logFile],
  ];

  return (
    <>
      <PageToolbar title="Status" />
      <Card bg="var(--nz-sidebar-bg)" maw={900}>
        <Text fw={600} size="lg" mb="sm">
          About
        </Text>
        <Table withRowBorders={false} verticalSpacing={6}>
          <Table.Tbody>
            {rows.map(([k, v]) => (
              <Table.Tr key={k}>
                <Table.Td w={200} c="dimmed" ta="right" fw={600}>
                  {k}
                </Table.Td>
                <Table.Td style={{ wordBreak: "break-all" }}>{v}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Card>
    </>
  );
}
