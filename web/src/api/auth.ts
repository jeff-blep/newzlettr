import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import type { AuthStatus } from "../../../shared/types";
import { get, onUnauthorized, post } from "./client";

export const authKey = ["auth", "status"] as const;

export function useAuthStatus() {
  const qc = useQueryClient();
  useEffect(() => onUnauthorized(() => qc.invalidateQueries({ queryKey: authKey })), [qc]);
  return useQuery({ queryKey: authKey, queryFn: () => get<AuthStatus>("/api/auth/status"), staleTime: 60_000 });
}

export const setupAdmin = (username: string, password: string) => post("/api/auth/setup", { username, password });
export const login = (username: string, password: string) => post("/api/auth/login", { username, password });
export const logout = () => post("/api/auth/logout");
export const changePassword = (currentPassword: string, newPassword: string) =>
  post("/api/auth/password", { currentPassword, newPassword });
