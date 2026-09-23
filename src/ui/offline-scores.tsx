import { useEffect, useMemo, useSyncExternalStore } from "react";
import { AppState, Platform } from "react-native";
import * as Network from "expo-network";
import { offlineScores } from "../data/offline-scores";
import type { OfflineScores } from "../data/score-offline-core";
export function useOfflineScores(user: string) {
  const store = useMemo(() => offlineScores(user), [user]);
  const snapshot = useSyncExternalStore(
    store.subscribe,
    store.snapshot,
    store.snapshot,
  );
  useEffect(() => {
    void store.open().catch(() => {});
  }, [store]);
  return { store, ...snapshot };
}
export function startScoreSync(store: OfflineScores, onAuthError: () => void) {
  let active = true,
    ticking = false,
    revoked = false,
    foreground = AppState.currentState !== "background",
    connected = true,
    timer: ReturnType<typeof setTimeout> | undefined,
    delay = 5000;
  store.enabled = true;
  const clear = () => {
    if (timer) {
      clearTimeout(timer);
      timer = undefined;
    }
  };
  const tick = async () => {
    if (ticking || revoked) return;
    clear();
    if (!active || !foreground || !connected) return;
    ticking = true;
    try {
      await store.sync();
    } catch {
      /* Visible via store snapshot; no queue is removed. */
    } finally {
      ticking = false;
    }
    if (!active) return;
    if (
      ["device_moved", "unauthorized", "user_changed"].includes(
        store.snapshot().error,
      )
    ) {
      store.enabled = false;
      onAuthError();
      return;
    }
    if (store.pending()) {
      timer = setTimeout(() => void tick(), delay);
      delay = Math.min(delay * 2, 60000);
    } else delay = 5000;
  };
  const off = store.subscribe(() => {
    if (
      active &&
      !revoked &&
      ["device_moved", "unauthorized", "user_changed"].includes(
        store.snapshot().error,
      )
    ) {
      revoked = true;
      store.enabled = false;
      clear();
      onAuthError();
      return;
    }

    if (
      !active ||
      ticking ||
      revoked ||
      timer ||
      store.snapshot().syncing ||
      !store.pending() ||
      !foreground ||
      !connected
    )
      return;
    timer = setTimeout(() => void tick(), delay);
  });
  const state = AppState.addEventListener("change", (value) => {
    foreground = value === "active";
    if (foreground) void tick();
    else clear();
  });
  const net = Network.addNetworkStateListener((value) => {
    connected =
      value.isConnected !== false && value.isInternetReachable !== false;
    if (connected) {
      delay = 5000;
      void tick();
    } else clear();
  });
  // Browser's event is also used when the Network Information API is unavailable.
  const storageChanged = () => {
    void store.reloadLocal();
  };
  const online = () => {
    connected = true;
    delay = 5000;
    void tick();
  };
  if (Platform.OS === "web") {
    window.addEventListener("online", online);
    window.addEventListener("storage", storageChanged);
  }
  void tick();
  return () => {
    active = false;
    store.enabled = false;
    clear();
    off();
    state.remove();
    net.remove();
    if (Platform.OS === "web") {
      window.removeEventListener("online", online);
      window.removeEventListener("storage", storageChanged);
    }
  };
}
