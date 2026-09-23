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
export type Vault = {
  secret?: string;
  pending?: PendingIdentity;
  keyToSave?: string;
};
export type IdentityResult = { profile: Profile; server_time: number };
