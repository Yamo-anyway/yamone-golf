import type { AdOutcome } from "./ad-policy";

export type AdEvent = "loaded" | "opened" | "closed" | "error";
export type InterstitialDriver = {
  on: (event: AdEvent, listener: () => void) => () => void;
  load: () => void;
  show: () => Promise<unknown>;
  destroy: () => void;
};
export type AdLifecycle = {
  active: () => boolean;
  subscribe: (listener: (active: boolean) => void) => () => void;
};

// SDK/UMP initialization can outlive a screen. Cancellation must release the
// caller without inventing a failure settlement or showing a late ad.
export function awaitAdTask<T>(
  task: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject({ code: "ad_interrupted" });
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
    task.then(
      (value) => {
        signal.removeEventListener("abort", abort);
        if (signal.aborted) abort();
        else resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", abort);
        reject(error);
      },
    );
  });
}

// Only terminal SDK events produce a settlement. An OS kill has no terminal
// event and thus leaves the durable action WITHOUT an outcome for next launch.
export function runInterstitial(
  ad: InterstitialDriver,
  lifecycle: AdLifecycle,
  signal: AbortSignal,
  loadTimeout = 15_000,
): Promise<AdOutcome> {
  return new Promise((resolve) => {
    let phase: "loading" | "showing" | "opened" | "done" = "loading";
    const unsubscribers: (() => void)[] = [];
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (outcome: AdOutcome) => {
      if (phase === "done") return;
      phase = "done";
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      for (const off of unsubscribers) off();
      try {
        ad.destroy();
      } catch {
        /* Cleanup cannot replace the outcome. */
      }
      resolve(outcome);
    };
    const abort = () => finish("interrupted");
    if (signal.aborted || !lifecycle.active()) {
      abort();
      return;
    }
    signal.addEventListener("abort", abort, { once: true });
    try {
      unsubscribers.push(
        lifecycle.subscribe((active) => {
          // Presenting a native ad can itself background the React activity.
          // Do not infer completion (or interruption) from that transition.
          if (!active && phase === "loading") abort();
        }),
      );
      unsubscribers.push(
        ad.on("loaded", () => {
          if (phase !== "loading") return;
          if (!lifecycle.active()) {
            abort();
            return;
          }
          clearTimeout(timer); // NEVER time out an ad after show() has started.
          phase = "showing";
          try {
            void ad.show().catch(() => finish("show_failed"));
          } catch {
            finish("show_failed");
          }
        }),
      );
      unsubscribers.push(
        ad.on("opened", () => {
          if (phase === "showing") phase = "opened";
        }),
      );
      unsubscribers.push(
        ad.on("closed", () => {
          if (phase === "opened") finish("completed");
          else if (phase === "showing") finish("show_failed");
        }),
      );
      unsubscribers.push(
        ad.on("error", () => {
          finish(phase === "loading" ? "load_failed" : "show_failed");
        }),
      );
      timer = setTimeout(() => finish("load_timeout"), loadTimeout);
      ad.load();
    } catch {
      finish("load_failed");
    }
  });
}

export function waitForAdForeground(
  lifecycle: AdLifecycle,
  signal: AbortSignal,
) {
  if (signal.aborted) return Promise.reject({ code: "ad_interrupted" });
  if (lifecycle.active()) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const abort = () => {
      off();
      reject({ code: "ad_interrupted" });
    };
    const off = lifecycle.subscribe((active) => {
      if (active) {
        off();
        signal.removeEventListener("abort", abort);
        resolve();
      }
    });
    signal.addEventListener("abort", abort, { once: true });
  });
}
