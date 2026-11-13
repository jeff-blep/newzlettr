import { useEffect, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  Center,
  Combobox,
  Group,
  Loader,
  SegmentedControl,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
  useCombobox,
} from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { IconSearch, IconX } from "@tabler/icons-react";
import type { MediaRef } from "../../../shared/types";
import { useHostPick, usePlexChildren, usePlexItem, usePlexSearch, useSaveHostPick } from "../api/media";
import { FormRow, SettingsSection } from "../components/FormRow";
import { notifyError, notifyOk } from "../components/notify";
import { PageToolbar } from "../components/PageToolbar";
import { Poster } from "../components/Poster";
import { useUnsavedChanges } from "../components/useUnsavedChanges";

export function HostPickPage() {
  const { data, isPending, error } = useHostPick();
  const save = useSaveHostPick();
  const [item, setItem] = useState<MediaRef | null>(null);
  const [note, setNote] = useState("");
  const [kind, setKind] = useState<Kind>("movie");

  useEffect(() => {
    if (data) {
      setItem(data.item);
      setNote(data.note);
      setKind(kindOf(data.item));
    }
  }, [data]);
  const showKey = showKeyOf(item);

  const dirty = !!data && ((item?.ratingKey ?? null) !== (data.item?.ratingKey ?? data.plexItemId) || note !== data.note);
  const guard = useUnsavedChanges(dirty);

  if (isPending) return <Center p="xl"><Loader /></Center>;
  if (error || !data) return <Alert color="red">{String(error)}</Alert>;

  return (
    <>
      {guard}
      <PageToolbar
        title="Host's Pick"
        dirty={dirty}
        saving={save.isPending}
        onSave={() =>
          save.mutate(
            { plexItemId: item?.ratingKey ?? null, note },
            { onSuccess: () => notifyOk("Host's Pick saved"), onError: (e) => notifyError(e, "Couldn't save") },
          )
        }
      />
      <Text c="dimmed" size="sm" mb="lg" maw={720}>
        Feature one title from your library with a few words about why. It appears wherever a template uses the Host's Pick card.
      </Text>

      <SettingsSection title="Title">
        <FormRow label="Type">
          <SegmentedControl
            value={kind}
            onChange={(v) => setKind(v as Kind)}
            data={[
              { value: "movie", label: "Movie" },
              { value: "tv", label: "TV Show" },
            ]}
          />
        </FormRow>
        <FormRow label="Search Plex">
          <PlexSearch key={kind} type={kind === "tv" ? "show" : "movie"} onPick={setItem} />
        </FormRow>
        {kind === "tv" && showKey && (
          <FormRow label="Feature">
            <ShowOptions key={showKey} item={item!} showKey={showKey} onChange={setItem} />
          </FormRow>
        )}
        <FormRow label="Selected">
          {data.itemError && !item && (
            <Alert color="yellow" variant="light" mb="sm">
              {data.itemError}
            </Alert>
          )}
          {item ? (
            <Card bg="var(--nz-sidebar-bg)" maw={640}>
              <Group align="flex-start" wrap="nowrap">
                <Poster thumb={item.thumb} width={110} />
                <Stack gap={6} style={{ flex: 1 }}>
                  <Group justify="space-between" wrap="nowrap" align="flex-start">
                    <Title order={4}>
                      {item.title}
                      {item.year ? <Text span c="dimmed" fw={400}> ({item.year})</Text> : null}
                    </Title>
                    <Button size="xs" variant="subtle" color="gray" leftSection={<IconX size={14} />} onClick={() => setItem(null)}>
                      Clear
                    </Button>
                  </Group>
                  {item.subtitle && <Text size="sm" c="dimmed">{item.subtitle}</Text>}
                  <Badge variant="light" size="sm" w="fit-content">
                    {TYPE_LABEL[item.type ?? ""] ?? item.type}
                  </Badge>
                  {item.summary && (
                    <Text size="sm" c="gray.4" lineClamp={5}>
                      {item.summary}
                    </Text>
                  )}
                </Stack>
              </Group>
            </Card>
          ) : (
            <Text size="sm" c="dimmed">
              Nothing picked. Search above.
            </Text>
          )}
        </FormRow>
      </SettingsSection>

      <SettingsSection title="Your Note">
        <FormRow label="Comments" help="Shown under the title in the email. Plain text; line breaks are kept.">
          <Textarea value={note} onChange={(e) => setNote(e.currentTarget.value)} autosize minRows={4} maxRows={14} maxLength={4000} />
          <Text size="xs" c="dimmed" ta="right" mt={2}>
            {note.length}/4000
          </Text>
        </FormRow>
      </SettingsSection>
    </>
  );
}

type Kind = "movie" | "tv";
const TYPE_LABEL: Record<string, string> = { movie: "Movie", show: "Whole series", episode: "Episode", season: "Season" };
const kindOf = (m: MediaRef | null): Kind => (m && m.type !== "movie" ? "tv" : "movie");
/** The show a TV pick belongs to (the pick itself when it's the whole series). */
const showKeyOf = (m: MediaRef | null) => (m?.type === "show" ? m.ratingKey : m?.type === "episode" || m?.type === "season" ? m.showRatingKey : undefined);

