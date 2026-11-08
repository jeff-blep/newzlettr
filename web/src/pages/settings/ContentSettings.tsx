import { Alert, Center, Checkbox, Loader, MultiSelect, NumberInput, TagsInput, Text } from "@mantine/core";
import { useWatchUsers } from "../../api/media";
import { useDraft, useSaveSection, useSection } from "../../api/sections";
import { FormRow, SettingsSection } from "../../components/FormRow";
import { notifyError, notifyOk } from "../../components/notify";
import { PageToolbar } from "../../components/PageToolbar";
import { useUnsavedChanges } from "../../components/useUnsavedChanges";

export function ContentSettings() {
  const q = useSection("content");
  const c = useDraft(q.data);
  const save = useSaveSection("content");
  const watchUsers = useWatchUsers();
  const owner = watchUsers.data?.find((u) => u.isOwner);
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

      <SettingsSection title="Most Watched">
        <FormRow
          label="Leave Out the Host"
          help="Your own plays won't count toward the Most watched movies and shows lists (in newsletters and on the Stats page). Everything else — plays, hours, platforms, Popular — stays exactly as Tautulli reports it."
        >
          <Checkbox
            label={`Leave out the server owner's plays${owner ? ` (${owner.name})` : ""}`}
            checked={d.excludeOwnerPlays}
            onChange={(e) => c.set("excludeOwnerPlays", e.currentTarget.checked)}
          />
        </FormRow>
        <FormRow label="Also Leave Out" help="Anyone else whose plays shouldn't count toward Most watched (e.g. a TV that's left playing in the background).">
          <MultiSelect
            placeholder={watchUsers.isPending ? "Loading Plex users…" : "Pick people"}
            data={(watchUsers.data ?? []).filter((u) => !u.isOwner).map((u) => ({ value: String(u.userId), label: u.name }))}
            value={d.excludedUserIds.map(String)}
            onChange={(v) => c.set("excludedUserIds", v.map(Number))}
            searchable
            clearable
            maw={520}
            nothingFoundMessage="Nobody matches"
          />
          {watchUsers.error && (
            <Text size="xs" c="red" mt={4}>
              Couldn't load users from Tautulli: {String(watchUsers.error)}
            </Text>
          )}
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
