import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Newsletter, NewsletterInput, RenderResult, SendRecord } from "../../../shared/types";
import { del, get, post, put } from "./client";
import { healthKey } from "./sections";

const key = ["newsletters"] as const;

export function useNewsletters() {
  return useQuery({ queryKey: key, queryFn: () => get<Newsletter[]>("/api/newsletters"), refetchInterval: 30_000 });
}

export function useNewsletterMutations() {
  const qc = useQueryClient();
  const done = () => {
    void qc.invalidateQueries({ queryKey: key });
    void qc.invalidateQueries({ queryKey: ["activity"] });
    void qc.invalidateQueries({ queryKey: ["templates"] });
    setTimeout(() => void qc.invalidateQueries({ queryKey: healthKey }), 2500);
  };
  return {
    create: useMutation({ mutationFn: (n: NewsletterInput) => post<Newsletter>("/api/newsletters", n), onSuccess: done }),
    update: useMutation({ mutationFn: ({ id, ...n }: NewsletterInput & { id: number }) => put<Newsletter>(`/api/newsletters/${id}`, n), onSuccess: done }),
    toggle: useMutation({ mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) => post<Newsletter>(`/api/newsletters/${id}/enabled`, { enabled }), onSuccess: done }),
    remove: useMutation({ mutationFn: (id: number) => del<void>(`/api/newsletters/${id}`), onSuccess: done }),
    send: useMutation({ mutationFn: ({ id, testTo }: { id: number; testTo?: string }) => post<SendRecord>(`/api/newsletters/${id}/send`, testTo ? { testTo } : {}), onSuccess: done }),
  };
}

export const previewNewsletter = (id: number) => get<RenderResult>(`/api/newsletters/${id}/preview`);

export function useActivity(status: string | null, page: number, sort: { key: string; dir: string }, pageSize = 25) {
  return useQuery({
    queryKey: ["activity", status, page, sort.key, sort.dir],
    queryFn: () =>
      get<{ total: number; records: SendRecord[] }>(
        `/api/activity?limit=${pageSize}&offset=${page * pageSize}&sort=${sort.key}&dir=${sort.dir}${status ? `&status=${status}` : ""}`,
      ),
    placeholderData: keepPreviousData,
    refetchInterval: 15_000,
  });
}