/** An episode ref's title is the show's name; this is the episode's own. */
const episodeName = (m: MediaRef) => m.episodeTitle ?? m.title;

/** Whole series, or one episode picked by season then episode. */
function ShowOptions({ item, showKey, onChange }: { item: MediaRef; showKey: string; onChange: (m: MediaRef) => void }) {
  const [mode, setMode] = useState<"series" | "episode">(item.type === "episode" ? "episode" : "series");
  const [seasonKey, setSeasonKey] = useState<string | null>(item.type === "episode" ? (item.seasonRatingKey ?? null) : null);
  const showQ = usePlexItem(item.type === "show" ? undefined : showKey);
  const show = item.type === "show" ? item : showQ.data;
  const seasons = usePlexChildren(mode === "episode" ? showKey : undefined);
  const episodes = usePlexChildren(mode === "episode" && seasonKey ? seasonKey : undefined);

  // A show with one season: pick it automatically.
  useEffect(() => {
    if (mode === "episode" && !seasonKey && seasons.data?.length === 1) setSeasonKey(seasons.data[0]!.ratingKey ?? null);
  }, [mode, seasonKey, seasons.data]);

  return (
    <Stack gap="sm" maw={520}>
      <SegmentedControl
        style={{ alignSelf: "flex-start" }}
        value={mode}
        onChange={(v) => {
          setMode(v as "series" | "episode");
          if (v === "series" && show) onChange(show);
        }}
        data={[
          { value: "series", label: "Whole series" },
          { value: "episode", label: "One episode" },
        ]}
      />
      {mode === "episode" && (
        <Group grow align="flex-start">
          <Select
            label="Season"
            placeholder={seasons.isPending ? "Loading…" : "Pick a season"}
            data={(seasons.data ?? []).map((x) => ({ value: x.ratingKey ?? "", label: x.title }))}
            value={seasonKey}
            onChange={setSeasonKey}
            allowDeselect={false}
            error={seasons.error ? String(seasons.error) : undefined}
          />
          <Select
            label="Episode"
            placeholder={!seasonKey ? "Pick a season first" : episodes.isPending ? "Loading…" : "Pick an episode"}
            disabled={!seasonKey}
            searchable
            data={(episodes.data ?? []).map((x) => ({ value: x.ratingKey ?? "", label: `${x.index ?? "?"}. ${episodeName(x)}` }))}
            value={item.type === "episode" && item.seasonRatingKey === seasonKey ? (item.ratingKey ?? null) : null}
            onChange={(k) => {
              const ep = episodes.data?.find((x) => x.ratingKey === k);
              if (ep) onChange(ep);
            }}
            allowDeselect={false}
            error={episodes.error ? String(episodes.error) : undefined}
          />
        </Group>
      )}
      {mode === "episode" && item.type !== "episode" && (
        <Text size="xs" c="dimmed">
          Until you pick an episode, the whole series is featured.
        </Text>
      )}
    </Stack>
  );
}

function PlexSearch({ onPick, type }: { onPick: (m: MediaRef) => void; type: "movie" | "show" }) {
  const [q, setQ] = useState("");
  const [debounced] = useDebouncedValue(q, 300);
  const results = usePlexSearch(debounced, type);
  const combobox = useCombobox({ onDropdownClose: () => combobox.resetSelectedOption() });
  const items = results.data ?? [];

  return (
    <Combobox
      store={combobox}
      onOptionSubmit={(key) => {
        const m = items.find((x) => x.ratingKey === key);
        if (m) onPick(m);
        setQ("");
        combobox.closeDropdown();
      }}
    >
      <Combobox.Target>
        <TextInput
          leftSection={<IconSearch size={16} />}
          rightSection={results.isFetching ? <Loader size={14} /> : null}
          placeholder={type === "show" ? "Start typing a TV show…" : "Start typing a movie…"}
          value={q}
          onChange={(e) => {
            setQ(e.currentTarget.value);
            combobox.openDropdown();
          }}
          onFocus={() => q && combobox.openDropdown()}
          onBlur={() => combobox.closeDropdown()}
          maw={520}
        />
      </Combobox.Target>
      <Combobox.Dropdown hidden={debounced.trim().length < 2}>
        <Combobox.Options mah={420} style={{ overflowY: "auto" }}>
          {results.error && <Combobox.Empty>{String(results.error)}</Combobox.Empty>}
          {!results.isFetching && items.length === 0 && <Combobox.Empty>No matches in your library</Combobox.Empty>}
          {items.map((m) => (
            <Combobox.Option value={m.ratingKey ?? ""} key={m.ratingKey}>
              <Group wrap="nowrap" gap="sm">
                <Poster thumb={m.thumb} width={34} />
                <div>
                  <Text size="sm">
                    {m.title}
                    {m.year ? ` (${m.year})` : ""}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {m.type === "show"
                      ? m.episodeCount
                        ? `${m.episodeCount} episodes`
                        : "TV show"
                      : (m.subtitle ?? "Movie")}
                  </Text>
                </div>
              </Group>
            </Combobox.Option>
          ))}
        </Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
  );
}
