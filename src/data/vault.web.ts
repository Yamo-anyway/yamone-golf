import type { Vault } from "./model";
const key = "yamone.golf.cf.pending.v1";
// Stable web authentication belongs to the HttpOnly cookie. Only an unacknowledged
// bootstrap request / recovery key is temporarily held in this tab.
export async function readVault(): Promise<Vault> {
  const value = sessionStorage.getItem(key);
  return value ? JSON.parse(value) : {};
}
export async function writeVault(value: Vault) {
  if (Object.keys(value).length)
    sessionStorage.setItem(key, JSON.stringify(value));
  else sessionStorage.removeItem(key);
}
export const durableSecret = false;
