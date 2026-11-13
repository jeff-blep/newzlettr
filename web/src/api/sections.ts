import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import type { HealthResponse, SettingsSections, TestResult } from "../../../shared/types";
import { get, post, put } from "./client";

export type EditableSection = "plex" | "tautulli" | "smtp" | "images" | "content" | "notifications";

const key = (s: EditableSection) => ["settings", s] as const;

export function useSection<S extends EditableSection>(section: S) {
  return useQuery({ queryKey: key(section), queryFn: () => get<SettingsSections[S]>(`/api/settings/${section}`) });
}

export function useSaveSection<S extends EditableSection>(section: S) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<SettingsSections[S]>) => put<SettingsSections[S]>(`/api/settings/${section}`, patch),
    onSuccess: (data) => {
      qc.setQueryData(key(section), data);
      // content changes (e.g. who's left out of watch stats) change the stats
      if (section === "content") void qc.invalidateQueries({ queryKey: ["stats"] });
      // health re-runs server-side after a save; refresh the badge shortly after
      setTimeout(() => void qc.invalidateQueries({ queryKey: healthKey }), 3000);
    },
  });
}

export function testSection<S extends EditableSection>(section: S, settings: Partial<SettingsSections[S]>, extra: Record<string, unknown> = {}) {
  return post<TestResult>(`/api/settings/${section}/test`, { settings, ...extra });
}

export const healthKey = ["system", "health"] as const;
export function useHealth() {
  return useQuery({ queryKey: healthKey, queryFn: () => get<HealthResponse>("/api/system/health"), refetchInterval: 60_000 });
}
export function useRunHealth() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: () => post<HealthResponse>("/api/system/health"), onSuccess: (d) => qc.setQueryData(healthKey, d) });
}

/** Local editable copy of server data + dirty tracking. Resets when the server copy changes. */
export function useDraft<T extends object>(data: T | undefined) {
  const [draft, setDraft] = useState<T | null>(null);
  useEffect(() => {
    if (data) setDraft(data);
  }, [data]);
  const dirty = useMemo(() => !!data && !!draft && JSON.stringify(data) !== JSON.stringify(draft), [data, draft]);
  const set = <K extends keyof T>(k: K, v: T[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d));
  /** Only the fields that differ from the server copy. */
  const changes = (): Partial<T> => {
    if (!data || !draft) return {};
    return Object.fromEntries(
      Object.entries(draft).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify((data as Record<string, unknown>)[k])),
    ) as Partial<T>;
  };
  return { draft, set, dirty, changes, reset: () => data && setDraft(data) };
}
