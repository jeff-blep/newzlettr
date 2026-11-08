import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CardInfo, EmailTheme, RenderResult, Template } from "../../../shared/types";
import { del, get, post, put } from "./client";

const key = ["templates"] as const;

export function useTemplates() {
  return useQuery({ queryKey: key, queryFn: () => get<Template[]>("/api/templates") });
}

export function useTemplate(id: number | null) {
  return useQuery({ queryKey: [...key, id], queryFn: () => get<Template>(`/api/templates/${id}`), enabled: id !== null });
}

export function useCards() {
  return useQuery({ queryKey: ["cards"], queryFn: () => get<CardInfo[]>("/api/templates/cards"), staleTime: Infinity });
}

export function useTemplateMutations() {
  const qc = useQueryClient();
  const done = () => qc.invalidateQueries({ queryKey: key });
  return {
    create: useMutation({ mutationFn: (t: { name: string; html: string }) => post<Template>("/api/templates", t), onSuccess: done }),
    update: useMutation({
      mutationFn: ({ id, ...patch }: { id: number; name?: string; html?: string }) => put<Template>(`/api/templates/${id}`, patch),
      onSuccess: (t) => {
        qc.setQueryData([...key, t.id], t);
        void done();
      },
    }),
    duplicate: useMutation({ mutationFn: (id: number) => post<Template>(`/api/templates/${id}/duplicate`), onSuccess: done }),
    remove: useMutation({ mutationFn: (id: number) => del<void>(`/api/templates/${id}`), onSuccess: done }),
  };
}

export interface Look {
  emailTheme: EmailTheme;
  accentColor: string;
}

export const renderPreview = (html: string, look: Look, days?: number, scheme?: "light" | "dark") =>
  post<RenderResult>("/api/render/preview", { html, days, scheme, ...look });

export const sendTest = (html: string, to: string, look: Look, days?: number, subject?: string) =>
  post<{ ok: boolean; message: string; warnings: string[] }>("/api/render/test-send", { html, to, days, subject, ...look });
