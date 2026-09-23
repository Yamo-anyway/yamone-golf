import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type SetStateAction,
} from "react";
import { Alert, AppState, Platform } from "react-native";
import { useFocusEffect } from "expo-router";
import { useNavigation, usePreventRemove } from "expo-router/react-navigation";
import { ApiError } from "../data/api";
import { useSession } from "./session";
import ko from "./locales/ko";
export async function confirm(
  message: string,
  yes: string,
  no: string,
): Promise<boolean> {
  if (Platform.OS === "web") return window.confirm(message);
  return new Promise((resolve) =>
    Alert.alert(
      "",
      message,
      [
        { text: no, style: "cancel", onPress: () => resolve(false) },
        { text: yes, onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    ),
  );
}
export function useTask() {
  const { t, refresh } = useSession();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const lock = useRef(false);
  const report = useCallback(
    (e: unknown) => {
      const code = e instanceof ApiError ? e.code : "storage";
      setError(code);
      if (code === "device_moved" || code === "unauthorized") void refresh();
    },
    [refresh],
  );
  const run = useCallback(
    async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
      if (lock.current) return;
      lock.current = true;
      setBusy(true);
      setError("");
      try {
        return await fn();
      } catch (e) {
        report(e);
      } finally {
        lock.current = false;
        setBusy(false);
      }
    },
    [report],
  );
  return {
    run,
    busy,
    error,
    setError,
    report,
    errorText: error
      ? t(error in ko ? (error as keyof typeof ko) : "server_error")
      : "",
  };
}
// Screen entry, foreground and explicit refresh only. Never replace an editor draft from this hook.
export function useLoad<T>(load: () => Promise<T>) {
  const task = useTask(),
    [data, setData] = useState<T | null>(null);
  const fn = useRef(load);
  useEffect(() => {
    fn.current = load;
  }, [load]);
  const serial = useRef(0),
    focused = useRef(false);
  const { setError, report } = task;
  const reload = useCallback(async () => {
    const n = ++serial.current;
    try {
      const value = await fn.current();
      if (n === serial.current && focused.current) {
        setData(value);
        setError("");
      }
    } catch (e) {
      if (n === serial.current && focused.current) report(e);
    }
  }, [setError, report]);
  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      void reload();
      const sub = AppState.addEventListener("change", (state) => {
        if (state === "active") void reload();
      });
      return () => {
        focused.current = false;
        serial.current++;
        sub.remove();
      };
    }, [reload]),
  );
  const commit = useCallback((value: SetStateAction<T | null>) => {
    serial.current++;
    setData(value);
  }, []);
  return { ...task, data, setData: commit, reload };
}
export function useDraftGuard(dirty: boolean) {
  const { t, phase } = useSession(),
    navigation = useNavigation();
  usePreventRemove(phase === "ready" && dirty, ({ data }) => {
    void confirm(t("roundUnsaved"), t("discard"), t("keepEditing")).then(
      (yes) => {
        if (yes) navigation.dispatch(data.action);
      },
    );
  });
  useEffect(() => {
    if (Platform.OS !== "web" || !dirty) return;
    const guard = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);
}
