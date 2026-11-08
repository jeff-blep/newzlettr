import { useState } from "react";
import { ActionIcon, Alert, Badge, Button, Card, Center, Group, Loader, Modal, Stack, Table, Text, Textarea, TextInput, Tooltip } from "@mantine/core";
import { IconPencil, IconPlus, IconTrash, IconUsers } from "@tabler/icons-react";
import { Link } from "react-router-dom";
import type { RecipientList } from "../../../shared/types";
import { useListMutations, useLists } from "../api/lists";
import { notifyError, notifyOk } from "../components/notify";
import { PageToolbar } from "../components/PageToolbar";
import { SortTh, useSortedRows } from "../components/sortable";

export function ListsPage() {
  const { data, isPending, error } = useLists();
  const m = useListMutations();
  const [editing, setEditing] = useState<RecipientList | "new" | null>(null);
  const [deleting, setDeleting] = useState<RecipientList | null>(null);
  const { rows, sort, toggle } = useSortedRows(
    "lists",
    data,
    {
      name: (l: RecipientList) => l.name,
      members: (l: RecipientList) => l.memberCount,
      usedBy: (l: RecipientList) => l.usedBy.map((n) => n.name).join(", "),
    },
    { key: "name", dir: "asc" },
  );

  if (isPending) return <Center p="xl"><Loader /></Center>;
  if (error || !data) return <Alert color="red">{String(error)}</Alert>;

  return (
    <>
      <PageToolbar
        title="Lists"
        actions={
          <Button leftSection={<IconPlus size={16} />} onClick={() => setEditing("new")}>
            New List
          </Button>
        }
      />
      <Text size="sm" c="dimmed" mb="md" maw={760}>
        Group recipients (e.g. Family, Friends without libraries) and pick lists when setting up a newsletter. To add people, select them on the{" "}
        <Text component={Link} to="/recipients" c="newz.3" size="sm" span>
          People
        </Text>{" "}
        page and use <b>Add to list</b>.
      </Text>

      <Card bg="var(--nz-sidebar-bg)" p={0}>
        {data.length === 0 ? (
          <Center p="xl">
            <Stack align="center" gap="xs">
              <Text c="dimmed">No lists yet.</Text>
              <Button variant="light" onClick={() => setEditing("new")}>
                Create a list
              </Button>
            </Stack>
          </Center>
        ) : (
          <Table verticalSpacing="sm" highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <SortTh label="Name" column="name" sort={sort} onSort={toggle} />
                <SortTh label="Members" column="members" sort={sort} onSort={toggle} w={180} />
                <SortTh label="Used by" column="usedBy" sort={sort} onSort={toggle} />
                <Table.Th w={120} />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map((l) => (
                <Table.Tr key={l.id}>
                  <Table.Td>
                    <Text fw={500} c="gray.1">
                      {l.name}
                    </Text>
                    {l.description && (
                      <Text size="xs" c="dimmed">
                        {l.description}
                      </Text>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{l.memberCount}</Text>
                  </Table.Td>
                  <Table.Td>
                    {l.usedBy.length ? (
                      <Group gap={4}>
                        {l.usedBy.map((n) => (
                          <Badge key={n.id} variant="light" size="sm">
                            {n.name}
                          </Badge>
                        ))}
                      </Group>
                    ) : (
                      <Text size="sm" c="dimmed">
                        —
                      </Text>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Group gap={2} justify="flex-end" wrap="nowrap">
                      <Tooltip label="Show members">
                        <ActionIcon variant="subtle" component={Link} to={`/recipients?list=${l.id}`}>
                          <IconUsers size={16} />
                        </ActionIcon>
                      </Tooltip>
                      <Tooltip label="Rename / describe">
                        <ActionIcon variant="subtle" onClick={() => setEditing(l)}>
                          <IconPencil size={16} />
                        </ActionIcon>
                      </Tooltip>
                      <Tooltip label="Delete">
                        <ActionIcon variant="subtle" color="red" onClick={() => setDeleting(l)}>
                          <IconTrash size={16} />
                        </ActionIcon>
                      </Tooltip>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Card>

      {editing && <ListModal list={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}

      <Modal opened={!!deleting} onClose={() => setDeleting(null)} title="Delete list?" centered>
        <Text size="sm">
          Delete <b>{deleting?.name}</b>? The people stay on the Recipients page.
          {deleting?.usedBy.length ? ` ${deleting.usedBy.map((n) => n.name).join(", ")} will stop sending to this list.` : ""}
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

/** Create or rename a list. `memberIds` pre-fills members (used by "New list from selection"). */
export function ListModal({ list, memberIds, onClose, onCreated }: { list: RecipientList | null; memberIds?: number[]; onClose: () => void; onCreated?: (l: RecipientList) => void }) {
  const m = useListMutations();
  const [name, setName] = useState(list?.name ?? "");
  const [description, setDescription] = useState(list?.description ?? "");
  const [err, setErr] = useState<string | null>(null);

  return (
    <Modal opened onClose={onClose} title={list ? `Edit “${list.name}”` : memberIds?.length ? `New list with ${memberIds.length} people` : "New list"} centered>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setErr(null);
          const opts = {
            onSuccess: (l: RecipientList) => {
              notifyOk(list ? "List saved" : `“${l.name}” created`);
              onCreated?.(l);
              onClose();
            },
            onError: (e: Error) => setErr(e.message),
          };
          if (list) m.update.mutate({ id: list.id, name, description }, opts);
          else m.create.mutate({ name, description, memberIds }, opts);
        }}
      >
        <Stack>
          {err && (
            <Alert color="red" variant="light">
              {err}
            </Alert>
          )}
          <TextInput label="Name" value={name} onChange={(e) => setName(e.currentTarget.value)} placeholder="e.g. Donors" required data-autofocus />
          <Textarea label="Description" value={description} onChange={(e) => setDescription(e.currentTarget.value)} placeholder="Optional" autosize minRows={2} />
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={m.create.isPending || m.update.isPending}>
              {list ? "Save" : "Create"}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
