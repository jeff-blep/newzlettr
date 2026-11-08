import { Alert, Center, Loader, SegmentedControl, Text, TextInput } from "@mantine/core";
import type { TestResult } from "../../../../shared/types";
import { post } from "../../api/client";
import { testSection, useDraft, useSaveSection, useSection } from "../../api/sections";
import { FormRow, SettingsSection } from "../../components/FormRow";
import { notifyError, notifyOk } from "../../components/notify";
import { PageToolbar } from "../../components/PageToolbar";
import { SecretInput } from "../../components/SecretInput";
import { TestButton } from "../../components/TestButton";
import { useUnsavedChanges } from "../../components/useUnsavedChanges";
import { CloudinaryUsageCard } from "../../components/CloudinaryUsageCard";

export function ImagesSettings() {
  const q = useSection("images");
  const img = useDraft(q.data);
  const save = useSaveSection("images");
  const guard = useUnsavedChanges(img.dirty);

  if (q.error) return <Alert color="red">{String(q.error)}</Alert>;
  if (!img.draft) return <Center p="xl"><Loader /></Center>;
  const d = img.draft;

  return (
    <>
      {guard}
      <PageToolbar
        title="Images"
        dirty={img.dirty}
        saving={save.isPending}
        onSave={() =>
          save.mutate(img.changes(), {
            onSuccess: () => notifyOk("Image settings saved"),
            onError: (e) => notifyError(e, "Couldn't save"),
          })
        }
      />

      <SettingsSection title="Poster Images">
        <FormRow
          label="Image Hosting"
          help={
            d.mode === "embedded"
              ? "Posters are attached to each email. Works everywhere with no account, but makes emails larger and some clients show them as attachments."
              : "Posters are uploaded once to your Cloudinary account and linked. Smaller emails that look right in every client."
          }
        >
          <SegmentedControl
            value={d.mode}
            onChange={(v) => img.set("mode", v as typeof d.mode)}
            data={[
              { value: "embedded", label: "Embed in email" },
              { value: "cloudinary", label: "Cloudinary" },
            ]}
          />
        </FormRow>
      </SettingsSection>

      {d.mode === "cloudinary" && (
        <SettingsSection title="Cloudinary">
          <FormRow label="Cloud Name" help="Cloudinary dashboard → Product Environment → Cloud name.">
            <TextInput value={d.cloudName} onChange={(e) => img.set("cloudName", e.currentTarget.value)} maw={420} />
          </FormRow>
          <FormRow label="API Key">
            <TextInput value={d.apiKey} onChange={(e) => img.set("apiKey", e.currentTarget.value)} maw={420} autoComplete="off" />
          </FormRow>
          <FormRow label="API Secret">
            <SecretInput value={d.apiSecret} onChange={(v) => img.set("apiSecret", v)} maw={420} />
          </FormRow>
          <FormRow label="Folder" help="Everything Newzlettr uploads goes in this folder.">
            <TextInput value={d.folder} onChange={(e) => img.set("folder", e.currentTarget.value)} maw={240} />
          </FormRow>
          <FormRow label="">
            <TestButton onTest={() => testSection("images", d)} />
          </FormRow>
        </SettingsSection>
      )}

      {q.data?.mode === "cloudinary" && (
        <SettingsSection title="Usage">
          <CloudinaryUsageCard />
        </SettingsSection>
      )}

      <SettingsSection title="Cache">
        <FormRow label="Image Cache">
          <Text size="sm" c="dimmed" mb="xs">
            Newzlettr remembers which posters it already uploaded so it never uploads the same one twice. Clearing forces fresh copies
            {d.mode === "cloudinary" ? " and deletes everything in the Cloudinary folder" : ""}.
          </Text>
          <TestButton
            label="Clear Image Cache"
            onTest={async () => {
              try {
                const r = await post<TestResult>("/api/settings/images/clear-cache");
                return r;
              } catch (e) {
                notifyError(e);
                throw e;
              }
            }}
          />
        </FormRow>
      </SettingsSection>
    </>
  );
}
