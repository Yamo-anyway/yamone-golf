import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Profile } from "./model";
const key = "ymg:offline-profile:v1";
// A display cache only. All server mutations still require device authentication.
export const offlineProfile = {
  read: async (): Promise<Profile | null> => {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const p = JSON.parse(raw);
    return p &&
      typeof p.user_id === "string" &&
      typeof p.nickname === "string" &&
      typeof p.personal_code === "string" &&
      typeof p.personal_qr === "string"
      ? p
      : null;
  },
  write: (profile: Profile) =>
    AsyncStorage.setItem(key, JSON.stringify(profile)),
  clear: () => AsyncStorage.removeItem(key),
};
