import { Alert, Center, Checkbox, Loader, TextInput } from "@mantine/core";
import { testSection, useDraft, useSaveSection, useSection } from "../../api/sections";
import { FormRow, SettingsSection } from "../../components/FormRow";
import { notifyError, notifyOk } from "../../components/notify";
import { PageToolbar } from "../../components/PageToolbar";
import { SecretInput } from "../../components/SecretInput";
import { TestButton } from "../../components/TestButton";
import { useUnsavedChanges } from "../../components/useUnsavedChanges";

export function ConnectionsSettings() {
  const plexQ = useSection("plex");
  const tautQ = useSection("tautulli");
  const plex = useDraft(plexQ.data);
  const taut = useDraft(tautQ.data);
  const savePlex = useSaveSection("plex");
  const saveTaut = useSaveSection("tautulli");
  const dirty = plex.dirty || taut.dirty;
  const guard = useUnsavedChanges(dirty);

  if (plexQ.error || tautQ.error) return <Alert color="red">{String(plexQ.error ?? tautQ.error)}</Alert>;
  if (!plex.draft || !taut.draft) return <Center p="xl"><Loader /></Center>;

  const onSave = async () => {
    try {
      if (plex.dirty) await savePlex.mutateAsync(plex.changes());
      if (taut.dirty) await saveTaut.mutateAsync(taut.changes());
      notifyOk("Connections saved");
    } catch (e) {
      notifyError(e, "Couldn't save");
    }
  };

  return (
    <>
      {guard}
      <PageToolbar title="Connections" onSave={onSave} dirty={dirty} saving={savePlex.isPending || saveTaut.isPending} />

      <SettingsSection title="Plex Media Server">
        <FormRow label="URL" help="Where this app can reach Plex, e.g. http://192.168.1.10:32400">
          <TextInput value={plex.draft.url} onChange={(e) => plex.set("url", e.currentTarget.value)} placeholder="http://plex-host:32400" maw={420} />
        </FormRow>
        <FormRow
          label="Token"
          help={
            <>
              Your Plex token (X-Plex-Token).{" "}
              <a href="https://support.plex.tv/articles/204059436-finding-an-authentication-token-x-plex-token/" target="_blank" rel="noreferrer">
                How to find it
              </a>
            </>
          }
        >
          <SecretInput value={plex.draft.token} onChange={(v) => plex.set("token", v)} maw={420} />
        </FormRow>
        <FormRow label="Ignore TLS Errors" help="Only for https URLs with a self-signed certificate.">
          <Checkbox checked={plex.draft.ignoreTlsErrors} onChange={(e) => plex.set("ignoreTlsErrors", e.currentTarget.checked)} />
        </FormRow>
        <FormRow label="">
          <TestButton onTest={() => testSection("plex", plex.draft!)} />
        </FormRow>
      </SettingsSection>

      <SettingsSection title="Tautulli">
        <FormRow label="URL" help="Where this app can reach Tautulli, e.g. http://192.168.1.10:8181">
          <TextInput value={taut.draft.url} onChange={(e) => taut.set("url", e.currentTarget.value)} placeholder="http://tautulli-host:8181" maw={420} />
        </FormRow>
        <FormRow label="API Key" help="Tautulli → Settings → Web Interface → API Key.">
          <SecretInput value={taut.draft.apiKey} onChange={(v) => taut.set("apiKey", v)} maw={420} />
        </FormRow>
        <FormRow label="Ignore TLS Errors" help="Only for https URLs with a self-signed certificate.">
          <Checkbox checked={taut.draft.ignoreTlsErrors} onChange={(e) => taut.set("ignoreTlsErrors", e.currentTarget.checked)} />
        </FormRow>
        <FormRow label="">
          <TestButton onTest={() => testSection("tautulli", taut.draft!)} />
        </FormRow>
      </SettingsSection>
    </>
  );
}
