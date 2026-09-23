import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import * as Crypto from "expo-crypto";
import { request } from "./api";
import { Corrections, type CorrectionAPI } from "./corrections-core";
import type {
  PersonalScoreView,
  Statistics,
} from "../../shared/personal-records";
export const personalAPI = (user: string): CorrectionAPI => ({
  load: (id) =>
    request<PersonalScoreView>(
      "/api/records/" + id + "/scores?user_id=" + user,
    ),
  save: (id, w) => request("/api/records/" + id + "/scores", "PUT", w),
});
export const getStatistics = () => request<Statistics>("/api/statistics");
const stores = new Map<string, Corrections>();
export function corrections(user: string) {
  let store = stores.get(user);
  if (!store) {
    store = new Corrections(
      user,
      {
        getItem: AsyncStorage.getItem,
        setItem: AsyncStorage.setItem,
        exclusive: async <T>(fn: () => Promise<T>) => {
          if (Platform.OS !== "web") return fn();
          if (!navigator.locks) throw { code: "offline_storage" };
          return navigator.locks.request("ymg:corrections:" + user, fn);
        },
      },
      Crypto.randomUUID,
    );
    stores.set(user, store);
  }
  return store;
}
