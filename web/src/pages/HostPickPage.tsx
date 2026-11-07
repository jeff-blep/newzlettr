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
import { useHostPick, usePlexSearch, useSaveHostPick } from "../api/media";
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

  useEffect(() => {
    if (data) {
      setItem(data.item);
      setNote(data.note);
    }
  }, [data]);

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
        <FormRow label="Search Plex">
          <PlexSearch onPick={setItem} />
        </FormRow>
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
                    {item.type}
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

function PlexSearch({ onPick }: { onPick: (m: MediaRef) => void }) {
  const [q, setQ] = useState("");
  const [debounced] = useDebouncedValue(q, 300);
  const results = usePlexSearch(debounced);
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
          placeholder="Start typing a movie or show…"
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
                    {m.subtitle ? `${m.subtitle} · ` : ""}
                    {m.type}
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
