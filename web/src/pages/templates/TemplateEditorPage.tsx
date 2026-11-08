import { useEffect, useRef, useState } from "react";
import { Alert, Box, Button, Center, Grid, Group, Loader, Modal, SegmentedControl, Select, Stack, Text, TextInput, Tooltip } from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { IconAlertTriangle, IconRefresh, IconSend } from "@tabler/icons-react";
import { useNavigate, useParams } from "react-router-dom";
import { useSection } from "../../api/sections";
import { renderPreview, sendTest, useCards, useTemplate, useTemplateMutations } from "../../api/templates";
import { notifyError, notifyOk } from "../../components/notify";
import { PageToolbar } from "../../components/PageToolbar";
import { useUnsavedChanges } from "../../components/useUnsavedChanges";
import { RichEditor } from "../../editor/RichEditor";

const STARTER = `<h2>Hello from the server!</h2><p>Here's what's new this week.</p><div data-card="CARD_RECENT_MOVIES"></div><div data-card="CARD_RECENT_EPISODES"></div><div data-card="CARD_SERVER_TOTALS"></div>`;

export function TemplateEditorPage() {
  const { id: idParam } = useParams();
  const isNew = idParam === "new";
  const id = isNew ? null : Number(idParam);
  const q = useTemplate(id);
  const cards = useCards();
  const m = useTemplateMutations();
  const nav = useNavigate();

  const [name, setName] = useState("");
  const [html, setHtml] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [baseline, setBaseline] = useState({ name: "", html: "" });

  useEffect(() => {
    if (isNew && !loaded) {
      setName("");
      setHtml(STARTER);
      setBaseline({ name: "", html: STARTER });
      setLoaded(true);
    } else if (q.data && (!loaded || q.data.id !== id)) {
      setName(q.data.name);
      setHtml(q.data.html);
      setBaseline({ name: q.data.name, html: q.data.html });
      setLoaded(true);
    }
  }, [isNew, q.data, loaded, id]);

  const dirty = loaded && (name !== baseline.name || html !== baseline.html);
  const guard = useUnsavedChanges(dirty);
  const [testOpen, setTestOpen] = useState(false);

  if (!isNew && q.isPending) return <Center p="xl"><Loader /></Center>;
  if (!isNew && (q.error || !q.data)) return <Alert color="red">{String(q.error ?? "Template not found")}</Alert>;

  const save = async () => {
    if (!name.trim()) return notifyError(new Error("Give the template a name first"), "Can't save");
    try {
      if (isNew) {
        const t = await m.create.mutateAsync({ name: name.trim(), html });
        setBaseline({ name: t.name, html });
        notifyOk(`“${t.name}” created`);
        nav(`/templates/${t.id}`, { replace: true });
      } else {
        const t = await m.update.mutateAsync({ id: id!, name: name.trim(), html });
        setBaseline({ name: t.name, html });
        notifyOk("Template saved");
      }
    } catch (e) {
      notifyError(e, "Couldn't save");
    }
  };

  return (
    <>
      {guard}
      <PageToolbar
        title={isNew ? "New Template" : "Edit Template"}
        dirty={dirty}
        saving={m.create.isPending || m.update.isPending}
        onSave={save}
        actions={
          <Button variant="default" leftSection={<IconSend size={16} />} onClick={() => setTestOpen(true)}>
            Send test
          </Button>
        }
      />
      <TextInput label="Template name" value={name} onChange={(e) => setName(e.currentTarget.value)} placeholder="e.g. Weekly roundup" maw={420} mb="md" required />
      {q.data?.usedBy.length ? (
        <Text size="xs" c="dimmed" mt={-8} mb="md">
          Used by: {q.data.usedBy.map((n) => n.name).join(", ")}
        </Text>
      ) : null}

      <Grid gutter="lg">
        <Grid.Col span={{ base: 12, lg: 6 }}>
          {loaded && cards.data ? <RichEditor value={html} onChange={setHtml} cards={cards.data} /> : <Loader />}
        </Grid.Col>
        <Grid.Col span={{ base: 12, lg: 6 }}>
          <Preview html={html} />
        </Grid.Col>
      </Grid>

      <TestSendModal opened={testOpen} onClose={() => setTestOpen(false)} html={html} subject={name} />
    </>
  );
}

