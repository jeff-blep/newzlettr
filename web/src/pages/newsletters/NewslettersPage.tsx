import { useState } from "react";
import { ActionIcon, Alert, Badge, Button, Card, Center, Group, Loader, Menu, Modal, Stack, Switch, Table, Text, Tooltip } from "@mantine/core";
import { IconDots, IconEye, IconPencil, IconPlus, IconSend, IconTestPipe, IconTrash } from "@tabler/icons-react";
import type { Newsletter, SendRecord } from "../../../../shared/types";
import { useNewsletterMutations, useNewsletters } from "../../api/newsletters";
import { notifyError, notifyOk } from "../../components/notify";
import { PageToolbar } from "../../components/PageToolbar";
import { relTime } from "../system/SystemTasks";
import { NewsletterModal } from "./NewsletterModal";
import { PreviewModal, TestModal } from "./SendModals";

export function SendStatusBadge({ rec }: { rec: SendRecord }) {
  const map = { sent: "green", failed: "red", skipped: "yellow", running: "blue" } as const;
  const warn = rec.status === "sent" && rec.error;
  return (
    <Tooltip label={rec.error ?? `${rec.recipientCount} recipient${rec.recipientCount === 1 ? "" : "s"}`} multiline maw={360}>
      <Badge variant="light" color={warn ? "yellow" : map[rec.status]} size="sm">
        {warn ? "sent*" : rec.status}
      </Badge>
    </Tooltip>
  );
}

