import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { AppState } from "react-native";
import { useLocales } from "expo-localization";
import * as Crypto from "expo-crypto";
import { api, ApiError } from "../data/api";
import { durableSecret, readVault, writeVault } from "../data/vault";
import { recoveryKeyFromBytes, submitIdentity } from "../data/identity";
import type { Language, Profile, Vault } from "../data/model";
import ko from "./locales/ko";
import en from "./locales/en";

type Phase =
  "loading" | "welcome" | "ready" | "pending" | "moved" | "error" | "expired";
type Session = {
  phase: Phase;
  profile: Profile | null;
  vault: Vault;
  busy: boolean;
  error: string;
  startWithRecovery: boolean;
  lang: "ko" | "en";
  t: (key: keyof typeof ko) => string;
  refresh: () => Promise<void>;
  start: (name: string) => Promise<void>;
  recover: (key: string) => Promise<void>;
  resume: () => Promise<void>;
  fresh: (restore?: boolean) => Promise<void>;
  acknowledgeKey: () => Promise<void>;
  update: (value: {
    nickname?: string;
    language?: Language;
  }) => Promise<boolean>;
};
const Context = createContext<Session | null>(null);
const randomSecret = async () =>
  Array.from(await Crypto.getRandomBytesAsync(32), (n) =>
    n.toString(16).padStart(2, "0"),
  ).join("");
const randomKey = async () =>
  recoveryKeyFromBytes(await Crypto.getRandomBytesAsync(32));
export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [vault, setVault] = useState<Vault>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [startWithRecovery, setStartWithRecovery] = useState(false);
  const running = useRef(false);
  const locales = useLocales();
  const lang =
    profile?.language && profile.language !== "system"
      ? profile.language
      : locales[0]?.languageCode === "ko"
        ? "ko"
        : "en";
  const t = (key: keyof typeof ko) => (lang === "ko" ? ko : en)[key];
  const report = useCallback((e: unknown) => {
    const code = e instanceof ApiError ? e.code : "storage";
    setError(code);
    if (code === "device_moved") {
      setProfile(null);
      setPhase("moved");
    }
    return code;
  }, []);
  const refresh = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    try {
      const stored = await readVault();
      setVault(stored);
      if (stored.pending) {
        setPhase("pending");
        return;
      }
      try {
        const result = await api.me();
        setProfile(result.profile);
        setPhase("ready");
      } catch (e) {
        if (e instanceof ApiError && e.code === "unauthorized") {
          setProfile(null);
          setPhase(stored.secret ? "expired" : "welcome");
        } else {
          const code = report(e);
          if (code !== "device_moved")
            setPhase((current) => (current === "ready" ? "ready" : "error"));
        }
      }
    } catch (e) {
      report(e);
      setPhase((current) => (current === "ready" ? "ready" : "error"));
    } finally {
      running.current = false;
      setBusy(false);
    }
  }, [report]);
  useEffect(() => {
    // Bootstrap is external asynchronous I/O, scheduled after the initial render.
    let active = true;
    void Promise.resolve().then(() => {
      if (active) void refresh();
    });
    return () => {
      active = false;
    };
  }, [refresh]);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active" && profile && !running.current) void refresh();
    });
    return () => subscription.remove();
  }, [profile, refresh]);
  async function identity(kind: "register" | "recover", input: string) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await submitIdentity(
        { read: readVault, write: writeVault, durableSecret },
        async () => {
          const device_secret = await randomSecret();
          return kind === "register"
            ? {
                kind,
                device_secret,
                nickname: input,
                language: "system",
                recovery_key: await randomKey(),
              }
            : {
                kind,
                device_secret,
                recovery_key: input,
                next_recovery_key: await randomKey(),
              };
        },
        api.identity,
      );
      setVault(await readVault());
      setProfile(result.profile);
      setPhase("ready");
    } catch (e) {
      const code = report(e);
      try {
        const stored = await readVault();
        // These responses guarantee no identity mutation occurred; permit correcting the input.
        if (
          ["invalid_recovery", "invalid_nickname", "invalid_language"].includes(
            code,
          )
        ) {
          const { pending: _pending, ...rest } = stored;
          await writeVault(rest);
          setVault(rest);
          setPhase("welcome");
        } else {
          setVault(stored);
          if (code !== "device_moved" && stored.pending) setPhase("pending");
        }
      } catch {
        setError("storage");
      }
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  async function update(value: { nickname?: string; language?: Language }) {
    if (running.current) return false;
    running.current = true;
    setBusy(true);
    setError("");
    try {
      setProfile((await api.update(value)).profile);
      return true;
    } catch (e) {
      report(e);
      return false;
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  async function fresh(restore = false) {
    try {
      await writeVault({});
      setVault({});
      setProfile(null);
      setError("");
      setStartWithRecovery(restore);
      setPhase("welcome");
    } catch (e) {
      report(e);
    }
  }
  async function acknowledgeKey() {
    try {
      const stored = await readVault();
      const { keyToSave: _key, ...rest } = stored;
      await writeVault(rest);
      setVault(rest);
    } catch (e) {
      report(e);
    }
  }
  return (
    <Context.Provider
      value={{
        phase,
        profile,
        vault,
        busy,
        error,
        startWithRecovery,
        lang,
        t,
        refresh,
        update,
        fresh,
        acknowledgeKey,
        start: (name) => identity("register", name),
        recover: (key) => identity("recover", key),
        resume: () => identity("register", ""),
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useSession() {
  const value = useContext(Context);
  if (!value) throw new Error("Missing session");
  return value;
}
export function useErrorText() {
  const { error, t } = useSession();
  return error
    ? t(error in ko ? (error as keyof typeof ko) : "server_error")
    : "";
}
