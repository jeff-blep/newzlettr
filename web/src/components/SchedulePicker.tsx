import { useState } from "react";
import { Chip, Group, NumberInput, SegmentedControl, Stack, Text, TextInput } from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { useQuery } from "@tanstack/react-query";
import type { SchedulePreview } from "../../../shared/types";
import { post } from "../api/client";

type Mode = "daily" | "weekly" | "monthly" | "custom";
interface Parsed {
  mode: Mode;
  time: string; // HH:MM
  days: string[]; // "0".."6"
  dom: number;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function parseCron(expr: string): Parsed {
  const fallback: Parsed = { mode: "custom", time: "08:00", days: ["0"], dom: 1 };
  const p = expr.trim().split(/\s+/);
  if (p.length !== 5) return fallback;
  const [mi, h, dom, mon, dow] = p as [string, string, string, string, string];
  if (!/^\d+$/.test(mi) || !/^\d+$/.test(h) || mon !== "*") return fallback;
  const time = `${h.padStart(2, "0")}:${mi.padStart(2, "0")}`;
  if (dom === "*" && dow === "*") return { ...fallback, mode: "daily", time };
  if (dom === "*" && /^[0-7](,[0-7])*$/.test(dow)) return { ...fallback, mode: "weekly", time, days: dow.split(",").map((d) => String(Number(d) % 7)) };
  if (/^\d+$/.test(dom) && dow === "*") return { ...fallback, mode: "monthly", time, dom: Number(dom) };
  return fallback;
}

export function buildCron(p: Parsed): string {
  const [h = "8", m = "0"] = p.time.split(":");
  const base = `${Number(m)} ${Number(h)}`;
  if (p.mode === "daily") return `${base} * * *`;
  if (p.mode === "weekly") return `${base} * * ${[...p.days].sort().join(",") || "0"}`;
  return `${base} ${p.dom} * *`;
}

export function SchedulePicker({ value, onChange }: { value: string; onChange: (cron: string) => void }) {
  const [p, setP] = useState<Parsed>(() => parseCron(value));
  // Initialised once per mount; the parent remounts (key) when a different newsletter loads.
  const [custom, setCustom] = useState(value);

  const update = (next: Parsed) => {
    setP(next);
    if (next.mode !== "custom") onChange(buildCron(next));
  };

  const [debounced] = useDebouncedValue(value, 300);
  const preview = useQuery({
    queryKey: ["schedule-preview", debounced],
    queryFn: () => post<SchedulePreview>("/api/schedule/preview", { cron: debounced }),
    enabled: !!debounced,
  });

  return (
    <Stack gap="sm">
      <SegmentedControl
        value={p.mode}
        onChange={(m) => {
          if (m === "custom") {
            setP({ ...p, mode: "custom" });
            setCustom(value);
          } else update({ ...p, mode: m as Mode });
        }}
        data={[
          { value: "daily", label: "Daily" },
          { value: "weekly", label: "Weekly" },
          { value: "monthly", label: "Monthly" },
          { value: "custom", label: "Custom (cron)" },
        ]}
        w="fit-content"
      />
      {p.mode === "weekly" && (
        <Chip.Group multiple value={p.days} onChange={(days) => days.length && update({ ...p, days })}>
          <Group gap={6}>
            {DAYS.map((d, i) => (
              <Chip key={d} value={String(i)} size="sm">
                {d}
              </Chip>
            ))}
          </Group>
        </Chip.Group>
      )}
      {p.mode !== "custom" ? (
        <Group gap="sm" align="flex-end">
          {p.mode === "monthly" && (
            <NumberInput label="Day of month" value={p.dom} onChange={(v) => typeof v === "number" && update({ ...p, dom: v })} min={1} max={28} w={130} />
          )}
          <TextInput label="Time" type="time" value={p.time} onChange={(e) => e.currentTarget.value && update({ ...p, time: e.currentTarget.value })} w={140} />
        </Group>
      ) : (
        <TextInput
          label="Cron expression"
          description="minute hour day-of-month month day-of-week, e.g. 0 8 * * 0 = Sundays 8:00"
          value={custom}
          onChange={(e) => {
            setCustom(e.currentTarget.value);
            onChange(e.currentTarget.value);
          }}
          styles={{ input: { fontFamily: "ui-monospace, Menlo, monospace" } }}
          maw={320}
        />
      )}
      {preview.data &&
        (preview.data.valid ? (
          <Text size="xs" c="dimmed">
            <b>{preview.data.description}</b> ({preview.data.timezone}). Next:{" "}
            {preview.data.next
              .map((iso) =>
                new Date(iso).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: preview.data!.timezone }),
              )
              .join(" · ")}
          </Text>
        ) : (
          <Text size="xs" c="red">
            {preview.data.error}
          </Text>
        ))}
    </Stack>
  );
}
