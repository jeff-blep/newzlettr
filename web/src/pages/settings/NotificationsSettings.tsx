import { Alert, Anchor, Center, List, Loader, Switch, Text, TextInput } from "@mantine/core";
import { testSection, useDraft, useSaveSection, useSection } from "../../api/sections";
import { FormRow, SettingsSection } from "../../components/FormRow";
import { notifyError, notifyOk } from "../../components/notify";
import { PageToolbar } from "../../components/PageToolbar";
import { SecretInput } from "../../components/SecretInput";
import { TestButton } from "../../components/TestButton";
import { useUnsavedChanges } from "../../components/useUnsavedChanges";

export function NotificationsSettings() {
  const q = useSection("notifications");
  const n = useDraft(q.data);
  const save = useSaveSection("notifications");
  const guard = useUnsavedChanges(n.dirty);

  if (q.error) return <Alert color="red">{String(q.error)}</Alert>;
  if (!n.draft) return <Center p="xl"><Loader /></Center>;
  const d = n.draft;

  return (
    <>
      {guard}
      <PageToolbar
        title="Notifications"
        dirty={n.dirty}
        saving={save.isPending}
        onSave={() =>
          save.mutate(n.changes(), {
            onSuccess: () => notifyOk("Notification settings saved"),
            onError: (e) => notifyError(e, "Couldn't save"),
          })
        }
      />

      <SettingsSection title="Telegram">
        <FormRow label="Enable" help="Get a Telegram message when a newsletter goes out, fails, or is skipped.">
          <Switch checked={d.telegramEnabled} onChange={(e) => n.set("telegramEnabled", e.currentTarget.checked)} />
        </FormRow>
        <FormRow label="Bot Token" help="From @BotFather in Telegram.">
          <SecretInput value={d.telegramBotToken} onChange={(v) => n.set("telegramBotToken", v)} maw={420} />
        </FormRow>
        <FormRow label="Chat ID" help="Your own ID, a group's ID (starts with -), or @yourchannel.">
          <TextInput value={d.telegramChatId} onChange={(e) => n.set("telegramChatId", e.currentTarget.value.trim())} placeholder="123456789" maw={420} />
        </FormRow>
        <FormRow label="">
          <TestButton
            label="Send Test Message"
            disabled={!d.telegramBotToken || !d.telegramChatId}
            onTest={() => testSection("notifications", d)}
          />
        </FormRow>
        <FormRow label="How to set it up">
          <List size="sm" type="ordered" spacing={4} maw={560}>
            <List.Item>
              In Telegram, message <Anchor href="https://t.me/BotFather" target="_blank">@BotFather</Anchor>, send <Text span ff="monospace">/newbot</Text>, and copy the token it gives you.
            </List.Item>
            <List.Item>Open your new bot and press Start (or add it to a group), so it's allowed to message you.</List.Item>
            <List.Item>
              Get your chat ID by messaging <Anchor href="https://t.me/userinfobot" target="_blank">@userinfobot</Anchor>, then paste both here and press Send Test Message.
            </List.Item>
          </List>
        </FormRow>
      </SettingsSection>

      <SettingsSection title="Notify Me When">
        <FormRow label="Sent" help="A newsletter went out.">
          <Switch checked={d.onSent} onChange={(e) => n.set("onSent", e.currentTarget.checked)} />
        </FormRow>
        <FormRow label="Failed" help="A newsletter didn't send, or some people didn't get it.">
          <Switch checked={d.onFailed} onChange={(e) => n.set("onFailed", e.currentTarget.checked)} />
        </FormRow>
        <FormRow label="Skipped" help="A scheduled newsletter was skipped because Newzlettr was off at the time.">
          <Switch checked={d.onSkipped} onChange={(e) => n.set("onSkipped", e.currentTarget.checked)} />
        </FormRow>
        <FormRow label="">
          <Text size="xs" c="dimmed">Turn on any mix. Test emails never send a notification.</Text>
        </FormRow>
      </SettingsSection>
    </>
  );
}
