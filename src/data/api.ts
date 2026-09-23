import { Platform } from "react-native";
import type { IdentityResult, PendingIdentity, Language } from "./model";
import { readVault } from "./vault";

export class ApiError extends Error {
  constructor(
    public code: string,
    public status = 0,
  ) {
    super(code);
  }
}
function baseURL() {
  const configured = process.env.EXPO_PUBLIC_API_URL;
  if (configured) return configured.replace(/\/$/, "");
  if (Platform.OS === "web") return "";
  throw new ApiError("configuration");
}
async function request<T>(
  path: string,
  method = "GET",
  value?: unknown,
): Promise<T> {
  const base = baseURL();
  const vault = await readVault();
  const token = vault.pending?.device_secret ?? vault.secret;
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 12000);
  try {
    const response = await fetch(base + path, {
      method,
      credentials: "include",
      signal: abort.signal,
      headers: {
        ...(value !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: value !== undefined ? JSON.stringify(value) : undefined,
    });
    const data = await response.json();
    if (!response.ok)
      throw new ApiError(data.error ?? "server_error", response.status);
    return data as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError("network");
  } finally {
    clearTimeout(timer);
  }
}
export const api = {
  me: () => request<IdentityResult>("/api/me"),
  identity: (pending: PendingIdentity) =>
    request<IdentityResult>(
      pending.kind === "register" ? "/api/users" : "/api/recovery/claim",
      "POST",
      { ...pending, client: Platform.OS === "web" ? "web" : "native" },
    ),
  update: (value: { nickname?: string; language?: Language }) =>
    request<IdentityResult>("/api/me", "PATCH", value),
  reset: () => request<{ ok: true }>("/api/device/reset", "POST", {}),
};
