import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import * as Crypto from "expo-crypto";
import { request } from "./api";
import { ReceiptFlow, type ReceiptAPI } from "./receipt-flow-core";
import type {
  Delivery,
  Page,
  ReceiptItem,
  RecordDetail,
  Receipt,
} from "../../shared/records";
import type { RecordFilter } from "../../shared/personal-records";
const before = (cursor?: string | null) =>
  cursor ? "?before=" + encodeURIComponent(cursor) : "";
export const receiveAPI: ReceiptAPI = {
  prepare: (p) => request("/api/receipt-actions", "POST", p),
  settle: (p, outcome) =>
    request("/api/receipt-actions/" + p.action_id + "/ad", "POST", {
      user_id: p.user_id,
      outcome,
    }),
  execute: (p) =>
    request("/api/receipt-actions/" + p.action_id + "/execute", "POST", {
      user_id: p.user_id,
    }),
};
export const records = {
  inbox: (cursor?: string | null) =>
    request<Page<Delivery>>("/api/record-inbox" + before(cursor)),
  mine: (
    cursor?: string | null,
    filter: { q: string; scope: RecordFilter } = { q: "", scope: "all" },
  ) =>
    request<Page<ReceiptItem>>(
      "/api/records?q=" +
        encodeURIComponent(filter.q) +
        "&scope=" +
        filter.scope +
        (cursor ? "&before=" + encodeURIComponent(cursor) : ""),
    ),
  detail: (id: string) => request<RecordDetail>("/api/records/" + id),
  deliveries: (round: string, cursor?: string | null) =>
    request<Page<Delivery>>(
      "/api/rounds/" + round + "/deliveries" + before(cursor),
    ),
  send: (
    round: string,
    b: {
      user_id: string;
      mutation_id: string;
      slot_id: string;
      version: number;
      recipient_id: string;
    },
  ) =>
    request<{ delivery: Delivery }>(
      "/api/rounds/" + round + "/deliveries",
      "POST",
      b,
    ),
  cancel: (id: string, user_id: string, mutation_id: string) =>
    request<{ delivery: Delivery }>(
      "/api/deliveries/" + id + "/cancel",
      "POST",
      { user_id, mutation_id },
    ),
  remove: (id: string, user_id: string, mutation_id: string) =>
    request<{ receipt: Receipt }>("/api/records/" + id, "DELETE", {
      user_id,
      mutation_id,
    }),
};
const flows = new Map<string, ReceiptFlow>();
export function receiptFlow(user: string) {
  let flow = flows.get(user);
  if (!flow) {
    flow = new ReceiptFlow(
      user,
      {
        getItem: AsyncStorage.getItem,
        setItem: AsyncStorage.setItem,
        removeItem: AsyncStorage.removeItem,
        exclusive: async <T>(fn: () => Promise<T>) => {
          if (Platform.OS !== "web") return fn();
          if (!navigator.locks) throw { code: "offline_storage" };
          return navigator.locks.request("ymg:receipt:" + user, fn);
        },
      },
      Crypto.randomUUID,
    );
    flows.set(user, flow);
  }
  return flow;
}
