import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { RecipientList } from "../../../shared/types";
import { del, get, post, put } from "./client";

const key = ["recipient-lists"] as const;

export function useLists() {
  return useQuery({ queryKey: key, queryFn: () => get<RecipientList[]>("/api/recipient-lists") });
}

export function useListMutations() {
  const qc = useQueryClient();
  const done = () => {
    void qc.invalidateQueries({ queryKey: key });
    void qc.invalidateQueries({ queryKey: ["recipients"] });
    void qc.invalidateQueries({ queryKey: ["newsletters"] });
  };
  return {
    create: useMutation({
      mutationFn: (l: { name: string; description?: string; memberIds?: number[] }) => post<RecipientList>("/api/recipient-lists", l),
      onSuccess: done,
    }),
    update: useMutation({
      mutationFn: ({ id, ...patch }: { id: number; name?: string; description?: string }) => put<RecipientList>(`/api/recipient-lists/${id}`, patch),
      onSuccess: done,
    }),
    members: useMutation({
      mutationFn: ({ id, add, remove }: { id: number; add?: number[]; remove?: number[] }) =>
        post<{ added: number; removed: number; list: RecipientList }>(`/api/recipient-lists/${id}/members`, { add, remove }),
      onSuccess: done,
    }),
    remove: useMutation({ mutationFn: (id: number) => del<void>(`/api/recipient-lists/${id}`), onSuccess: done }),
  };
}
