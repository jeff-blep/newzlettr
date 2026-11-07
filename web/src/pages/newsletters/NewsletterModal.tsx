import { useMemo, useState } from "react";
import { Alert, Anchor, Button, Group, Modal, MultiSelect, NumberInput, SegmentedControl, Select, Stack, Switch, Text, TextInput } from "@mantine/core";
import { IconAlertTriangle } from "@tabler/icons-react";
import { Link } from "react-router-dom";
import type { Newsletter, NewsletterInput } from "../../../../shared/types";
import { useRecipients } from "../../api/media";
import { useLists } from "../../api/lists";
import { useNewsletterMutations } from "../../api/newsletters";
import { useGeneralSettings } from "../../api/settings";
import { useTemplates } from "../../api/templates";
import { notifyOk } from "../../components/notify";
import { SchedulePicker } from "../../components/SchedulePicker";

const DEFAULT_CRON = "0 8 * * 0";

export function NewsletterModal({ newsletter, onClose }: { newsletter: Newsletter | null; onClose: () => void }) {
  const templates = useTemplates();
  const recipients = useRecipients();
  const lists = useLists();
  const general = useGeneralSettings();
  const m = useNewsletterMutations();
  const [error, setError] = useState<string | null>(null);
  const [d, setD] = useState<NewsletterInput>(() =>
    newsletter
      ? {
          name: newsletter.name,
          subject: newsletter.subject,
          templateId: newsletter.templateId,
          cron: newsletter.cron || DEFAULT_CRON,
          historyDays: newsletter.historyDays,
          sendAsBcc: newsletter.sendAsBcc,
          allRecipients: newsletter.allRecipients,
          listIds: newsletter.listIds,
          recipientIds: newsletter.recipientIds,
          enabled: newsletter.enabled,
        }
      : { name: "", subject: "", templateId: null, cron: DEFAULT_CRON, historyDays: null, sendAsBcc: true, allRecipients: false, listIds: [], recipientIds: [], enabled: false },
  );
  const set = <K extends keyof NewsletterInput>(k: K, v: NewsletterInput[K]) => setD((x) => ({ ...x, [k]: v }));

  // Mirrors the server's audience rule (server/src/mail/newsletter.ts).
  const { audience, overlap } = useMemo(() => {
    const people = recipients.data ?? [];
    if (d.allRecipients) return { audience: people.length, overlap: 0 };
    const exists = new Set(people.map((r) => r.id));
    const picks: number[] = [...d.recipientIds.filter((id) => exists.has(id))];
    for (const l of lists.data ?? []) if (d.listIds.includes(l.id)) picks.push(...l.memberIds.filter((id) => exists.has(id)));
    const unique = new Set(picks);
    return { audience: unique.size, overlap: picks.length - unique.size };
  }, [recipients.data, lists.data, d.allRecipients, d.listIds, d.recipientIds]);
  const busy = m.create.isPending || m.update.isPending;

  return (
    <Modal opened onClose={onClose} title={newsletter ? `Edit — ${newsletter.name}` : "New Newsletter"} size="lg" centered>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          const opts = {
            onSuccess: () => {
              notifyOk(newsletter ? "Newsletter saved" : `“${d.name}” created${d.enabled ? "" : " (disabled — switch it on when ready)"}`);
              onClose();
            },
            onError: (err: Error) => setError(err.message),
          };
          if (newsletter) m.update.mutate({ id: newsletter.id, ...d }, opts);
          else m.create.mutate(d, opts);
        }}
      >
        <Stack>
          {error && (
            <Alert color="red" variant="light">
              {error}
            </Alert>
          )}
          <TextInput label="Name" value={d.name} onChange={(e) => set("name", e.currentTarget.value)} required data-autofocus />
          <TextInput label="Email subject" description="Leave empty to use the name." value={d.subject} onChange={(e) => set("subject", e.currentTarget.value)} />
          <Select
            label="Template"
            placeholder={templates.data?.length ? "Pick a template" : "No templates yet"}
            data={(templates.data ?? []).map((t) => ({ value: String(t.id), label: t.name }))}
            value={d.templateId ? String(d.templateId) : null}
            onChange={(v) => set("templateId", v ? Number(v) : null)}
            searchable
            description={
              <>
                Content of the email.{" "}
                <Anchor component={Link} to={d.templateId ? `/templates/${d.templateId}` : "/templates/new"} size="xs" onClick={onClose}>
                  {d.templateId ? "Edit template" : "Create a template"}
                </Anchor>
              </>
            }
          />

          <div>
            <Text size="sm" fw={500} mb={6}>
              Schedule
            </Text>
            <SchedulePicker key={newsletter?.id ?? "new"} value={d.cron} onChange={(c) => set("cron", c)} />
          </div>

          <NumberInput
            label="History window"
            description={`How many days back the stats and “recently added” cards look. Empty = default (${general.data?.defaultHistoryDays ?? 7} days).`}
            value={d.historyDays ?? ""}
            onChange={(v) => set("historyDays", typeof v === "number" ? v : null)}
            min={1}
            max={90}
            suffix=" days"
            w={220}
            allowDecimal={false}
          />

          <Stack gap={8}>
            <Text size="sm" fw={500}>
              Recipients
            </Text>
            <SegmentedControl
              value={d.allRecipients ? "all" : "pick"}
              onChange={(v) => set("allRecipients", v === "all")}
              data={[
                { value: "pick", label: "Lists & people" },
                { value: "all", label: "All recipients" },
              ]}
              w="fit-content"
            />
            {d.allRecipients ? (
              <Alert color="yellow" variant="light" icon={<IconAlertTriangle size={18} />} p="sm">
                <Text size="sm">
                  Sends to <b>everyone</b> on the People page ({(recipients.data ?? []).length} right now), regardless of lists — including anyone added later by
                  Import from Plex.
                </Text>
              </Alert>
            ) : (
              <>
                <MultiSelect
                  label="Lists"
                  description="Everyone on these lists. People added to a list later are included automatically."
                  placeholder={(lists.data ?? []).length ? "Pick lists" : "No lists yet — create them under Recipients → Lists"}
                  data={(lists.data ?? []).map((l) => ({ value: String(l.id), label: `${l.name} · ${l.memberCount}` }))}
                  value={d.listIds.map(String)}
                  onChange={(v) => set("listIds", v.map(Number))}
                  searchable
                  clearable
                  disabled={!(lists.data ?? []).length}
                />
                <MultiSelect
                  label="Individual people"
                  description="Tick anyone extra."
                  placeholder="Search people"
                  data={(recipients.data ?? []).map((r) => ({
                    value: String(r.id),
                    label: r.name ? `${r.name} <${r.email}>` : r.email,
                  }))}
                  value={d.recipientIds.map(String)}
                  onChange={(v) => set("recipientIds", v.map(Number))}
                  searchable
                  clearable
                  withCheckIcon
                  checkIconPosition="left"
                  maxDropdownHeight={280}
                  nothingFoundMessage="Nobody matches"
                />
              </>
            )}
            <Text size="xs" c={audience ? "dimmed" : "red"}>
              Reaches {audience} {audience === 1 ? "person" : "people"}
              {!d.allRecipients && overlap > 0 ? ` (${overlap} on more than one pick get it once)` : ""}.
            </Text>
          </Stack>

          <Switch
            label="Send as BCC"
            description="One email, everyone in BCC (nobody sees other addresses). Off = a separate email to each person."
            checked={d.sendAsBcc}
            onChange={(e) => set("sendAsBcc", e.currentTarget.checked)}
          />
          <Switch label="Enabled" description="Sends automatically on the schedule above." checked={d.enabled} onChange={(e) => set("enabled", e.currentTarget.checked)} />

          <Group justify="flex-end" mt="sm">
            <Button variant="default" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={busy}>
              {newsletter ? "Save" : "Create"}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
