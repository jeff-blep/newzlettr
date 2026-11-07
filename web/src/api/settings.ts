import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { GeneralSettings, GeneralSettingsResponse, SystemStatus } from "../../../shared/types";
import { get, post, put } from "./client";

const generalKey = ["settings", "general"] as const;

export function useGeneralSettings() {
  return useQuery({ queryKey: generalKey, queryFn: () => get<GeneralSettingsResponse>("/api/settings/general") });
}

export function useSaveGeneralSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<GeneralSettings>) => put<GeneralSettingsResponse>("/api/settings/general", patch),
    onSuccess: (data) => qc.setQueryData(generalKey, data),
  });
}

export function useRegenerateApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => post<GeneralSettingsResponse>("/api/settings/general/regenerate-api-key"),
    onSuccess: (data) => qc.setQueryData(generalKey, data),
  });
}

export function useSystemStatus() {
  return useQuery({ queryKey: ["system", "status"], queryFn: () => get<SystemStatus>("/api/system/status"), refetchInterval: 30_000 });
}
