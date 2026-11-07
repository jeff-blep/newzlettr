import { useState } from "react";
import { Alert, Center, Checkbox, Group, Loader, NumberInput, Select, TextInput } from "@mantine/core";
import type { SmtpSettings } from "../../../../shared/types";
import { testSection, useDraft, useSaveSection, useSection } from "../../api/sections";
import { FormRow, SettingsSection } from "../../components/FormRow";
import { notifyError, notifyOk } from "../../components/notify";
import { PageToolbar } from "../../components/PageToolbar";
import { SecretInput } from "../../components/SecretInput";
import { TestButton } from "../../components/TestButton";
import { useUnsavedChanges } from "../../components/useUnsavedChanges";

const DEFAULT_PORT: Record<SmtpSettings["encryption"], number> = { ssl: 465, starttls: 587, none: 25 };

export function EmailSettings() {
  const q = useSection("smtp");
  const smtp = useDraft(q.data);
  const save = useSaveSection("smtp");
  const guard = useUnsavedChanges(smtp.dirty);
  const [sendTo, setSendTo] = useState("");

  if (q.error) return <Alert color="red">{String(q.error)}</Alert>;
  if (!smtp.draft) return <Center p="xl"><Loader /></Center>;
  const d = smtp.draft;

  return (
    <>
      {guard}
      <PageToolbar
        title="Email"
        dirty={smtp.dirty}
        saving={save.isPending}
        onSave={() =>
          save.mutate(smtp.changes(), {
            onSuccess: () => notifyOk("Email settings saved"),
            onError: (e) => notifyError(e, "Couldn't save"),
          })
        }
      />

      <SettingsSection title="SMTP Server">
        <FormRow label="Server" help="Gmail: smtp.gmail.com · Outlook: smtp.office365.com · iCloud: smtp.mail.me.com">
          <TextInput value={d.host} onChange={(e) => smtp.set("host", e.currentTarget.value)} placeholder="smtp.example.com" maw={420} />
        </FormRow>
        <FormRow label="Encryption">
          <Group>
            <Select
              value={d.encryption}
              onChange={(v) => {
                if (!v) return;
                const enc = v as SmtpSettings["encryption"];
                smtp.set("encryption", enc);
                // follow the conventional port if the user hasn't customised it
                if (Object.values(DEFAULT_PORT).includes(d.port)) smtp.set("port", DEFAULT_PORT[enc]);
              }}
              data={[
                { value: "starttls", label: "STARTTLS (usually port 587)" },
                { value: "ssl", label: "SSL/TLS (usually port 465)" },
                { value: "none", label: "None (unencrypted)" },
              ]}
              allowDeselect={false}
              w={280}
            />
            <NumberInput value={d.port} onChange={(v) => typeof v === "number" && smtp.set("port", v)} min={1} max={65535} w={110} prefix="Port " hideControls />
          </Group>
        </FormRow>
        <FormRow label="Username" help="Usually your full email address.">
          <TextInput value={d.username} onChange={(e) => smtp.set("username", e.currentTarget.value)} autoComplete="off" maw={420} />
        </FormRow>
        <FormRow label="Password" help="For Gmail and iCloud this must be an App Password, not your normal password.">
          <SecretInput value={d.password} onChange={(v) => smtp.set("password", v)} maw={420} />
        </FormRow>
        <FormRow label="Ignore TLS Errors" help="Only for a mail server with a self-signed certificate.">
          <Checkbox checked={d.ignoreTlsErrors} onChange={(e) => smtp.set("ignoreTlsErrors", e.currentTarget.checked)} />
        </FormRow>
      </SettingsSection>

      <SettingsSection title="Sender">
        <FormRow label="From Name" help="Shown as the sender in people's inboxes.">
          <TextInput value={d.fromName} onChange={(e) => smtp.set("fromName", e.currentTarget.value)} maw={420} />
        </FormRow>
        <FormRow label="From Address" help="Defaults to the username. Many providers only allow your own address here.">
          <TextInput value={d.fromAddress} onChange={(e) => smtp.set("fromAddress", e.currentTarget.value)} placeholder={d.username || "you@example.com"} maw={420} />
        </FormRow>
      </SettingsSection>

      <SettingsSection title="Test">
        <FormRow label="Send Test To" help="Leave empty to only check the login, or enter an address to receive a test email.">
          <TextInput value={sendTo} onChange={(e) => setSendTo(e.currentTarget.value.trim())} placeholder="you@example.com" maw={420} />
        </FormRow>
        <FormRow label="">
          <TestButton
            label={sendTo ? "Send Test Email" : "Test Login"}
            onTest={() => testSection("smtp", d, sendTo ? { sendTo } : {})}
          />
        </FormRow>
      </SettingsSection>
    </>
  );
}
