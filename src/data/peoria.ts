import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import * as Crypto from "expo-crypto";
import { request } from "./api";
import { PeoriaFlow } from "./peoria-flow-core";
import type {
  PeoriaHistory,
  PeoriaWrite,
  PeoriaAck,
} from "../../shared/peoria";
export const peoria = {
  history: (id: string) =>
    request<PeoriaHistory>("/api/rounds/" + id + "/peoria"),
  execute: (id: string, write: PeoriaWrite) =>
    request<PeoriaAck>("/api/rounds/" + id + "/peoria", "POST", write),
};
const flows = new Map<string, PeoriaFlow>();
export function peoriaFlow(user: string) {
  let flow = flows.get(user);
  if (!flow) {
    flow = new PeoriaFlow(
      user,
      {
        getItem: AsyncStorage.getItem,
        setItem: AsyncStorage.setItem,
        removeItem: AsyncStorage.removeItem,
        exclusive: async <T>(fn: () => Promise<T>) => {
          if (Platform.OS !== "web") return fn();
          if (!navigator.locks) throw { code: "offline_storage" };
          return navigator.locks.request("ymg:peoria:" + user, fn);
        },
      },
      Crypto.randomUUID,
    );
    flows.set(user, flow);
  }
  return flow;
}
