import { chromium, type Page } from "playwright";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";

async function main() {
  const base = process.env.PREVIEW_URL ?? "http://localhost:4173";
  const browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const errors: string[] = [];
  async function snapshot(page: Page, name: string) {
    if (process.env.QA_KOREAN_FONT) {
      const font = (await readFile(process.env.QA_KOREAN_FONT)).toString(
        "base64",
      );
      await page.addStyleTag({
        content: `@font-face{font-family:QAKorean;src:url(data:font/woff2;base64,${font}) format('woff2')}body,body *{font-family:QAKorean,sans-serif!important}`,
      });
      await page.evaluate(() => document.fonts.ready);
    }
    await page.screenshot({
      path: "qa/stage-10/" + name + ".png",
      animations: "disabled",
    });
  }
  async function call(page: Page, path: string, value?: unknown) {
    return page.evaluate(
      async ({ path, value }) => {
        const r = await fetch(path, {
          method: value === undefined ? "GET" : "POST",
          headers:
            value === undefined
              ? undefined
              : { "Content-Type": "application/json" },
          body: value === undefined ? undefined : JSON.stringify(value),
        });
        const data = await r.json();
        if (!r.ok) throw Error(JSON.stringify(data));
        return data;
      },
      { path, value },
    );
  }
  async function banner(page: Page, shown: boolean) {
    await page
      .getByTestId("ad-banner")
      .waitFor({ state: shown ? "visible" : "hidden" });
    if (!shown) {
      assert.equal(await page.getByTestId("ad-banner").count(), 0);
      return;
    }
    const box = (await page.getByTestId("ad-banner").boundingBox())!;
    const navigation = page.getByTestId("bottom-navigation");
    const nav = (await navigation.isVisible())
      ? await navigation.boundingBox()
      : null;
    const scroll = (await page.getByTestId("screen-scroll").boundingBox())!;
    assert.equal(box.height, 50);
    assert.ok(
      scroll.y + scroll.height <= box.y + 1,
      "banner does not cover scroll content",
    );
    if (nav)
      assert.ok(
        box.y + box.height <= nav.y + 1,
        "banner stays above navigation",
      );
    else
      assert.ok(
        Math.abs(box.y + box.height - page.viewportSize()!.height) < 2,
        "task-screen banner stays at the viewport bottom without navigation",
      );
    await page.getByTestId("screen-scroll").evaluate((el) => {
      el.scrollTop = 10000;
    });
    assert.equal(
      (await page.getByTestId("ad-banner").boundingBox())!.y,
      box.y,
      "banner stays fixed while content scrolls",
    );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
  }
  try {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      locale: "ko-KR",
    });
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("dialog", (d) => void d.accept());
    await page.goto(base);
    await banner(page, false);
    await page.getByTestId("nickname").fill("광고검증");
    await page.getByTestId("start").click();
    await page.getByTestId("backup-done").click();
    await banner(page, true);
    await mkdir("qa/stage-10", { recursive: true });
    await snapshot(page, "home-banner");
    const profile = (await call(page, "/api/me")).profile;
    const course = (
      await call(page, "/api/courses", {
        course_id: randomUUID(),
        name: "배너 검증 코스",
        region: "테스트",
        segments: [{ name: "OUT", pars: Array(9).fill(4) }],
      })
    ).course;
    const pending = {
      action_id: randomUUID(),
      input: {
        kind: "create",
        course_id: course.course_id,
        course_version: course.version,
        segment_indices: [0, 0],
        players: [{ name: profile.nickname, self: true }],
      },
    };
    await page.evaluate(
      ({ user, pending }) =>
        localStorage.setItem(
          "yamone.golf.pending-round.v1." + user,
          JSON.stringify(pending),
        ),
      { user: profile.user_id, pending },
    );
    await page.goto(base + "/round-action");
    await page.getByTestId("ad-complete").waitFor();
    await banner(page, false);
    let executions = 0,
      settlements = 0;
    let firstLost!: () => void;
    const lostResponse = new Promise<void>((resolve) => {
      firstLost = resolve;
    });
    page.on("request", (r) => {
      if (r.method() === "POST" && /\/round-actions\/[^/]+\/ad$/.test(r.url()))
        settlements++;
    });
    await page.route("**/api/round-actions/*/execute", async (route) => {
      const response = await route.fetch();
      executions++;
      if (executions === 1) {
        await route.abort();
        firstLost();
      } else await route.fulfill({ response });
    });
    await page.getByTestId("ad-complete").click();
    // Wait for the FUNCTION commit/response loss, not merely the earlier local
    // ad checkpoint. Otherwise reload can cancel the first request before it ran.
    await lostResponse;
    await page.getByTestId("execute-round").waitFor();
    await page.waitForFunction(() =>
      Object.keys(localStorage).some(
        (k) =>
          k.startsWith("yamone.golf.pending-round.") &&
          JSON.parse(localStorage.getItem(k)!).outcome === "completed",
      ),
    );
    await page.reload();
    await page.getByTestId("execute-round").click();
    await page.waitForURL("**/round?id=*");
    assert.equal(
      settlements,
      1,
      "lost function response must not replay an ad",
    );
    assert.equal(executions, 2);
    await page.unroute("**/api/round-actions/*/execute");
    const round = (await call(page, "/api/home")).active_round;
    for (const route of [
      "round",
      "scorecard",
      "scores",
      "players",
      "input-targets",
      "round-ending",
      "round-records",
    ]) {
      await page.goto(base + "/" + route + "?id=" + round.round_id);
      await page
        .getByRole("button", { name: "돌아가기", exact: true })
        .first()
        .waitFor();
      assert.equal(await page.getByTestId("bottom-navigation").count(), 0);
      await banner(page, false);
    }
    for (const route of [
      "courses",
      "round-new",
      "round-join",
      "receive-record",
      "profile",
    ]) {
      await page.goto(base + "/" + route);
      if (route === "courses" || route === "profile")
        await page.getByTestId("bottom-navigation").waitFor();
      else {
        await page
          .getByRole("button", { name: "돌아가기", exact: true })
          .first()
          .waitFor();
        assert.equal(await page.getByTestId("bottom-navigation").count(), 0);
      }
      await banner(page, false);
    }
    await page.goto(base);
    await banner(page, true); // Active round does not suppress HOME ads.
    const root = "/api/rounds/" + round.round_id;
    const ending = await call(page, root + "/ending");
    await call(page, root + "/ending", {
      user_id: profile.user_id,
      mutation_id: randomUUID(),
      record_version: ending.record_version,
    });
    const slot = (await call(page, root + "/players")).players[0];
    const delivery = (
      await call(page, root + "/deliveries", {
        user_id: profile.user_id,
        mutation_id: randomUUID(),
        slot_id: slot.slot_id,
        version: slot.version,
        recipient_id: profile.user_id,
      })
    ).delivery;
    const receive = {
      user_id: profile.user_id,
      action_id: randomUUID(),
      delivery_id: delivery.delivery_id,
    };
    assert.equal(
      (await call(page, "/api/receipt-actions", receive)).ad_settled,
      true,
    );
    const receipt = (
      await call(
        page,
        "/api/receipt-actions/" + receive.action_id + "/execute",
        { user_id: profile.user_id },
      )
    ).receipt;
    for (const route of [
      "/records",
      "/statistics",
      "/record?id=" + receipt.receipt_id,
      "/peoria?id=" + round.round_id + "&origin=record",
    ]) {
      await page.goto(base + route);
      await banner(page, true);
    }
    for (const route of [
      "/round?id=" + round.round_id,
      "/scorecard?id=" + round.round_id,
      "/peoria?id=" + round.round_id + "&origin=round",
      "/record-edit?id=" + receipt.receipt_id,
    ]) {
      await page.goto(base + route);
      await page
        .getByRole("button", { name: "돌아가기", exact: true })
        .first()
        .waitFor();
      assert.equal(await page.getByTestId("bottom-navigation").count(), 0);
      await banner(page, false);
    }
    await page.goto(base + "/record?id=" + receipt.receipt_id);
    await banner(page, true);
    await snapshot(page, "ended-record-banner");
    await page.evaluate(() => localStorage.setItem("ymg:qa-banner-fail", "1"));
    await page.reload();
    await page.getByTestId("edit-own-scores").waitFor();
    await banner(page, false);
    assert.equal(await page.getByTestId("bottom-navigation").count(), 0);
    const scroll = (await page.getByTestId("screen-scroll").boundingBox())!;
    assert.ok(
      Math.abs(scroll.y + scroll.height - page.viewportSize()!.height) < 2,
      "failed banner leaves no blank area",
    );
    await snapshot(page, "banner-failure-no-gap");
    await page.evaluate(() => localStorage.removeItem("ymg:qa-banner-fail"));
    await page.setViewportSize({ width: 320, height: 720 });
    await page.evaluate(async () =>
      fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language: "en" }),
      }),
    );
    await page.goto(base + "/statistics");
    await banner(page, true);
    await snapshot(page, "english-320-banner");
    await page.route("**/api/ad-config", (route) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ test_ads: false, production_ads: false }),
      }),
    );
    await page.reload();
    await page.getByTestId("bottom-navigation").waitFor();
    await banner(page, false);
    assert.deepEqual(errors, []);
    console.log(
      "PASS ads UI: route exclusions, ended-record origin, fixed footer, failure collapse, KO/EN 320px, lost-response replay, production fixture gate",
    );
  } finally {
    await browser.close();
  }
}
void main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
