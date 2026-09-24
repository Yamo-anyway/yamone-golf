import { test } from "node:test";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import {
  runInterstitial,
  awaitAdTask,
  waitForAdForeground,
  type AdEvent,
  type AdLifecycle,
  type InterstitialDriver,
} from "../src/data/interstitial-core";
import { resolveAdMode } from "../src/data/ad-config";

function fixture() {
  const events = new Map<AdEvent, Set<() => void>>();
  const changes = new Set<(active: boolean) => void>();
  let active = true,
    shows = 0,
    destroyed = 0,
    loadThrows = false,
    showThrows = false,
    showRejects = false;
  const lifecycle: AdLifecycle = {
    active: () => active,
    subscribe: (listener) => {
      changes.add(listener);
      return () => {
        changes.delete(listener);
      };
    },
  };
  const ad: InterstitialDriver = {
    on: (event, listener) => {
      const set = events.get(event) ?? new Set();
      set.add(listener);
      events.set(event, set);
      return () => {
        set.delete(listener);
      };
    },
    load: () => {
      if (loadThrows) throw Error("load");
    },
    show: () => {
      shows++;
      if (showThrows) throw Error("show");
      return showRejects ? Promise.reject(Error("show")) : Promise.resolve();
    },
    destroy: () => {
      destroyed++;
    },
  };
  const abort = new AbortController();
  return {
    lifecycle,
    abort,
    run: (timeout = 50) =>
      runInterstitial(ad, lifecycle, abort.signal, timeout),
    emit: (event: AdEvent) => {
      for (const listener of events.get(event) ?? []) listener();
    },
    foreground: (value: boolean) => {
      active = value;
      for (const change of changes) change(value);
    },
    loadThrows: () => {
      loadThrows = true;
    },
    showThrows: () => {
      showThrows = true;
    },
    showRejects: () => {
      showRejects = true;
    },
    get shows() {
      return shows;
    },
    get destroyed() {
      return destroyed;
    },
    get listeners() {
      return (
        changes.size + [...events.values()].reduce((n, set) => n + set.size, 0)
      );
    },
  };
}
test("aborting delayed SDK initialization frees the caller and ignores late resolution", async () => {
  const controller = new AbortController();
  let ready!: (value: string) => void;
  const p = awaitAdTask(
    new Promise<string>((resolve) => {
      ready = resolve;
    }),
    controller.signal,
  );
  controller.abort();
  await assert.rejects(p, { code: "ad_interrupted" });
  ready("late-sdk");
  const live = new AbortController();
  assert.equal(
    await awaitAdTask(Promise.resolve("ready"), live.signal),
    "ready",
  );
});
test("native ad is completed only after opened and closed, not loaded/show resolved/impression time", async () => {
  const f = fixture();
  let result: string | undefined;
  const p = f.run(10).then((r) => {
    result = r;
    return r;
  });
  f.emit("loaded");
  f.emit("loaded");
  assert.equal(f.shows, 1);
  f.emit("opened");
  await delay(25);
  assert.equal(result, undefined, "load timer was removed before show");
  f.emit("closed");
  assert.equal(await p, "completed");
  assert.equal(f.destroyed, 1);
  assert.equal(f.listeners, 0);
});
test("SDK activity background / ad click does not settle or interrupt a showing ad", async () => {
  const f = fixture();
  const p = f.run();
  f.emit("loaded");
  f.foreground(false);
  f.emit("opened");
  f.foreground(true);
  f.emit("closed");
  assert.equal(await p, "completed");
});
test("background while loading is interrupted and late loaded cannot show", async () => {
  const f = fixture();
  const p = f.run();
  f.foreground(false);
  assert.equal(await p, "interrupted");
  f.foreground(true);
  f.emit("loaded");
  assert.equal(f.shows, 0);
  assert.equal(f.listeners, 0);
});
test("aborted/unfocused ad never turns into a settled outcome", async () => {
  for (const opened of [false, true]) {
    const f = fixture();
    const p = f.run();
    if (opened) {
      f.emit("loaded");
      f.emit("opened");
    }
    f.abort.abort();
    f.emit("closed");
    f.emit("error");
    assert.equal(await p, "interrupted");
    assert.equal(f.listeners, 0);
  }
});
test("background or aborted entry never starts an ad", async () => {
  const f = fixture();
  f.foreground(false);
  assert.equal(await f.run(), "interrupted");
  const g = fixture();
  g.abort.abort();
  assert.equal(await g.run(), "interrupted");
});
test("load deadline allows failure but drops every late callback", async () => {
  const f = fixture();
  assert.equal(await f.run(2), "load_timeout");
  f.emit("loaded");
  f.emit("opened");
  f.emit("closed");
  assert.equal(f.shows, 0);
  assert.equal(f.destroyed, 1);
});
test("SDK failures distinguish load and show, including rejected/throwing show", async () => {
  const f = fixture();
  const p = f.run();
  f.emit("error");
  assert.equal(await p, "load_failed");
  const g = fixture();
  const q = g.run();
  g.emit("loaded");
  g.emit("error");
  assert.equal(await q, "show_failed");
  for (const kind of ["showThrows", "showRejects"] as const) {
    const h = fixture();
    h[kind]();
    const p = h.run();
    h.emit("loaded");
    assert.equal(await p, "show_failed");
    assert.equal(h.listeners, 0);
  }
  const h = fixture();
  h.loadThrows();
  assert.equal(await h.run(), "load_failed");
});
test("closed before opened is a show failure, never invented completion", async () => {
  const f = fixture();
  const p = f.run();
  f.emit("closed");
  f.emit("loaded");
  f.emit("closed");
  assert.equal(await p, "show_failed");
});
test("foreground wait delays action but retains terminal ad outcome independently", async () => {
  const f = fixture();
  f.foreground(false);
  let finished = false;
  const p = waitForAdForeground(f.lifecycle, f.abort.signal).then(() => {
    finished = true;
  });
  await delay(2);
  assert.equal(finished, false);
  f.foreground(true);
  await p;
  assert.equal(finished, true);
  assert.equal(f.listeners, 0);
});
test("unmount during foreground wait cancels function without settling another ad", async () => {
  const f = fixture();
  f.foreground(false);
  const p = waitForAdForeground(f.lifecycle, f.abort.signal);
  f.abort.abort();
  await assert.rejects(p, { code: "ad_interrupted" });
  assert.equal(f.listeners, 0);
  await assert.rejects(waitForAdForeground(f.lifecycle, f.abort.signal), {
    code: "ad_interrupted",
  });
});
test("configuration cannot turn browser/native mock or unknown live modes into real SDK ads", () => {
  assert.equal(resolveAdMode("android"), "admob-test");
  assert.equal(resolveAdMode("ios", "admob-test"), "admob-test");
  assert.equal(resolveAdMode("web"), "mock");
  for (const platform of ["android", "ios", "web", "windows"])
    for (const mode of ["production", "admob", "disabled", "typo"])
      assert.equal(resolveAdMode(platform, mode), "disabled");
  assert.equal(resolveAdMode("android", "mock"), "disabled");
  assert.equal(resolveAdMode("web", "admob-test"), "disabled");
});
