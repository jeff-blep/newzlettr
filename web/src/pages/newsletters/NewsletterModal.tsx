import { useMemo, useState } from "react";
import { Alert, Anchor, Button, Group, Modal, MultiSelect, NumberInput, SegmentedControl, Select, Stack, Switch, Text, TextInput } from "@mantine/core";
import { Link } from "react-router-dom";
import type { Newsletter, NewsletterInput } from "../../../../shared/types";
import { useRecipients } from "../../api/media";
import { useNewsletterMutations } from "../../api/newsletters";
import { useGeneralSettings } from "../../api/settings";
import { useTemplates } from "../../api/templates";
import { notifyOk } from "../../components/notify";
import { SchedulePicker } from "../../components/SchedulePicker";

const DEFAULT_CRON = "0 8 * * 0";

export function NewsletterModal({ newsletter, onClose }: { newsletter: Newsletter | null; onClose: () => void }) {
  const templates = useTemplates();
  const recipients = useRecipients();
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
          recipientIds: newsletter.recipientIds,
          enabled: newsletter.enabled,
        }
      : { name: "", subject: "", templateId: null, cron: DEFAULT_CRON, historyDays: null, sendAsBcc: true, allRecipients: true, recipientIds: [], enabled: false },
  );
  const set = <K extends keyof NewsletterInput>(k: K, v: NewsletterInput[K]) => setD((x) => ({ ...x, [k]: v }));

  const enabledRecipients = useMemo(() => (recipients.data ?? []).filter((r) => r.enabled), [recipients.data]);
  const audience = d.allRecipients ? enabledRecipients.length : d.recipientIds.filter((id) => enabledRecipients.some((r) => r.id === id)).length;
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

          <div>
            <Text size="sm" fw={500} mb={6}>
              Recipients
            </Text>
            <SegmentedControl
              value={d.allRecipients ? "all" : "pick"}
              onChange={(v) => set("allRecipients", v === "all")}
              data={[
                { value: "all", label: "Everyone enabled" },
                { value: "pick", label: "Choose people" },
              ]}
              mb="xs"
            />
            {!d.allRecipients && (
              <MultiSelect
                placeholder="Search recipients"
                data={(recipients.data ?? []).map((r) => ({ value: String(r.id), label: r.name ? `${r.name} <${r.email}>` : r.email, disabled: !r.enabled }))}
                value={d.recipientIds.map(String)}
                onChange={(v) => set("recipientIds", v.map(Number))}
                searchable
                clearable
                maxDropdownHeight={260}
                hidePickedOptions
              />
            )}
            <Text size="xs" c={audience ? "dimmed" : "red"} mt={4}>
              Reaches {audience} {audience === 1 ? "person" : "people"}
              {d.allRecipients ? " — everyone switched on in Recipients, including people added later." : "."}
            </Text>
          </div>

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
