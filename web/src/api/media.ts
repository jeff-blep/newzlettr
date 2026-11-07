import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { HostPick, MediaRef, Recipient, RecipientImportResult, StatsResponse } from "../../../shared/types";
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
    create: useMutation({ mutationFn: (r: { name: string; email: string; enabled: boolean }) => post<Recipient>("/api/recipients", r), onSuccess: done }),
    update: useMutation({
      mutationFn: ({ id, ...patch }: { id: number; name?: string; email?: string; enabled?: boolean }) => put<Recipient>(`/api/recipients/${id}`, patch),
      onSuccess: done,
    }),
    remove: useMutation({ mutationFn: (id: number) => del<void>(`/api/recipients/${id}`), onSuccess: done }),
    importPlex: useMutation({ mutationFn: () => post<RecipientImportResult>("/api/recipients/import/plex"), onSuccess: done }),
  };
}

/* --------------------------------- media --------------------------------- */

export function usePlexSearch(q: string) {
  return useQuery({
    queryKey: ["plex", "search", q],
    queryFn: () => get<MediaRef[]>(`/api/plex/search?q=${encodeURIComponent(q)}`),
    enabled: q.trim().length >= 2,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
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
