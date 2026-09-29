export type Language = "system" | "ko" | "en";
export type Profile = {
  user_id: string;
  nickname: string;
  personal_code: string;
  personal_qr: string;
  language: Language;
  created_at: number;
  updated_at: number;
};
export type PendingIdentity = {
  kind: "register" | "recover";
  device_secret: string;
  recovery_key: string;
  next_recovery_key?: string;
  nickname?: string;
  language?: Language;
};
export type PendingEmailRecovery = {
  request_id: string;
  email?: string;
  sent?: boolean;
  device_secret?: string;
  next_recovery_key?: string;
};
export type Vault = {
  secret?: string;
  pending?: PendingIdentity;
  emailRecovery?: PendingEmailRecovery;
  keyToSave?: string;
};
export type IdentityResult = { profile: Profile; server_time: number };
export type EmailRecoveryStatus = {
  configured: boolean;
  email_hint: string | null;
  verified_at: number | null;
  server_time: number;
};
export type EmailCodeResult = {
  status: "accepted" | "sent" | "verified";
  expires_at?: number;
  server_time?: number;
  test_code?: string;
};
