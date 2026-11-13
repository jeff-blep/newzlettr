import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { HostPick, IgnoredPerson, MediaRef, Recipient, RecipientImportResult, StatsResponse, WatchUser } from "../../../shared/types";
import { del, get, post, put } from "./client";

/* ------------------------------- recipients ------------------------------- */

const recipientsKey = ["recipients"] as const;

export function useRecipients() {
  return useQuery({ queryKey: recipientsKey, queryFn: () => get<Recipient[]>("/api/recipients") });
}

export function useRecipientMutations() {
  const qc = useQueryClient();
  const done = () => qc.invalidateQueries({ queryKey: recipientsKey });
  return {
    create: useMutation({ mutationFn: (r: { name: string; email: string }) => post<Recipient>("/api/recipients", r), onSuccess: done }),
    update: useMutation({
      mutationFn: ({ id, ...patch }: { id: number; name?: string; email?: string }) => put<Recipient>(`/api/recipients/${id}`, patch),
      onSuccess: done,
    }),
    remove: useMutation({ mutationFn: ({ id, ignore }: { id: number; ignore: boolean }) => del<void>(`/api/recipients/${id}${ignore ? "?ignore=1" : ""}`), onSuccess: done }),
    bulkDelete: useMutation({
      mutationFn: (b: { ids: number[]; ignore: boolean }) => post<{ deleted: number; ignored: number }>("/api/recipients/bulk-delete", b),
      onSuccess: done,
    }),
    syncPlex: useMutation({
      mutationFn: () => post<{ shares: number; libraries: number; noLibraries: number; invited: number; noAccess: number }>("/api/recipients/sync/plex"),
      onSuccess: done,
    }),
    importPlex: useMutation({ mutationFn: () => post<RecipientImportResult>("/api/recipients/import/plex"), onSuccess: done }),
  };
}

export function useIgnored() {
  return useQuery({ queryKey: ["recipients", "ignored"], queryFn: () => get<IgnoredPerson[]>("/api/recipients/ignored") });
}

export function useUnignore() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: number[]) => post<{ removed: number }>("/api/recipients/ignored/remove", { ids }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["recipients"] }),
  });
}

/* --------------------------------- media --------------------------------- */

export function usePlexSearch(q: string, type?: "movie" | "show") {
  return useQuery({
    queryKey: ["plex", "search", q, type ?? "all"],
    queryFn: () => get<MediaRef[]>(`/api/plex/search?q=${encodeURIComponent(q)}${type ? `&type=${type}` : ""}`),
    enabled: q.trim().length >= 2,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
}

/** Seasons of a show, or episodes of a season. */
export function usePlexChildren(ratingKey: string | undefined) {
  return useQuery({
    queryKey: ["plex", "children", ratingKey],
    queryFn: () => get<MediaRef[]>(`/api/plex/children/${ratingKey}`),
    enabled: !!ratingKey,
    staleTime: 5 * 60_000,
  });
}

export function usePlexItem(ratingKey: string | undefined) {
  return useQuery({
    queryKey: ["plex", "item", ratingKey],
    queryFn: () => get<MediaRef>(`/api/plex/item/${ratingKey}`),
    enabled: !!ratingKey,
    staleTime: 5 * 60_000,
  });
}

export const posterUrl = (thumb: string | undefined, w = 200) => (thumb ? `/api/plex/image?path=${encodeURIComponent(thumb)}&w=${w}` : undefined);

const pickKey = ["host-pick"] as const;
export function useHostPick() {
  return useQuery({ queryKey: pickKey, queryFn: () => get<HostPick>("/api/host-pick") });
}
export function useSaveHostPick() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { plexItemId: string | null; note: string }) => put<HostPick>("/api/host-pick", p),
    onSuccess: (d) => qc.setQueryData(pickKey, d),
  });
}

export function useStats(days: number) {
  return useQuery({
    queryKey: ["stats", days],
    queryFn: () => get<StatsResponse>(`/api/stats?days=${days}`),
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
  });
}

export function useWatchUsers() {
  return useQuery({ queryKey: ["watch-users"], queryFn: () => get<WatchUser[]>("/api/watch-users"), staleTime: 5 * 60_000 });
}
