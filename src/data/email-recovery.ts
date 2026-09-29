import type {
  EmailCodeResult,
  IdentityResult,
  PendingEmailRecovery,
  Vault,
} from "./model";

export interface EmailRecoveryStorage {
  read(): Promise<Vault>;
  write(value: Vault): Promise<void>;
  durableSecret: boolean;
}

export async function requestRecoveryCode(
  store: EmailRecoveryStorage,
  email: string,
  language: "ko" | "en",
  makeRequestId: () => string,
  send: (value: {
    request_id: string;
    email: string;
    language: "ko" | "en";
  }) => Promise<EmailCodeResult>,
) {
  const stored = await store.read();
  const normalized = email.trim().toLowerCase();
  const pending: PendingEmailRecovery =
    stored.emailRecovery?.email === normalized
      ? stored.emailRecovery
      : { request_id: makeRequestId(), email: normalized };
  await store.write({ ...stored, emailRecovery: pending });
  const result = await send({
    request_id: pending.request_id,
    email: normalized,
    language,
  });
  const latest = await store.read();
  await store.write({
    ...latest,
    emailRecovery: { ...pending, sent: true },
  });
  return { ...result, request_id: pending.request_id };
}

export async function submitEmailRecovery(
  store: EmailRecoveryStorage,
  requestId: string,
  code: string,
  makeCredentials: () => Promise<{
    device_secret: string;
    next_recovery_key: string;
  }>,
  send: (value: {
    request_id: string;
    code: string;
    device_secret: string;
    next_recovery_key: string;
  }) => Promise<IdentityResult>,
) {
  const stored = await store.read();
  const current: PendingEmailRecovery =
    stored.emailRecovery?.request_id === requestId
      ? stored.emailRecovery
      : { request_id: requestId };
  const generated =
    current.device_secret && current.next_recovery_key
      ? {
          device_secret: current.device_secret,
          next_recovery_key: current.next_recovery_key,
        }
      : await makeCredentials();
  const pending = { ...current, ...generated };
  await store.write({ ...stored, emailRecovery: pending });
  const result = await send({
    request_id: requestId,
    code,
    ...generated,
  });
  await store.write({
    ...(store.durableSecret ? { secret: generated.device_secret } : {}),
    keyToSave: generated.next_recovery_key,
  });
  return result;
}
