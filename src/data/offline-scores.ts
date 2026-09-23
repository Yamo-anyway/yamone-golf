import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import { OfflineScores } from "./score-offline-core";
import { scores } from "./scores";
const stores = new Map<string, OfflineScores>();
export function offlineScores(user: string) {
  let store = stores.get(user);
  if (!store) {
    store = new OfflineScores(
      user,
      {
        getItem: AsyncStorage.getItem,
        setItem: AsyncStorage.setItem,
        exclusive: async <T>(fn: () => Promise<T>): Promise<T> => {
          if (Platform.OS !== "web") return fn();
          if (!navigator.locks) throw { code: "offline_storage" };
          return navigator.locks.request("ymg:scores:" + user, fn);
        },
      },
      scores,
      Crypto.randomUUID,
    );
    stores.set(user, store);
  }
  return store;
}
