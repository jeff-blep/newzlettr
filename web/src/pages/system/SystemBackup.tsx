import { useRef, useState } from "react";
import { ActionIcon, Alert, Badge, Button, Card, FileButton, Group, List, Loader, Modal, Stack, Table, Text, Tooltip } from "@mantine/core";
import { IconDatabaseExport, IconDownload, IconFileImport, IconRestore, IconTrash } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, del, get, post } from "../../api/client";
import { SettingsSection } from "../../components/FormRow";
import { notifyError, notifyOk } from "../../components/notify";
import { PageToolbar } from "../../components/PageToolbar";
import { SortTh, useSortedRows } from "../../components/sortable";
import { relTime } from "./SystemTasks";

interface BackupInfo {
  name: string;
  sizeBytes: number;
  createdAt: string;
  kind: "manual" | "scheduled";
}
interface ImportSummary {
  settings: string[];
  recipients: number;
  templates: number;
  newsletters: number;
  hostPick: boolean;
  notes: string[];
}

const mb = (n: number) => (n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`);

export function SystemBackup() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["backups"], queryFn: () => get<{ backups: BackupInfo[]; restorePending: boolean }>("/api/system/backups") });
  const refresh = () => qc.invalidateQueries({ queryKey: ["backups"] });
  const create = useMutation({ mutationFn: () => post<BackupInfo>("/api/system/backups"), onSuccess: (b) => (notifyOk(b.name, "Backup created"), refresh()) });
  const remove = useMutation({ mutationFn: (name: string) => del(`/api/system/backups/${encodeURIComponent(name)}`), onSuccess: refresh });
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restoring, setRestoring] = useState(false);
  const backups = useSortedRows(
    "backups",
    q.data?.backups,
    {
      name: (b: BackupInfo) => b.name,
      kind: (b: BackupInfo) => b.kind,
      size: (b: BackupInfo) => b.sizeBytes,
      created: (b: BackupInfo) => Date.parse(b.createdAt),
    },
    { key: "created", dir: "desc" },
  );

  return (
    <>
      <PageToolbar
        title="Backup"
        actions={
          <Button leftSection={<IconDatabaseExport size={16} />} loading={create.isPending} onClick={() => create.mutate(undefined, { onError: (e) => notifyError(e) })}>
            Back up now
          </Button>
        }
      />

      {q.data?.restorePending && (
        <Alert color="yellow" mb="md" title="Restore pending">
          A backup is staged and will replace the current data the next time Newzlettr restarts (restart the container).{" "}
          <Button size="compact-xs" variant="subtle" onClick={async () => (await del("/api/system/restore"), refresh())}>
            Cancel restore
          </Button>
        </Alert>
      )}

      <SettingsSection title="Backups">
        <Text size="sm" c="dimmed" mb="sm">
          A backup is a full copy of your settings, recipients, templates, newsletters and send history. One is made automatically every week (the last 4 are kept).
        </Text>
        {q.isPending ? (
          <Loader size="sm" />
        ) : q.error || !q.data ? (
          <Alert color="red">{String(q.error)}</Alert>
        ) : q.data.backups.length === 0 ? (
          <Text size="sm" c="dimmed">
            No backups yet.
          </Text>
        ) : (
          <Card bg="var(--nz-sidebar-bg)" p={0} maw={900}>
            <Table verticalSpacing="xs">
              <Table.Thead>
                <Table.Tr>
                  <SortTh label="Name" column="name" sort={backups.sort} onSort={backups.toggle} />
                  <SortTh label="Type" column="kind" sort={backups.sort} onSort={backups.toggle} />
                  <SortTh label="Size" column="size" sort={backups.sort} onSort={backups.toggle} />
                  <SortTh label="Created" column="created" sort={backups.sort} onSort={backups.toggle} />
                  <Table.Th w={90} />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {backups.rows.map((b) => (
                  <Table.Tr key={b.name}>
                    <Table.Td>
                      <Text size="sm" ff="monospace">
                        {b.name}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Badge size="sm" variant="light" color={b.kind === "manual" ? "newz" : "gray"}>
                        {b.kind}
                      </Badge>
                    </Table.Td>
                    <Table.Td>{mb(b.sizeBytes)}</Table.Td>
                    <Table.Td>
                      <Tooltip label={new Date(b.createdAt).toLocaleString()}>
                        <Text size="sm">{relTime(b.createdAt)}</Text>
                      </Tooltip>
                    </Table.Td>
                    <Table.Td>
                      <Group gap={2} justify="flex-end" wrap="nowrap">
                        <Tooltip label="Download">
                          <ActionIcon variant="subtle" component="a" href={`/api/system/backups/${encodeURIComponent(b.name)}`}>
                            <IconDownload size={16} />
                          </ActionIcon>
                        </Tooltip>
                        <Tooltip label="Delete">
                          <ActionIcon variant="subtle" color="red" onClick={() => remove.mutate(b.name, { onError: (e) => notifyError(e) })}>
                            <IconTrash size={16} />
                          </ActionIcon>
                        </Tooltip>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Card>
        )}
      </SettingsSection>

      <SettingsSection title="Restore">
        <Text size="sm" c="dimmed" mb="sm" maw={720}>
          Upload a backup (.db) to replace everything with it. It's checked first, then applied when Newzlettr restarts; the current data is kept alongside as a safety copy.
        </Text>
        <FileButton onChange={setRestoreFile} accept=".db,application/octet-stream">
          {(props) => (
            <Button {...props} variant="default" leftSection={<IconRestore size={16} />}>
              Restore from file…
            </Button>
          )}
        </FileButton>
        <Modal opened={!!restoreFile} onClose={() => setRestoreFile(null)} title="Restore this backup?" centered>
          <Text size="sm">
            <b>{restoreFile?.name}</b> will replace all current settings, recipients, templates and newsletters after the next restart.
          </Text>
          <Group justify="flex-end" mt="lg">
            <Button variant="default" onClick={() => setRestoreFile(null)}>
              Cancel
            </Button>
            <Button
              color="red"
              loading={restoring}
              onClick={async () => {
                if (!restoreFile) return;
                setRestoring(true);
                try {
                  const r = await api<{ message: string }>("/api/system/restore", {
                    method: "POST",
                    headers: { "Content-Type": "application/octet-stream" },
                    body: await restoreFile.arrayBuffer(),
                  });
                  notifyOk(r.message, "Restore staged");
                  setRestoreFile(null);
                  void refresh();
                } catch (e) {
                  notifyError(e, "Restore rejected");
                } finally {
                  setRestoring(false);
                }
              }}
            >
              Stage restore
            </Button>
          </Group>
        </Modal>
      </SettingsSection>

      <ImportV1 />
    </>
  );
}

const V1_FILES: Record<string, "config" | "recipients" | "templates" | "newsletters"> = {
  "config.json": "config",
  "recipients.json": "recipients",
  "emailtemplates.json": "templates",
  "newsletters.json": "newsletters",
};

function ImportV1() {
  const qc = useQueryClient();
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportSummary | null>(null);
  const reset = useRef<() => void>(null);
  const known = files.filter((f) => V1_FILES[f.name]);
  const unknown = files.filter((f) => !V1_FILES[f.name]);

  return (
    <SettingsSection title="Import from Newzlettr v1">
      <Text size="sm" c="dimmed" mb="sm" maw={720}>
        Moving from the original Newzlettr? Select its <Code>config.json</Code>, <Code>recipients.json</Code>, <Code>emailtemplates.json</Code> and{" "}
        <Code>newsletters.json</Code>. Newsletters come in <b>disabled</b> so nothing sends until you switch them on. Safe to run more than once.
      </Text>
      <Group>
        <FileButton onChange={(f) => (setFiles(f), setResult(null))} accept=".json,application/json" multiple resetRef={reset}>
          {(props) => (
            <Button {...props} variant="default" leftSection={<IconFileImport size={16} />}>
              Choose v1 files…
            </Button>
          )}
        </FileButton>
        <Button
          disabled={!known.length}
          loading={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const body: Record<string, unknown> = {};
              for (const f of known) body[V1_FILES[f.name]!] = JSON.parse(await f.text());
              const r = await post<ImportSummary>("/api/system/import-v1", body);
              setResult(r);
              setFiles([]);
              reset.current?.();
              void qc.invalidateQueries();
            } catch (e) {
              notifyError(e, "Import failed");
            } finally {
              setBusy(false);
            }
          }}
        >
          Import {known.length ? `${known.length} file${known.length > 1 ? "s" : ""}` : ""}
        </Button>
      </Group>
      {files.length > 0 && (
        <Text size="xs" c="dimmed" mt="xs">
          {known.map((f) => f.name).join(", ")}
          {unknown.length ? ` · ignoring ${unknown.map((f) => f.name).join(", ")} (not a v1 file name)` : ""}
        </Text>
      )}
      {result && (
        <Alert color="green" mt="md" title="Imported" maw={720}>
          <Stack gap={4}>
            <Text size="sm">
              {result.recipients} recipients · {result.templates} templates · {result.newsletters} newsletters
              {result.hostPick ? " · Host's Pick" : ""}
              {result.settings.length ? ` · settings: ${result.settings.join(", ")}` : ""}
            </Text>
            {result.notes.length > 0 && (
              <List size="sm">
                {result.notes.map((n) => (
                  <List.Item key={n}>{n}</List.Item>
                ))}
              </List>
            )}
          </Stack>
        </Alert>
      )}
    </SettingsSection>
  );
}

function Code({ children }: { children: string }) {
  return (
    <Text span ff="monospace" size="xs" c="gray.3">
      {children}
    </Text>
  );
}

