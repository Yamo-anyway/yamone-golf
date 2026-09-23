import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Vault } from "./model";

const key = "yamone.golf.cf.vault.v1";
const marker = "yamone.golf.cf.installation.v1";
let initialized: Promise<void> | undefined;
function initialize() {
  if (!initialized)
    initialized = (async () => {
      if (!(await AsyncStorage.getItem(marker))) {
        // iOS Keychain may survive reinstall. Treat a missing installation marker as a new install.
        await SecureStore.deleteItemAsync(key);
        await AsyncStorage.setItem(marker, "1");
      }
    })().catch((error) => {
      initialized = undefined;
      throw error;
    });
  return initialized;
}
export async function readVault(): Promise<Vault> {
  await initialize();
  const raw = await SecureStore.getItemAsync(key);
  return raw ? JSON.parse(raw) : {};
}
export async function writeVault(value: Vault) {
  await initialize();
  await SecureStore.setItemAsync(key, JSON.stringify(value), {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  });
}
export const durableSecret = true;