function Preview({ html }: { html: string }) {
  const [days, setDays] = useState("7");
  const content = useSection("content");
  const auto = content.data?.emailTheme === "auto";
  const [scheme, setScheme] = useState<"light" | "dark">("light");
  const [debounced] = useDebouncedValue(html, 900);
  const [state, setState] = useState<{ html: string; warnings: string[]; loading: boolean; error?: string }>({ html: "", warnings: [], loading: true });
  const [nonce, setNonce] = useState(0);
  const seq = useRef(0);

  useEffect(() => {
    const mine = ++seq.current;
    setState((s) => ({ ...s, loading: true }));
    renderPreview(debounced, Number(days), undefined, auto ? scheme : undefined)
      .then((r) => mine === seq.current && setState({ html: r.html, warnings: r.warnings, loading: false }))
      .catch((e) => mine === seq.current && setState((s) => ({ ...s, loading: false, error: String(e) })));
  }, [debounced, days, nonce, scheme, auto, content.data?.emailTheme, content.data?.accentColor]);

  return (
    <Stack gap="xs" pos="sticky" top={130}>
      <Group justify="space-between">
        <Group gap="xs">
          <Text fw={600}>Preview</Text>
          {state.loading && <Loader size="xs" />}
        </Group>
        <Group gap="xs">
          {auto && (
            <Tooltip label="“Match reader's device” is on — check both looks">
              <SegmentedControl
                size="xs"
                value={scheme}
                onChange={(v) => setScheme(v as "light" | "dark")}
                data={[
                  { value: "light", label: "Light" },
                  { value: "dark", label: "Dark" },
                ]}
              />
            </Tooltip>
          )}
          <Select
            size="xs"
            w={130}
            value={days}
            onChange={(v) => v && setDays(v)}
            data={[
              { value: "7", label: "Last 7 days" },
              { value: "14", label: "Last 14 days" },
              { value: "30", label: "Last 30 days" },
            ]}
            allowDeselect={false}
          />
          <Tooltip label="Refresh with fresh data">
            <Button size="xs" variant="default" onClick={() => setNonce((n) => n + 1)}>
              <IconRefresh size={14} />
            </Button>
          </Tooltip>
        </Group>
      </Group>
      {state.error && <Alert color="red">{state.error}</Alert>}
      {state.warnings.length > 0 && (
        <Alert color="yellow" variant="light" icon={<IconAlertTriangle size={16} />} p="xs">
          {state.warnings.map((w) => (
            <Text size="xs" key={w}>
              {w}
            </Text>
          ))}
        </Alert>
      )}
      <Box style={{ border: "1px solid var(--nz-border)", borderRadius: 8, overflow: "hidden", background: "#111214" }}>
        {/* No allow-scripts: template HTML can never run code here. allow-same-origin lets poster images use the session. */}
        <iframe title="Email preview" sandbox="allow-same-origin" srcDoc={state.html} style={{ width: "100%", height: "calc(100vh - 230px)", minHeight: 500, border: 0, display: "block" }} />
      </Box>
      <Text size="xs" c="dimmed">
        Built by the same renderer that sends the email, with live data.
      </Text>
    </Stack>
  );
}

function TestSendModal({ opened, onClose, html, subject }: { opened: boolean; onClose: () => void; html: string; subject: string }) {
  const smtp = useSection("smtp");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (opened && !to) setTo(smtp.data?.fromAddress || smtp.data?.username || "");
  }, [opened, smtp.data, to]);

  return (
    <Modal opened={opened} onClose={onClose} title="Send a test email" centered>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            const r = await sendTest(html, to.trim(), 7, subject || "Newsletter preview");
            if (r.ok) {
              notifyOk(r.message + (r.warnings.length ? ` (${r.warnings.length} warning${r.warnings.length > 1 ? "s" : ""})` : ""), "Test sent");
              onClose();
            } else notifyError(new Error(r.message), "Test failed");
          } catch (err) {
            notifyError(err, "Test failed");
          } finally {
            setBusy(false);
          }
        }}
      >
        <Stack>
          <Text size="sm" c="dimmed">
            Sends this template (including unsaved changes) to one address only. Nobody on your recipient list gets it.
          </Text>
          <TextInput label="Send to" type="email" value={to} onChange={(e) => setTo(e.currentTarget.value)} required data-autofocus />
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={busy} leftSection={<IconSend size={16} />}>
              Send test
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