export function NewslettersPage() {
  const { data, isPending, error } = useNewsletters();
  const m = useNewsletterMutations();
  const [editing, setEditing] = useState<Newsletter | "new" | null>(null);
  const [deleting, setDeleting] = useState<Newsletter | null>(null);
  const [sending, setSending] = useState<Newsletter | null>(null);
  const [testing, setTesting] = useState<Newsletter | null>(null);
  const [previewing, setPreviewing] = useState<Newsletter | null>(null);

  if (isPending) return <Center p="xl"><Loader /></Center>;
  if (error || !data) return <Alert color="red">{String(error)}</Alert>;

  return (
    <>
      <PageToolbar
        title="Newsletters"
        actions={
          <Button leftSection={<IconPlus size={16} />} onClick={() => setEditing("new")}>
            New Newsletter
          </Button>
        }
      />
      <Card bg="var(--nz-sidebar-bg)" p={0}>
        {data.length === 0 ? (
          <Center p="xl">
            <Stack align="center" gap="xs">
              <Text c="dimmed">No newsletters yet.</Text>
              <Text size="sm" c="dimmed">
                A newsletter pairs a template with a schedule and a list of recipients.
              </Text>
              <Button variant="light" onClick={() => setEditing("new")}>
                Create one
              </Button>
            </Stack>
          </Center>
        ) : (
          <Table verticalSpacing="sm" highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th w={70}>Enabled</Table.Th>
                <Table.Th>Name</Table.Th>
                <Table.Th>Schedule</Table.Th>
                <Table.Th>Next send</Table.Th>
                <Table.Th>Last send</Table.Th>
                <Table.Th>Audience</Table.Th>
                <Table.Th w={90} />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {data.map((n) => (
                <Table.Tr key={n.id} opacity={n.enabled ? 1 : 0.65}>
                  <Table.Td>
                    <Switch
                      checked={n.enabled}
                      onChange={(e) => {
                        const enabled = e.currentTarget.checked;
                        m.toggle.mutate(
                          { id: n.id, enabled },
                          { onSuccess: () => notifyOk(`“${n.name}” ${enabled ? "will send on schedule" : "is paused"}`, enabled ? "Enabled" : "Disabled"), onError: (err) => notifyError(err) },
                        );
                      }}
                      aria-label={`${n.enabled ? "Disable" : "Enable"} ${n.name}`}
                    />
                  </Table.Td>
                  <Table.Td>
                    <Text fw={500} c="gray.1" style={{ cursor: "pointer" }} onClick={() => setEditing(n)}>
                      {n.name}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {n.templateName ? `Template: ${n.templateName}` : <Text span c="red" size="xs">No template</Text>}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{n.scheduleDescription}</Text>
                  </Table.Td>
                  <Table.Td>
                    {n.nextRuns[0] ? (
                      <Tooltip label={new Date(n.nextRuns[0]).toLocaleString()}>
                        <Text size="sm">{relTime(n.nextRuns[0])}</Text>
                      </Tooltip>
                    ) : (
                      <Text size="sm" c="dimmed">
                        {n.enabled ? "—" : "Paused"}
                      </Text>
                    )}
                  </Table.Td>
                  <Table.Td>
                    {n.lastSend ? (
                      <Group gap={6} wrap="nowrap">
                        <SendStatusBadge rec={n.lastSend} />
                        <Text size="xs" c="dimmed">
                          {relTime(n.lastSend.startedAt)}
                        </Text>
                      </Group>
                    ) : (
                      <Text size="sm" c="dimmed">
                        Never
                      </Text>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" c={n.audienceCount ? undefined : "red"}>
                      {n.audienceCount} {n.allRecipients ? "(all)" : ""}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Group gap={2} justify="flex-end" wrap="nowrap">
                      <Tooltip label="Edit">
                        <ActionIcon variant="subtle" onClick={() => setEditing(n)}>
                          <IconPencil size={16} />
                        </ActionIcon>
                      </Tooltip>
                      <Menu position="bottom-end" width={200}>
                        <Menu.Target>
                          <ActionIcon variant="subtle" aria-label="More actions">
                            <IconDots size={16} />
                          </ActionIcon>
                        </Menu.Target>
                        <Menu.Dropdown>
                          <Menu.Item leftSection={<IconEye size={16} />} onClick={() => setPreviewing(n)} disabled={!n.templateId}>
                            Preview
                          </Menu.Item>
                          <Menu.Item leftSection={<IconTestPipe size={16} />} onClick={() => setTesting(n)} disabled={!n.templateId}>
                            Send test to…
                          </Menu.Item>
                          <Menu.Item leftSection={<IconSend size={16} />} onClick={() => setSending(n)} disabled={!n.templateId || !n.audienceCount}>
                            Send now
                          </Menu.Item>
                          <Menu.Divider />
                          <Menu.Item leftSection={<IconTrash size={16} />} color="red" onClick={() => setDeleting(n)}>
                            Delete
                          </Menu.Item>
                        </Menu.Dropdown>
                      </Menu>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Card>

      {editing && <NewsletterModal newsletter={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
      {previewing && <PreviewModal newsletter={previewing} onClose={() => setPreviewing(null)} />}
      {testing && <TestModal newsletter={testing} onClose={() => setTesting(null)} />}

      <Modal opened={!!sending} onClose={() => setSending(null)} title="Send now?" centered>
        <Text size="sm">
          Send <b>{sending?.name}</b> to <b>{sending?.audienceCount}</b> recipient{sending?.audienceCount === 1 ? "" : "s"} right now? This doesn't affect the schedule.
        </Text>
        <Group justify="flex-end" mt="lg">
          <Button variant="default" onClick={() => setSending(null)}>
            Cancel
          </Button>
          <Button
            leftSection={<IconSend size={16} />}
            loading={m.send.isPending}
            onClick={() =>
              sending &&
              m.send.mutate(
                { id: sending.id },
                {
                  onSuccess: (r) => {
                    if (r.status === "sent") notifyOk(`Sent to ${r.recipientCount} recipient${r.recipientCount === 1 ? "" : "s"}${r.error ? " (with warnings — see Activity)" : ""}`, "Sent");
                    else notifyError(new Error(r.error ?? r.status), "Send failed");
                    setSending(null);
                  },
                  onError: (e) => notifyError(e, "Send failed"),
                },
              )
            }
          >
            Send now
          </Button>
        </Group>
      </Modal>

      <Modal opened={!!deleting} onClose={() => setDeleting(null)} title="Delete newsletter?" centered>
        <Text size="sm">
          Delete <b>{deleting?.name}</b>? Its template and recipients are kept; past sends stay in Activity.
        </Text>
        <Group justify="flex-end" mt="lg">
          <Button variant="default" onClick={() => setDeleting(null)}>
            Cancel
          </Button>
          <Button
            color="red"
            loading={m.remove.isPending}
            onClick={() =>
              deleting &&
              m.remove.mutate(deleting.id, {
                onSuccess: () => {
                  notifyOk(`“${deleting.name}” deleted`, "Deleted");
                  setDeleting(null);
                },
                onError: (e) => notifyError(e),
              })
            }
          >
            Delete
          </Button>
        </Group>
      </Modal>
    </>
  );
}
