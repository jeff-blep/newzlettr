import { useMemo, useState, type ReactNode } from "react";
import { Center, Group, Table, Text, UnstyledButton } from "@mantine/core";
import { IconChevronDown, IconChevronUp, IconSelector } from "@tabler/icons-react";

export type SortDir = "asc" | "desc";
export interface SortState<K extends string> {
  key: K;
  dir: SortDir;
}
type Value = string | number | boolean | null | undefined;

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

/** Compares mixed values: empty values always sort last, strings naturally ("Item 2" < "Item 10"). */
export function compareValues(a: Value, b: Value): number {
  const ea = a === null || a === undefined || a === "";
  const eb = b === null || b === undefined || b === "";
  if (ea || eb) return ea === eb ? 0 : ea ? 1 : -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "boolean" && typeof b === "boolean") return Number(b) - Number(a); // true first when ascending
  return collator.compare(String(a), String(b));
}

function load<K extends string>(storageKey: string, keys: K[], fallback: SortState<K>): SortState<K> {
  try {
    const v = JSON.parse(localStorage.getItem(`nz-sort:${storageKey}`) ?? "null") as SortState<K> | null;
    if (v && keys.includes(v.key) && (v.dir === "asc" || v.dir === "desc")) return v;
  } catch {
    /* ignore */
  }
  return fallback;
}

/** Remembered sort state for a page (no row sorting - use for server-side sorting). */
export function useSortState<K extends string>(storageKey: string, keys: K[], initial: SortState<K>) {
  const [sort, setSort] = useState<SortState<K>>(() => load(storageKey, keys, initial));
  const toggle = (key: K) => {
    const next: SortState<K> = sort.key === key ? { key, dir: sort.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" };
    setSort(next);
    localStorage.setItem(`nz-sort:${storageKey}`, JSON.stringify(next));
  };
  return { sort, toggle };
}

/**
 * Client-side sorting for a table. `columns` maps each sortable column to the value used to
 * order it. Empty values stay at the bottom in both directions.
 */
export function useSortedRows<T, K extends string>(storageKey: string, rows: T[] | undefined, columns: Record<K, (row: T) => Value>, initial: SortState<NoInfer<K>>) {
  const keys = Object.keys(columns) as K[];
  const { sort, toggle } = useSortState(storageKey, keys, initial);
  const sorted = useMemo(() => {
    const get = columns[sort.key];
    const list = [...(rows ?? [])];
    list.sort((a, b) => {
      const va = get(a);
      const vb = get(b);
      const empty = (v: Value) => v === null || v === undefined || v === "";
      if (empty(va) || empty(vb)) return compareValues(va, vb); // empties last regardless of direction
      const c = compareValues(va, vb);
      return sort.dir === "asc" ? c : -c;
    });
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sort]);
  return { rows: sorted, sort, toggle };
}

/** Clickable column header with a direction arrow. */
export function SortTh<K extends string>({
  label,
  column,
  sort,
  onSort,
  w,
  align,
}: {
  label: ReactNode;
  column: K;
  sort: SortState<K>;
  onSort: (k: K) => void;
  w?: number | string;
  align?: "left" | "right";
}) {
  const active = sort.key === column;
  const Icon = active ? (sort.dir === "asc" ? IconChevronUp : IconChevronDown) : IconSelector;
  return (
    <Table.Th w={w} p={0} aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
      <UnstyledButton onClick={() => onSort(column)} w="100%" px="sm" py={10} style={{ borderRadius: 4 }} title={`Sort by ${typeof label === "string" ? label : "this column"}`}>
        <Group justify={align === "right" ? "flex-end" : "space-between"} gap={4} wrap="nowrap">
          <Text fw={600} size="sm" c={active ? "gray.1" : undefined}>
            {label}
          </Text>
          <Center c={active ? "newz.3" : "dimmed"}>
            <Icon size={14} stroke={1.8} />
          </Center>
        </Group>
      </UnstyledButton>
    </Table.Th>
  );
}
