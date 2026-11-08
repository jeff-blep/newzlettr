import { useEffect, useMemo, useState } from "react";
import {
  ActionIcon,
  Alert,
  Button,
  Center,
  CopyButton,
  Group,
  Loader,
  Modal,
  NumberInput,
  Select,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { IconCheck, IconCopy, IconRefresh } from "@tabler/icons-react";
import type { GeneralSettings as GS } from "../../../../shared/types";
import { useGeneralSettings, useRegenerateApiKey, useSaveGeneralSettings } from "../../api/settings";
import { FormRow, SettingsSection } from "../../components/FormRow";
import { notifyError, notifyOk } from "../../components/notify";
import { PageToolbar } from "../../components/PageToolbar";
import { useUnsavedChanges } from "../../components/useUnsavedChanges";

const EDITABLE: (keyof GS)[] = ["authMethod", "timezone", "logLevel", "applicationUrl"];
const pick = (s: GS): GS => Object.fromEntries(EDITABLE.map((k) => [k, s[k]])) as unknown as GS;

const TIMEZONES: string[] = (() => {
  try {
    return (Intl as unknown as { supportedValuesOf(k: string): string[] }).supportedValuesOf("timeZone");
  } catch {
    return ["UTC"];
  }
})();

export function GeneralSettings() {
  const { data, isPending, error } = useGeneralSettings();
  const save = useSaveGeneralSettings();
  const regen = useRegenerateApiKey();
  const [draft, setDraft] = useState<GS | null>(null);
  const [confirmRegen, setConfirmRegen] = useState(false);

  useEffect(() => {
    if (data) setDraft(pick(data));
  }, [data]);

  const dirty = useMemo(() => !!data && !!draft && JSON.stringify(pick(data)) !== JSON.stringify(draft), [data, draft]);
  const guard = useUnsavedChanges(dirty);
  const set = <K extends keyof GS>(k: K, v: GS[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d));

  if (isPending || !draft || !data) {
    return error ? <Alert color="red">{String(error)}</Alert> : <Center p="xl"><Loader /></Center>;
  }

  const onSave = () =>
    save.mutate(draft, {
      onSuccess: () => notifyOk("General settings saved"),
      onError: (e) => notifyError(e, "Couldn't save settings"),
    });

  return (
    <>
      {guard}
      <PageToolbar title="General" onSave={onSave} dirty={dirty} saving={save.isPending} />

      <SettingsSection title="Security">
        <FormRow
          label="Authentication Required"
          help="“Disabled for Local Addresses” skips the login for devices on your home network (private IP ranges). Don't use it behind a reverse proxy on the same machine — every request would look local."
        >
          <Select
            value={draft.authMethod}
            onChange={(v) => v && set("authMethod", v as GS["authMethod"])}
            data={[
              { value: "forms", label: "Enabled" },
              { value: "forms-local-bypass", label: "Disabled for Local Addresses" },
            ]}
            allowDeselect={false}
            maw={320}
          />
        </FormRow>
        <FormRow label="API Key" help="Send as the X-Api-Key header to use the API without signing in.">
          <Group gap="xs" wrap="nowrap">
            <TextInput value={data.apiKey} readOnly style={{ flex: 1 }} styles={{ input: { fontFamily: "monospace" } }} />
            <CopyButton value={data.apiKey}>
              {({ copied, copy }) => (
                <Tooltip label={copied ? "Copied" : "Copy"}>
                  <ActionIcon variant="default" size="lg" onClick={copy}>
                    {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
                  </ActionIcon>
                </Tooltip>
              )}
            </CopyButton>
            <Tooltip label="Regenerate">
              <ActionIcon variant="default" size="lg" color="red" onClick={() => setConfirmRegen(true)}>
                <IconRefresh size={16} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </FormRow>
      </SettingsSection>

      <SettingsSection title="Schedule">
        <FormRow
          label="Time Zone"
          help={
            <>
              Newsletter send times use this zone. Currently in effect: <b>{data.effectiveTimezone}</b>.
            </>
          }
        >
          <Select
            value={draft.timezone}
            onChange={(v) => set("timezone", v ?? "")}
            data={[{ value: "", label: "Use container/system time zone (TZ)" }, ...TIMEZONES.map((z) => ({ value: z, label: z }))]}
            searchable
            allowDeselect={false}
            maw={420}
          />
        </FormRow>
      </SettingsSection>

      <SettingsSection title="Links">
        <FormRow
          label="Application URL"
          help="Optional. The address people use to reach this app, e.g. https://newzlettr.example.com — used for links inside emails."
        >
          <TextInput value={draft.applicationUrl} onChange={(e) => set("applicationUrl", e.currentTarget.value.trim())} placeholder="https://" maw={420} />
        </FormRow>
      </SettingsSection>

      <SettingsSection title="Logging">
        <FormRow label="Log Level" help="Debug and Trace are noisy; use them only while troubleshooting.">
          <Select
            value={draft.logLevel}
            onChange={(v) => v && set("logLevel", v as GS["logLevel"])}
            data={[
              { value: "info", label: "Info" },
              { value: "debug", label: "Debug" },
              { value: "trace", label: "Trace" },
              { value: "warn", label: "Warn" },
              { value: "error", label: "Error" },
            ]}
            allowDeselect={false}
            maw={200}
          />
        </FormRow>
      </SettingsSection>

      <Modal opened={confirmRegen} onClose={() => setConfirmRegen(false)} title="Regenerate API key?" centered>
        <Text size="sm">Anything using the current key will stop working until you give it the new one.</Text>
        <Group justify="flex-end" mt="lg">
          <Button variant="default" onClick={() => setConfirmRegen(false)}>
            Cancel
          </Button>
          <Button
            color="red"
            loading={regen.isPending}
            onClick={() =>
              regen.mutate(undefined, {
                onSuccess: () => {
                  setConfirmRegen(false);
                  notifyOk("New API key generated");
                },
                onError: (e) => notifyError(e),
              })
            }
          >
            Regenerate
          </Button>
        </Group>
      </Modal>
    </>
  );
}
