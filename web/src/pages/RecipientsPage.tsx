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
  SegmentedControl,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { IconCloudDownload, IconPencil, IconPlus, IconRefresh, IconSearch, IconTrash } from "@tabler/icons-react";
import type { PlexAccessStatus, Recipient } from "../../../shared/types";
import { useRecipientMutations, useRecipients } from "../api/media";
import { notifyError, notifyOk } from "../components/notify";
import { PageToolbar } from "../components/PageToolbar";
import { SortTh, useSortedRows } from "../components/sortable";

const SOURCE: Record<Recipient["source"], { label: string; color: string }> = {
  manual: { label: "Manual", color: "gray" },
  plex: { label: "Plex", color: "yellow" },
  tautulli: { label: "Tautulli", color: "orange" },
  import: { label: "v1 import", color: "blue" },
};

const ACCESS: Record<PlexAccessStatus | "unknown", { label: string; color: string; help: string }> = {
  libraries: { label: "", color: "green", help: "Has these libraries" },
  no_libraries: { label: "Friend · no libraries", color: "yellow", help: "Still a Plex friend, but every library is switched off" },
  invited: { label: "Invite pending", color: "blue", help: "Invited to your server but hasn't accepted yet" },
  no_access: { label: "No Plex access", color: "red", help: "Not shared on your Plex server (removed, or never added)" },
  unknown: { label: "Not checked", color: "gray", help: "Click “Refresh Plex access” to check" },
};

export function PlexAccessBadge({ access }: { access: Recipient["plexAccess"] }) {
  const key = access?.status ?? "unknown";
  const a = ACCESS[key];
  const label = key === "libraries" ? access!.libraries.join(" · ") : a.label;
  const tip = `${a.help}${access ? ` · checked ${new Date(access.checkedAt).toLocaleString()}` : ""}`;
  return (
    <Tooltip label={tip} multiline maw={320}>
      <Badge variant="light" color={a.color} size="sm" style={{ textTransform: "none" }}>
        {label}
      </Badge>
    </Tooltip>
  );
}

type AccessFilter = "all" | "libraries" | "no_libraries" | "no_access";

export function RecipientsPage() {
  const { data, isPending, error } = useRecipients();
  const m = useRecipientMutations();
  const [filter, setFilter] = useState("");
  const [access, setAccess] = useState<AccessFilter>("all");
  const [editing, setEditing] = useState<Recipient | "new" | null>(null);
  const [deleting, setDeleting] = useState<Recipient | null>(null);

  const filtered = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return (data ?? [])
      .filter((r) => !f || r.name.toLowerCase().includes(f) || r.email.includes(f))
      .filter((r) => access === "all" || accessGroup(r) === access);
  }, [data, filter, access]);
  const { rows, sort, toggle } = useSortedRows(
    "recipients",
    filtered,
    {
      enabled: (r: Recipient) => r.enabled,
      name: (r: Recipient) => r.name,
      email: (r: Recipient) => r.email,
      access: (r: Recipient) => accessSortKey(r),
      source: (r: Recipient) => SOURCE[r.source].label,
    },
    { key: "name", dir: "asc" },
  );

  if (isPending) return <Center p="xl"><Loader /></Center>;
  if (error || !data) return <Alert color="red">{String(error)}</Alert>;
  const enabled = data.filter((r) => r.enabled).length;
  const count = (g: AccessFilter) => data.filter((r) => accessGroup(r) === g).length;

  return (
    <>
      <PageToolbar
        title="Recipients"
        actions={
          <>
            <Button
              variant="default"
              leftSection={<IconRefresh size={16} />}
              loading={m.syncPlex.isPending}
              onClick={() =>
                m.syncPlex.mutate(undefined, {
                  onSuccess: (s) =>
                    notifyOk(
                      `${s.libraries} with libraries · ${s.noLibraries} friends without libraries · ${s.invited} invite${s.invited === 1 ? "" : "s"} pending · ${s.noAccess} without Plex access.`,
                      "Plex access refreshed",
                    ),
                  onError: (e) => notifyError(e, "Couldn't check Plex"),
                })
              }
            >
              Refresh Plex access
            </Button>
            <Button
              variant="default"
              leftSection={<IconCloudDownload size={16} />}
              loading={m.importPlex.isPending}
              onClick={() =>
                m.importPlex.mutate(undefined, {
                  onSuccess: (r) =>
                    notifyOk(
                      [
                        `${r.found} people have access to your server.`,
                        r.added ? `${r.added} new — added switched off; turn them on to include them.` : "Nobody new.",
                        r.alreadyPresent ? `${r.alreadyPresent} already here.` : "",
                        r.updated ? `${r.updated} got a name filled in.` : "",
                        r.skippedPending ? `${r.skippedPending} haven't accepted their invite yet (skipped).` : "",
                        r.skippedNoEmail ? `${r.skippedNoEmail} have no email (managed users, skipped).` : "",
                      ]
                        .filter(Boolean)
                        .join(" "),
                      "Imported from Plex",
                    ),
                  onError: (e) => notifyError(e, "Import failed"),
                })
              }
            >
              Import from Plex
            </Button>
            <Button leftSection={<IconPlus size={16} />} onClick={() => setEditing("new")}>
              Add Recipient
            </Button>
          </>
        }
      />

      <Group justify="space-between" mb="sm">
        <Group gap="sm">
        <TextInput
          leftSection={<IconSearch size={16} />}
          placeholder="Filter by name or email"
          value={filter}
          onChange={(e) => setFilter(e.currentTarget.value)}
          w={280}
        />
        <SegmentedControl
          size="sm"
          value={access}
          onChange={(v) => setAccess(v as AccessFilter)}
          data={[
            { value: "all", label: `All (${data.length})` },
            { value: "libraries", label: `With libraries (${count("libraries")})` },
            { value: "no_libraries", label: `No libraries (${count("no_libraries")})` },
            { value: "no_access", label: `No access (${count("no_access")})` },
          ]}
        />
        </Group>
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
                Add people by hand, or import everyone you've shared your Plex server with.
              </Text>
            </Stack>
          </Center>
        ) : (
          <Table verticalSpacing="xs" highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <SortTh label="Enabled" column="enabled" sort={sort} onSort={toggle} w={100} />
                <SortTh label="Name" column="name" sort={sort} onSort={toggle} />
                <SortTh label="Email" column="email" sort={sort} onSort={toggle} />
                <SortTh label="Plex access" column="access" sort={sort} onSort={toggle} />
                <SortTh label="Source" column="source" sort={sort} onSort={toggle} />
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
                    <PlexAccessBadge access={r.plexAccess} />
                  </Table.Td>
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
                  <Table.Td colSpan={6}>
                    <Text c="dimmed" ta="center" size="sm" p="md">
                      Nobody matches these filters.
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

/** Filter bucket for a recipient. Invites count as "no access" until accepted; unchecked = all only. */
function accessGroup(r: Recipient): AccessFilter | "unknown" {
  const st = r.plexAccess?.status;
  if (!st) return "unknown";
  if (st === "invited") return "no_access";
  return st;
}

/** Sort order for the access column: with libraries (by library list), no libraries, invited, no access; unchecked last. */
function accessSortKey(r: Recipient): string | null {
  const a = r.plexAccess;
  if (!a) return null;
  return { libraries: `1 ${a.libraries.join(" ")}`, no_libraries: "2", invited: "3", no_access: "4" }[a.status];
}
