import type { PendingIdentity, Vault, IdentityResult } from "./model";

export interface IdentityStorage {
  read(): Promise<Vault>;
  write(value: Vault): Promise<void>;
  durableSecret: boolean;
}
export function recoveryKeyFromBytes(bytes: Uint8Array) {
  if (bytes.length !== 32) throw new Error("Expected 32 random bytes");
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const raw = Array.from(bytes, (b) => alphabet[b % 32]).join("");
  return "YMGF-" + raw.match(/.{4}/g)!.join("-");
}
// Called only after durable storage succeeds. If the response is lost, the same
// secret is retried and the server returns the same identity, not another USER.
export async function submitIdentity(
  store: IdentityStorage,
  make: () => Promise<PendingIdentity>,
  send: (pending: PendingIdentity) => Promise<IdentityResult>,
) {
  let vault = await store.read();
  const pending = vault.pending ?? (await make());
  if (!vault.pending) {
    vault = { ...vault, pending };
    await store.write(vault);
  }
  const result = await send(pending);
  await store.write({
    ...(store.durableSecret ? { secret: pending.device_secret } : {}),
    keyToSave:
      pending.kind === "register"
        ? pending.recovery_key
        : pending.next_recovery_key,
  });
  return result;
}
