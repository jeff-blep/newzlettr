import { useMemo, useState } from "react";
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Center,
  Group,
  Loader,
  Modal,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { IconCloudDownload, IconPencil, IconPlus, IconSearch, IconTrash } from "@tabler/icons-react";
import type { Recipient } from "../../../shared/types";
import { useRecipientMutations, useRecipients } from "../api/media";
import { notifyError, notifyOk } from "../components/notify";
import { PageToolbar } from "../components/PageToolbar";

const SOURCE: Record<Recipient["source"], { label: string; color: string }> = {
  manual: { label: "Manual", color: "gray" },
  tautulli: { label: "Tautulli", color: "orange" },
  import: { label: "v1 import", color: "blue" },
};

export function RecipientsPage() {
  const { data, isPending, error } = useRecipients();
  const m = useRecipientMutations();
  const [filter, setFilter] = useState("");
  const [editing, setEditing] = useState<Recipient | "new" | null>(null);
  const [deleting, setDeleting] = useState<Recipient | null>(null);

  const rows = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return (data ?? []).filter((r) => !f || r.name.toLowerCase().includes(f) || r.email.includes(f));
  }, [data, filter]);

  if (isPending) return <Center p="xl"><Loader /></Center>;
  if (error || !data) return <Alert color="red">{String(error)}</Alert>;
  const enabled = data.filter((r) => r.enabled).length;

  return (
    <>
      <PageToolbar
        title="Recipients"
        actions={
          <>
            <Button
              variant="default"
              leftSection={<IconCloudDownload size={16} />}
              loading={m.importTautulli.isPending}
              onClick={() =>
                m.importTautulli.mutate(undefined, {
                  onSuccess: (r) =>
                    notifyOk(
                      `${r.added} new (added disabled — switch them on to include them), ${r.updated} updated, ${r.alreadyPresent} already here${r.skippedNoEmail ? `, ${r.skippedNoEmail} without an email` : ""}.`,
                      "Imported from Tautulli",
                    ),
                  onError: (e) => notifyError(e, "Import failed"),
                })
              }
            >
              Import from Tautulli
            </Button>
            <Button leftSection={<IconPlus size={16} />} onClick={() => setEditing("new")}>
              Add Recipient
            </Button>
          </>
        }
      />

      <Group justify="space-between" mb="sm">
        <TextInput
          leftSection={<IconSearch size={16} />}
          placeholder="Filter by name or email"
          value={filter}
          onChange={(e) => setFilter(e.currentTarget.value)}
          w={320}
        />
        <Text size="sm" c="dimmed">
          {data.length} recipients · {enabled} enabled
        </Text>
      </Group>

      <Card bg="var(--nz-sidebar-bg)" p={0}>
        {data.length === 0 ? (
          <Center p="xl">
            <Stack align="center" gap="xs">
              <Text c="dimmed">No recipients yet.</Text>
              <Text size="sm" c="dimmed">
                Add people by hand, or import your Plex users' emails from Tautulli.
              </Text>
            </Stack>
          </Center>
        ) : (
          <Table verticalSpacing="xs" highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th w={70}>Enabled</Table.Th>
                <Table.Th>Name</Table.Th>
                <Table.Th>Email</Table.Th>
                <Table.Th>Source</Table.Th>
                <Table.Th w={90} />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map((r) => (
                <Table.Tr key={r.id} opacity={r.enabled ? 1 : 0.55}>
                  <Table.Td>
                    <Switch
                      checked={r.enabled}
                      onChange={(e) => m.update.mutate({ id: r.id, enabled: e.currentTarget.checked }, { onError: (err) => notifyError(err) })}
                      aria-label={`${r.enabled ? "Disable" : "Enable"} ${r.email}`}
                    />
                  </Table.Td>
                  <Table.Td>{r.name || <Text c="dimmed" span size="sm">—</Text>}</Table.Td>
                  <Table.Td>{r.email}</Table.Td>
                  <Table.Td>
                    <Badge variant="light" color={SOURCE[r.source].color} size="sm">
                      {SOURCE[r.source].label}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Group gap={4} justify="flex-end" wrap="nowrap">
                      <Tooltip label="Edit">
                        <ActionIcon variant="subtle" onClick={() => setEditing(r)}>
                          <IconPencil size={16} />
                        </ActionIcon>
                      </Tooltip>
                      <Tooltip label="Delete">
                        <ActionIcon variant="subtle" color="red" onClick={() => setDeleting(r)}>
                          <IconTrash size={16} />
                        </ActionIcon>
                      </Tooltip>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
              {rows.length === 0 && (
                <Table.Tr>
                  <Table.Td colSpan={5}>
                    <Text c="dimmed" ta="center" size="sm" p="md">
                      Nobody matches “{filter}”.
                    </Text>
                  </Table.Td>
                </Table.Tr>
              )}
            </Table.Tbody>
          </Table>
        )}
      </Card>

      {editing && <RecipientModal recipient={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}

      <Modal opened={!!deleting} onClose={() => setDeleting(null)} title="Delete recipient?" centered>
        <Text size="sm">
          Remove <b>{deleting?.email}</b>?
          {deleting?.newsletterCount ? ` They'll also be removed from ${deleting.newsletterCount} newsletter${deleting.newsletterCount > 1 ? "s" : ""}.` : ""} To stop
          emailing someone but keep them on file, switch them off instead.
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
                  notifyOk(`${deleting.email} removed`, "Deleted");
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

function RecipientModal({ recipient, onClose }: { recipient: Recipient | null; onClose: () => void }) {
  const m = useRecipientMutations();
  const [name, setName] = useState(recipient?.name ?? "");
  const [email, setEmail] = useState(recipient?.email ?? "");
  const [enabled, setEnabled] = useState(recipient?.enabled ?? true);
  const [error, setError] = useState<string | null>(null);
  const busy = m.create.isPending || m.update.isPending;

  return (
    <Modal opened onClose={onClose} title={recipient ? "Edit Recipient" : "Add Recipient"} centered>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          const done = {
            onSuccess: () => {
              notifyOk(recipient ? "Recipient updated" : `${email} added`);
              onClose();
            },
            onError: (err: Error) => setError(err.message),
          };
          if (recipient) m.update.mutate({ id: recipient.id, name, email, enabled }, done);
          else m.create.mutate({ name, email, enabled }, done);
        }}
      >
        <Stack>
          {error && <Alert color="red" variant="light">{error}</Alert>}
          <TextInput label="Name" value={name} onChange={(e) => setName(e.currentTarget.value)} placeholder="Optional" data-autofocus />
          <TextInput label="Email" type="email" value={email} onChange={(e) => setEmail(e.currentTarget.value)} required />
          <Switch label="Enabled (receives newsletters)" checked={enabled} onChange={(e) => setEnabled(e.currentTarget.checked)} />
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={busy}>
              {recipient ? "Save" : "Add"}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
