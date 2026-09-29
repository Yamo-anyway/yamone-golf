import { Platform } from "react-native";
import type {
  EmailCodeResult,
  EmailRecoveryStatus,
  IdentityResult,
  PendingIdentity,
  Language,
} from "./model";
import { readVault } from "./vault";

export class ApiError extends Error {
  constructor(
    public code: string,
    public status = 0,
    public details?: unknown,
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
export async function request<T>(
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
      throw new ApiError(data.error ?? "server_error", response.status, data);
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
  emailRecoveryStatus: () =>
    request<EmailRecoveryStatus>("/api/email-recovery"),
  requestEmailVerification: (value: {
    request_id: string;
    email: string;
    language: "ko" | "en";
  }) =>
    request<EmailCodeResult>(
      "/api/email-recovery/verification-requests",
      "POST",
      value,
    ),
  verifyRecoveryEmail: (value: { request_id: string; code: string }) =>
    request<EmailCodeResult & { email_hint: string; verified_at: number }>(
      "/api/email-recovery/verify",
      "POST",
      value,
    ),
  requestEmailRecovery: (value: {
    request_id: string;
    email: string;
    language: "ko" | "en";
  }) =>
    request<EmailCodeResult>("/api/email-recovery/requests", "POST", value),
  claimEmailRecovery: (value: {
    request_id: string;
    code: string;
    device_secret: string;
    next_recovery_key: string;
  }) =>
    request<IdentityResult>("/api/email-recovery/claim", "POST", {
      ...value,
      client: Platform.OS === "web" ? "web" : "native",
    }),
};
