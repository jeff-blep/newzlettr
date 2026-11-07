import { useState } from "react";
import { ActionIcon, Alert, Badge, Button, Card, Center, Group, Loader, Modal, Stack, Table, Text, Tooltip } from "@mantine/core";
import { IconCopy, IconPencil, IconPlus, IconTrash } from "@tabler/icons-react";
import { Link, useNavigate } from "react-router-dom";
import type { Template } from "../../../../shared/types";
import { useTemplateMutations, useTemplates } from "../../api/templates";
import { notifyError, notifyOk } from "../../components/notify";
import { PageToolbar } from "../../components/PageToolbar";
import { SortTh, useSortedRows } from "../../components/sortable";
import { relTime } from "../system/SystemTasks";

export function TemplatesPage() {
  const { data, isPending, error } = useTemplates();
  const m = useTemplateMutations();
  const nav = useNavigate();
  const [deleting, setDeleting] = useState<Template | null>(null);
  const { rows, sort, toggle } = useSortedRows(
    "templates",
    data,
    {
      name: (t: Template) => t.name,
      usedBy: (t: Template) => t.usedBy.map((n) => n.name).join(", "),
      updated: (t: Template) => Date.parse(t.updatedAt),
    },
    { key: "updated", dir: "desc" },
  );

  if (isPending) return <Center p="xl"><Loader /></Center>;
  if (error || !data) return <Alert color="red">{String(error)}</Alert>;

  return (
    <>
      <PageToolbar
        title="Templates"
        actions={
          <Button leftSection={<IconPlus size={16} />} onClick={() => nav("/templates/new")}>
            New Template
          </Button>
        }
      />
      <Card bg="var(--nz-sidebar-bg)" p={0}>
        {data.length === 0 ? (
          <Center p="xl">
            <Stack align="center" gap="xs">
              <Text c="dimmed">No templates yet.</Text>
              <Button variant="light" onClick={() => nav("/templates/new")}>
                Create your first template
              </Button>
            </Stack>
          </Center>
        ) : (
          <Table verticalSpacing="sm" highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <SortTh label="Name" column="name" sort={sort} onSort={toggle} />
                <SortTh label="Used by" column="usedBy" sort={sort} onSort={toggle} />
                <SortTh label="Last edited" column="updated" sort={sort} onSort={toggle} />
                <Table.Th w={120} />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map((t) => (
                <Table.Tr key={t.id}>
                  <Table.Td>
                    <Text component={Link} to={`/templates/${t.id}`} fw={500} c="gray.1" style={{ textDecoration: "none" }}>
                      {t.name}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    {t.usedBy.length ? (
                      <Group gap={4}>
                        {t.usedBy.map((n) => (
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
                    <Tooltip label={new Date(t.updatedAt).toLocaleString()}>
                      <Text size="sm">{relTime(t.updatedAt)}</Text>
                    </Tooltip>
                  </Table.Td>
                  <Table.Td>
                    <Group gap={4} justify="flex-end" wrap="nowrap">
                      <Tooltip label="Edit">
                        <ActionIcon variant="subtle" component={Link} to={`/templates/${t.id}`}>
                          <IconPencil size={16} />
                        </ActionIcon>
                      </Tooltip>
                      <Tooltip label="Duplicate">
                        <ActionIcon
                          variant="subtle"
                          loading={m.duplicate.isPending && m.duplicate.variables === t.id}
                          onClick={() => m.duplicate.mutate(t.id, { onSuccess: (c) => notifyOk(`Created “${c.name}”`, "Duplicated"), onError: (e) => notifyError(e) })}
                        >
                          <IconCopy size={16} />
                        </ActionIcon>
                      </Tooltip>
                      <Tooltip label="Delete">
                        <ActionIcon variant="subtle" color="red" onClick={() => setDeleting(t)}>
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

      <Modal opened={!!deleting} onClose={() => setDeleting(null)} title="Delete template?" centered>
        <Text size="sm">
          Delete <b>{deleting?.name}</b>?
          {deleting?.usedBy.length
            ? ` ${deleting.usedBy.map((n) => n.name).join(", ")} will be left without a template and won't send until you pick another.`
            : ""}
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
