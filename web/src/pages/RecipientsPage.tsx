import { useEffect, useMemo, useState } from "react";
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Center,
  Checkbox,
  Group,
  Loader,
  Menu,
  Modal,
  SegmentedControl,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import {
  IconChevronDown,
  IconCloudDownload,
  IconEyeOff,
  IconListCheck,
  IconListDetails,
  IconPencil,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import { useSearchParams } from "react-router-dom";
import type { PlexAccessStatus, Recipient } from "../../../shared/types";
import { useListMutations, useLists } from "../api/lists";
import { useRecipientMutations, useRecipients } from "../api/media";
import { notifyError, notifyOk } from "../components/notify";
import { PageToolbar } from "../components/PageToolbar";
import { SortTh, useSortedRows } from "../components/sortable";
import { ListModal } from "./ListsPage";

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

/** What a remove dialog is about to act on. */
type Removal = { ids: number[]; label: string; mode: "ignore" | "delete" };

export function RecipientsPage() {
  const { data, isPending, error } = useRecipients();
  const m = useRecipientMutations();
  const lists = useLists();
  const lm = useListMutations();
  const [params, setParams] = useSearchParams();
  const listFilter = params.get("list");
  const setListFilter = (v: string | null) => setParams(v ? { list: v } : {}, { replace: true });

  const [filter, setFilter] = useState("");
  const [access, setAccess] = useState<AccessFilter>("all");
  const [editing, setEditing] = useState<Recipient | "new" | null>(null);
  const [removal, setRemoval] = useState<Removal | null>(null);
  const [newListFromSelection, setNewListFromSelection] = useState(false);
  // Selection is by id and survives switching tabs / searching, so it can be built up across lists.
  const [selected, setSelected] = useState<Set<number>>(new Set());

  // Drop ids that no longer exist (deleted here or elsewhere).
  useEffect(() => {
    if (!data) return;
    const ids = new Set(data.map((r) => r.id));
    setSelected((s) => {
      const next = new Set([...s].filter((id) => ids.has(id)));
      return next.size === s.size ? s : next;
    });
  }, [data]);

  const filtered = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return (data ?? [])
      .filter((r) => !f || r.name.toLowerCase().includes(f) || r.email.includes(f))
      .filter((r) => access === "all" || accessGroup(r) === access)
      .filter((r) => !listFilter || r.listIds.includes(Number(listFilter)));
  }, [data, filter, access, listFilter]);

  const listName = new Map((lists.data ?? []).map((l) => [l.id, l.name]));
  const listNames = (r: Recipient) => r.listIds.map((id) => listName.get(id)).filter((n): n is string => !!n).sort();
  const { rows, sort, toggle } = useSortedRows(
    "recipients",
    filtered,
    {
      name: (r: Recipient) => r.name,
      email: (r: Recipient) => r.email,
      access: (r: Recipient) => accessSortKey(r),
      lists: (r: Recipient) => listNames(r).join(", "),
      source: (r: Recipient) => SOURCE[r.source].label,
    },
    { key: "name", dir: "asc" },
  );

  if (isPending) return <Center p="xl"><Loader /></Center>;
  if (error || !data) return <Alert color="red">{String(error)}</Alert>;

  const count = (g: AccessFilter) => data.filter((r) => accessGroup(r) === g).length;
  const visibleIds = rows.map((r) => r.id);
  const visibleSelected = visibleIds.filter((id) => selected.has(id)).length;
  const hiddenSelected = selected.size - visibleSelected;
  const allVisible = visibleIds.length > 0 && visibleSelected === visibleIds.length;
  const toggleOne = (id: number) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const toggleVisible = () =>
    setSelected((s) => {
      const n = new Set(s);
      if (allVisible) visibleIds.forEach((id) => n.delete(id));
      else visibleIds.forEach((id) => n.add(id));
      return n;
    });
  const changeLists = (listId: number, how: "add" | "remove") => {
    const ids = [...selected];
    lm.members.mutate(
      { id: listId, [how]: ids },
      {
        onSuccess: (r) =>
          notifyOk(
            how === "add"
              ? `${r.added} added to “${r.list.name}”${r.added < ids.length ? ` (${ids.length - r.added} already on it)` : ""}`
              : `${r.removed} removed from “${r.list.name}”`,
            "List updated",
          ),
        onError: (e) => notifyError(e),
      },
    );
  };
  const selectedLabel = `${selected.size} ${selected.size === 1 ? "person" : "people"}`;

  return (
    <>
      <PageToolbar
        title="People"
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
                        r.added ? `${r.added} new — add them to lists to include them in newsletters.` : "Nobody new.",
                        r.alreadyPresent ? `${r.alreadyPresent} already here.` : "",
                        r.updated ? `${r.updated} got a name filled in.` : "",
                        r.skippedIgnored ? `${r.skippedIgnored} on your Ignore list (skipped).` : "",
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
              Add Person
            </Button>
          </>
        }
      />

      <Group justify="space-between" mb="sm">
        <Group gap="sm">
          <TextInput leftSection={<IconSearch size={16} />} placeholder="Filter by name or email" value={filter} onChange={(e) => setFilter(e.currentTarget.value)} w={260} />
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
          <Select
            leftSection={<IconListDetails size={16} />}
            placeholder="All lists"
            data={(lists.data ?? []).map((l) => ({ value: String(l.id), label: `${l.name} (${l.memberCount})` }))}
            value={listFilter}
            onChange={setListFilter}
            clearable
            w={220}
            aria-label="Filter by list"
          />
        </Group>
      </Group>

      {selected.size > 0 && (
        <Card bg="rgba(124, 92, 255, 0.10)" withBorder mb="sm" py={8} px="md" style={{ borderColor: "var(--mantine-color-newz-7)" }}>
          <Group justify="space-between" wrap="wrap" gap="xs">
            <Group gap="xs">
              <Text size="sm" fw={600}>
                {selected.size} selected
              </Text>
              {hiddenSelected > 0 && (
                <Text size="xs" c="dimmed">
                  ({hiddenSelected} not shown in this view)
                </Text>
              )}
              {!allVisible && visibleIds.length > 0 && (
                <Button size="compact-xs" variant="subtle" onClick={toggleVisible}>
                  Select all {visibleIds.length} shown
                </Button>
              )}
            </Group>
            <Group gap="xs">
              <Menu position="bottom-end" width={240}>
                <Menu.Target>
                  <Button size="xs" variant="default" leftSection={<IconListCheck size={14} />} rightSection={<IconChevronDown size={12} />} loading={lm.members.isPending}>
                    Add to list
                  </Button>
                </Menu.Target>
                <Menu.Dropdown>
                  {(lists.data ?? []).map((l) => (
                    <Menu.Item key={l.id} onClick={() => changeLists(l.id, "add")}>
                      {l.name}
                    </Menu.Item>
                  ))}
                  {(lists.data ?? []).length > 0 && <Menu.Divider />}
                  <Menu.Item leftSection={<IconPlus size={14} />} onClick={() => setNewListFromSelection(true)}>
                    New list from selection…
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
              {(lists.data ?? []).length > 0 && (
                <Menu position="bottom-end" width={240}>
                  <Menu.Target>
                    <Button size="xs" variant="default" rightSection={<IconChevronDown size={12} />}>
                      Remove from list
                    </Button>
                  </Menu.Target>
                  <Menu.Dropdown>
                    {(lists.data ?? []).map((l) => (
                      <Menu.Item key={l.id} onClick={() => changeLists(l.id, "remove")}>
                        {l.name}
                      </Menu.Item>
                    ))}
                  </Menu.Dropdown>
                </Menu>
              )}
              <Button size="xs" variant="light" color="orange" leftSection={<IconEyeOff size={14} />} onClick={() => setRemoval({ ids: [...selected], label: selectedLabel, mode: "ignore" })}>
                Ignore
              </Button>
              <Button size="xs" variant="light" color="red" leftSection={<IconTrash size={14} />} onClick={() => setRemoval({ ids: [...selected], label: selectedLabel, mode: "delete" })}>
                Delete
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
            <Stack align="center" gap="xs">
              <Text c="dimmed">Nobody here yet.</Text>
              <Text size="sm" c="dimmed">
                Add people by hand, or import everyone you've shared your Plex server with.
              </Text>
            </Stack>
          </Center>
        ) : (
          <Table verticalSpacing="xs" highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th w={44}>
                  <Checkbox
                    aria-label={allVisible ? "Unselect everyone shown" : "Select everyone shown"}
                    checked={allVisible}
                    indeterminate={visibleSelected > 0 && !allVisible}
                    disabled={visibleIds.length === 0}
                    onChange={toggleVisible}
                  />
                </Table.Th>
                <SortTh label="Name" column="name" sort={sort} onSort={toggle} />
                <SortTh label="Email" column="email" sort={sort} onSort={toggle} />
                <SortTh label="Plex access" column="access" sort={sort} onSort={toggle} />
                <SortTh label="Lists" column="lists" sort={sort} onSort={toggle} />
                <SortTh label="Source" column="source" sort={sort} onSort={toggle} />
                <Table.Th w={120} />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map((r) => (
                <Table.Tr key={r.id} bg={selected.has(r.id) ? "rgba(124, 92, 255, 0.07)" : undefined}>
                  <Table.Td>
                    <Checkbox aria-label={`Select ${r.email}`} checked={selected.has(r.id)} onChange={() => toggleOne(r.id)} />
                  </Table.Td>
                  <Table.Td>{r.name || <Text c="dimmed" span size="sm">—</Text>}</Table.Td>
                  <Table.Td>{r.email}</Table.Td>
                  <Table.Td>
                    <PlexAccessBadge access={r.plexAccess} />
                  </Table.Td>
                  <Table.Td>
                    <Group gap={4}>
                      {listNames(r).map((n) => (
                        <Badge key={n} variant="outline" color="gray" size="sm" style={{ textTransform: "none" }}>
                          {n}
                        </Badge>
                      ))}
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    <Badge variant="light" color={SOURCE[r.source].color} size="sm">
                      {SOURCE[r.source].label}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Group gap={2} justify="flex-end" wrap="nowrap">
                      <Tooltip label="Edit">
                        <ActionIcon variant="subtle" aria-label={`Edit ${r.email}`} onClick={() => setEditing(r)}>
                          <IconPencil size={16} />
                        </ActionIcon>
                      </Tooltip>
                      <Tooltip label="Ignore (remove and don't re-import)">
                        <ActionIcon variant="subtle" color="orange" aria-label={`Ignore ${r.email}`} onClick={() => setRemoval({ ids: [r.id], label: r.email, mode: "ignore" })}>
                          <IconEyeOff size={16} />
                        </ActionIcon>
                      </Tooltip>
                      <Tooltip label="Delete">
                        <ActionIcon variant="subtle" color="red" aria-label={`Delete ${r.email}`} onClick={() => setRemoval({ ids: [r.id], label: r.email, mode: "delete" })}>
                          <IconTrash size={16} />
                        </ActionIcon>
                      </Tooltip>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
              {rows.length === 0 && (
                <Table.Tr>
                  <Table.Td colSpan={7}>
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

      {editing && <PersonModal recipient={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
      {newListFromSelection && <ListModal list={null} memberIds={[...selected]} onClose={() => setNewListFromSelection(false)} />}
      {removal && (
        <RemoveModal
          removal={removal}
          hidden={removal.ids.length > 1 ? hiddenSelected : 0}
          onClose={() => setRemoval(null)}
          onDone={() => {
            if (removal.ids.length > 1) setSelected(new Set());
            setRemoval(null);
          }}
        />
      )}
    </>
  );
}

/**
 * Ignore = delete + add to Ignore list. Delete offers the same option, ticked by default,
 * so Import from Plex doesn't quietly bring people back.
 */
function RemoveModal({ removal, hidden, onClose, onDone }: { removal: Removal; hidden: number; onClose: () => void; onDone: () => void }) {
  const m = useRecipientMutations();
  const [ignore, setIgnore] = useState(true);
  const isIgnore = removal.mode === "ignore";
  const doIgnore = isIgnore || ignore;
  const n = removal.ids.length;

  return (
    <Modal opened onClose={onClose} title={isIgnore ? `Ignore ${removal.label}?` : `Delete ${removal.label}?`} centered>
      <Stack gap="sm">
        <Text size="sm">
          {isIgnore ? "They'll be removed from People and from every list, and " : "This removes them from People and from every list. "}
          {isIgnore ? (
            <>
              <b>Import from Plex will skip them</b> until you take them off the Ignore list (Recipients → Ignored).
            </>
          ) : null}
          {hidden > 0 ? ` ${hidden} of them aren't shown in the current view.` : ""}
        </Text>
        {!isIgnore && (
          <Checkbox
            checked={ignore}
            onChange={(e) => setIgnore(e.currentTarget.checked)}
            label="Add to Ignore list"
            description="Recommended. Otherwise anyone who still has Plex access comes back on the next Import from Plex."
          />
        )}
        <Group justify="flex-end" mt="xs">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button
            color={isIgnore ? "orange" : "red"}
            loading={m.bulkDelete.isPending}
            onClick={() =>
              m.bulkDelete.mutate(
                { ids: removal.ids, ignore: doIgnore },
                {
                  onSuccess: (r) => {
                    notifyOk(
                      doIgnore
                        ? `${r.deleted} ${r.deleted === 1 ? "person" : "people"} ignored — they won't be re-imported.`
                        : `${r.deleted} ${r.deleted === 1 ? "person" : "people"} deleted.`,
                      doIgnore ? "Ignored" : "Deleted",
                    );
                    onDone();
                  },
                  onError: (e) => notifyError(e),
                },
              )
            }
          >
            {isIgnore ? "Ignore" : "Delete"}
            {n > 1 ? ` ${n}` : ""}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

function PersonModal({ recipient, onClose }: { recipient: Recipient | null; onClose: () => void }) {
  const m = useRecipientMutations();
  const [name, setName] = useState(recipient?.name ?? "");
  const [email, setEmail] = useState(recipient?.email ?? "");
  const [error, setError] = useState<string | null>(null);
  const busy = m.create.isPending || m.update.isPending;

  return (
    <Modal opened onClose={onClose} title={recipient ? "Edit Person" : "Add Person"} centered>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          const done = {
            onSuccess: () => {
              notifyOk(recipient ? "Saved" : `${email} added`);
              onClose();
            },
            onError: (err: Error) => setError(err.message),
          };
          if (recipient) m.update.mutate({ id: recipient.id, name, email }, done);
          else m.create.mutate({ name, email }, done);
        }}
      >
        <Stack>
          {error && (
            <Alert color="red" variant="light">
              {error}
            </Alert>
          )}
          <TextInput label="Name" value={name} onChange={(e) => setName(e.currentTarget.value)} placeholder="Optional" data-autofocus />
          <TextInput label="Email" type="email" value={email} onChange={(e) => setEmail(e.currentTarget.value)} required />
          {!recipient && (
            <Text size="xs" c="dimmed">
              Adding someone by hand also takes them off the Ignore list.
            </Text>
          )}
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
