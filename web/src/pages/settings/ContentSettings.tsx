import { Alert, Center, Checkbox, ColorInput, Loader, NumberInput, TagsInput, Textarea, TextInput } from "@mantine/core";
import { useDraft, useSaveSection, useSection } from "../../api/sections";
import { FormRow, SettingsSection } from "../../components/FormRow";
import { notifyError, notifyOk } from "../../components/notify";
import { PageToolbar } from "../../components/PageToolbar";
import { useUnsavedChanges } from "../../components/useUnsavedChanges";

export function ContentSettings() {
  const q = useSection("content");
  const c = useDraft(q.data);
  const save = useSaveSection("content");
  const guard = useUnsavedChanges(c.dirty);

  if (q.error) return <Alert color="red">{String(q.error)}</Alert>;
  if (!c.draft) return <Center p="xl"><Loader /></Center>;
  const d = c.draft;
  const num = (k: "itemsPerCard" | "recentMoviesMax" | "recentShowsMax" | "episodesPerShow", min: number, max: number) => (
    <NumberInput value={d[k]} onChange={(v) => typeof v === "number" && c.set(k, v)} min={min} max={max} w={120} />
  );

  return (
    <>
      {guard}
      <PageToolbar
        title="Content"
        dirty={c.dirty}
        saving={save.isPending}
        onSave={() =>
          save.mutate(c.changes(), {
            onSuccess: () => notifyOk("Content settings saved"),
            onError: (e) => notifyError(e, "Couldn't save"),
          })
        }
      />

      <SettingsSection title="Look">
        <FormRow label="Header Title" help="Big title at the top of every email. Leave empty to use “<your Plex server name> Newsletter”.">
          <TextInput value={d.headerTitle} onChange={(e) => c.set("headerTitle", e.currentTarget.value)} placeholder="My Plex Newsletter" maw={420} />
        </FormRow>
        <FormRow label="Accent Color" help="Used for card labels, buttons and bars.">
          <ColorInput value={d.accentColor} onChange={(v) => c.set("accentColor", v)} format="hex" maw={200} swatches={["#7c5cff", "#e5a00d", "#35c5f4", "#ff5c8a", "#2fb380", "#f06543"]} />
        </FormRow>
        <FormRow label="Footer" help="Optional line above the standard footer (e.g. how to reach you).">
          <Textarea value={d.footerText} onChange={(e) => c.set("footerText", e.currentTarget.value)} autosize minRows={2} maw={520} />
        </FormRow>
      </SettingsSection>

      <SettingsSection title="Cards">
        <FormRow label="Rows per Ranked Card" help="Most watched, popular and platform cards.">
          {num("itemsPerCard", 1, 15)}
        </FormRow>
        <FormRow label="New Movies (max)">{num("recentMoviesMax", 1, 30)}</FormRow>
        <FormRow label="New TV Shows (max)">{num("recentShowsMax", 1, 30)}</FormRow>
        <FormRow label="Episodes per Show" help="Further episodes collapse into “+ N more”.">
          {num("episodesPerShow", 1, 20)}
        </FormRow>
        <FormRow label="Summaries">
          <Checkbox label="Show plot summaries" checked={d.showSummaries} onChange={(e) => c.set("showSummaries", e.currentTarget.checked)} />
        </FormRow>
        <FormRow label="Watch Links" help="Titles and posters link to the item in Plex Web (works for anyone with access to your server).">
          <Checkbox label="Link titles to Plex" checked={d.includeWatchLinks} onChange={(e) => c.set("includeWatchLinks", e.currentTarget.checked)} />
        </FormRow>
      </SettingsSection>

      <SettingsSection title="Filters">
        <FormRow label="Excluded Shows" help="Never listed under New Episodes — handy for daily shows. Type a title and press Enter.">
          <TagsInput value={d.excludedShows} onChange={(v) => c.set("excludedShows", v)} placeholder="e.g. Jeopardy!" maw={520} clearable />
        </FormRow>
      </SettingsSection>
    </>
  );
}
