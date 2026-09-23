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
  async function call(
    page: Page,
    path: string,
    value?: unknown,
    method?: string,
  ) {
    return page.evaluate(
      async ({ path, value, method }) => {
        const r = await fetch(path, {
          method: method ?? (value === undefined ? "GET" : "POST"),
          headers:
            value === undefined
              ? undefined
              : { "Content-Type": "application/json" },
          body: value === undefined ? undefined : JSON.stringify(value),
        });
        const data = await r.json();
        if (!r.ok) throw new Error(JSON.stringify(data));
        return data;
      },
      { path, value, method },
    );
  }
  async function start(name: string, locale = "ko-KR", width = 390) {
    const c = await browser.newContext({
      viewport: { width, height: 844 },
      locale,
    });
    const page = await c.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("dialog", (d) => void d.accept());
    await page.goto(base);
    await page.getByTestId("nickname").fill(name);
    await page.getByTestId("start").click();
    await page.getByTestId("backup-done").click();
    const profile = (await call(page, "/api/me")).profile;
    return { page, profile };
  }
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
    await page.evaluate(() =>
      document.querySelectorAll("*").forEach((e) => {
        if (e.scrollTop) e.scrollTop = 0;
      }),
    );
    await page.screenshot({
      animations: "disabled",
      path: "qa/stage-5/" + name + ".png",
    });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
  }
  await mkdir("qa/stage-5", { recursive: true });
  try {
    const a = await start("야모"),
      b = await start("동반자"),
      c = await start("관람자");
    const course = (
      await call(a.page, "/api/courses", {
        course_id: randomUUID(),
        name: "플레이어 테스트 골프장",
        region: "경기",
        segments: [{ name: "OUT", pars: Array(9).fill(4) }],
      })
    ).course;
    const prepared = await call(a.page, "/api/round-actions", {
      action_id: randomUUID(),
      kind: "create",
      course_id: course.course_id,
      course_version: course.version,
      segment_indices: [0, 0],
      players: [
        { name: "야모", self: true },
        { name: "임시 선수", self: false },
        { name: "또 다른 선수", self: false },
      ],
    });
    await call(a.page, "/api/round-actions/" + prepared.action_id + "/ad", {
      outcome: "unavailable",
    });
    const round = (
      await call(
        a.page,
        "/api/round-actions/" + prepared.action_id + "/execute",
        {},
      )
    ).round;
    const root = "/api/rounds/" + round.round_id;
    const join = await call(b.page, "/api/round-actions", {
      action_id: randomUUID(),
      kind: "join",
      code: round.join_code,
    });
    await call(b.page, "/api/round-actions/" + join.action_id + "/ad", {
      outcome: "unavailable",
    });
    await call(b.page, "/api/round-actions/" + join.action_id + "/execute", {});
    const roster = (await call(a.page, root + "/players")).players,
      [self, second, third] = roster;
    const scoreURL = base + "/scores?id=" + round.round_id;
    const write = async (page: Page, values: number[], hole = 1) => {
      const sheet = await call(page, root + "/scores");
      return call(
        page,
        root + "/scores",
        {
          mutation_id: randomUUID(),
          hole,
          roster_version: sheet.roster_version,
          target_version: sheet.target_version,
          entries: sheet.slot_ids.map((id: string, i: number) => ({
            slot_id: id,
            strokes: values[i],
            version:
              sheet.scores.find((s: any) => s.slot_id === id && s.hole === hole)
                ?.version ?? 0,
          })),
        },
        "PUT",
      );
    };
    await a.page.goto(scoreURL);
    await a.page.getByTestId("current-hole").waitFor();
    await a.page.getByTestId("plus-" + self.slot_id).click();
    await a.page
      .getByTestId("score-value-" + self.slot_id)
      .filter({ hasText: "5" })
      .waitFor();
    await a.page.getByTestId("hole-2").click();
    await a.page.getByTestId("keep-draft-and-move").click();
    await a.page
      .getByTestId("current-hole")
      .filter({ hasText: "홀 2" })
      .waitFor();
    await a.page.getByTestId("plus-" + second.slot_id).click();
    await a.page
      .getByTestId("draft-holes")
      .filter({ hasText: "1, 2" })
      .waitFor();
    await snapshot(a.page, "01-multiple-hole-drafts");
    // API outage, while the installed app code remains available.
    let disconnected = true;
    await a.page
      .context()
      .route("**/api/**", (route) =>
        disconnected ? route.abort("internetdisconnected") : route.continue(),
      );
    await a.page.reload();
    await a.page.getByTestId("offline-session").waitFor();
    await a.page
      .getByTestId("current-hole")
      .filter({ hasText: "홀 2" })
      .waitFor();
    assert.equal(
      await a.page.getByTestId("score-value-" + second.slot_id).textContent(),
      "5",
    );
    await a.page.getByTestId("save-hole").click();
    await a.page
      .getByTestId("score-state-" + second.slot_id)
      .filter({ hasText: "전송 대기" })
      .waitFor();
    await a.page.getByTestId("hole-3").click();
    await a.page.getByTestId("plus-" + third.slot_id).click();
    await a.page
      .getByTestId("score-value-" + third.slot_id)
      .filter({ hasText: "5" })
      .waitFor();
    await a.page.getByTestId("save-hole").click();
    await a.page
      .getByTestId("queued-holes")
      .filter({ hasText: "2, 3" })
      .waitFor();
    await a.page.getByRole("tab", { name: "홈", exact: true }).click();
    await a.page.reload();
    await a.page.getByTestId("resume-local-" + round.round_id).click();
    await a.page
      .getByTestId("queued-holes")
      .filter({ hasText: "2, 3" })
      .waitFor();
    await snapshot(a.page, "02-offline-restart-queue");
    // Other user changes one queued hole while A is offline.
    await write(b.page, [4, 7, 4], 2);
    disconnected = false;
    await a.page.evaluate(() => window.dispatchEvent(new Event("online")));
    await a.page.waitForFunction(
      () =>
        JSON.parse(
          localStorage.getItem(
            Object.keys(localStorage).find((k) =>
              k.startsWith("ymg:score-offline:"),
            )!,
          )!,
        ).rounds[
          Object.keys(
            JSON.parse(
              localStorage.getItem(
                Object.keys(localStorage).find((k) =>
                  k.startsWith("ymg:score-offline:"),
                )!,
              )!,
            ).rounds,
          )[0]
        ].queue["2"]?.state === "conflict",
    );
    await a.page.getByTestId("hole-2").click();
    await a.page.getByTestId("confirm-score-conflict").waitFor();
    await snapshot(a.page, "03-restored-conflict");
    const server = await call(b.page, root + "/scores");
    assert.equal(
      server.scores.find(
        (s: any) => s.slot_id === third.slot_id && s.hole === 3,
      ).strokes,
      5,
    );
    assert.ok(!server.scores.some((s: any) => s.hole === 1)); // drafts never auto-send
    await a.page.getByTestId("defer-score-conflict").click();
    await a.page.getByTestId("hole-4").click();
    await a.page.getByTestId("plus-" + self.slot_id).click();
    await a.page
      .getByTestId("score-value-" + self.slot_id)
      .filter({ hasText: "5" })
      .waitFor();
    await a.page.reload(); // durable draft survives without a navigation prompt
    await a.page
      .getByTestId("draft-holes")
      .filter({ hasText: "1, 4" })
      .waitFor();
    await a.page.getByTestId("hole-2").click();
    await a.page.getByTestId("keep-draft-and-move").click();
    await a.page.getByTestId("confirm-score-conflict").click();
    await a.page
      .getByTestId("score-notice")
      .filter({ hasText: "서버에 저장" })
      .waitFor();
    assert.equal(
      (await call(b.page, root + "/scores")).scores.find(
        (s: any) => s.slot_id === second.slot_id && s.hole === 2,
      ).strokes,
      5,
    );
    // Lose a successful response, close the tab, replay from a fresh app instance.
    let lost = false;
    await a.page.context().route("**/api/rounds/*/scores", async (route) => {
      if (route.request().method() !== "PUT" || lost) {
        await route.fallback();
        return;
      }
      lost = true;
      await route.fetch();
      disconnected = true;
      await route.abort("connectionreset");
    });
    await a.page.getByTestId("hole-5").click();
    await a.page.getByTestId("save-hole").click();
    await a.page.getByTestId("queued-holes").filter({ hasText: "5" }).waitFor();
    await a.page.close();
    a.page = await a.page.context().newPage();
    a.page.on("pageerror", (e) => errors.push(e.message));
    a.page.on("dialog", (d) => void d.accept());
    await a.page.goto(base);
    await a.page.getByTestId("resume-local-" + round.round_id).click();
    await a.page.getByTestId("queued-holes").filter({ hasText: "5" }).waitFor();
    await write(b.page, [9, 4, 4], 5);
    disconnected = false;
    await a.page.evaluate(() => window.dispatchEvent(new Event("online")));
    await a.page
      .getByTestId("score-value-" + self.slot_id)
      .filter({ hasText: "9" })
      .waitFor();
    assert.equal(
      (await call(b.page, root + "/scores")).scores.find(
        (s: any) => s.slot_id === self.slot_id && s.hole === 5,
      ).version,
      2,
    );
    // Storage failure must not publish the rejected edit or a false saved message.
    await a.page.evaluate(() => {
      const original = Storage.prototype.setItem;
      (window as any).originalSetItem = original;
      Storage.prototype.setItem = function (k, v) {
        if (k.startsWith("ymg:score-offline:"))
          throw new Error("QuotaExceededError");
        original.call(this, k, v);
      };
    });
    await a.page.getByTestId("plus-" + self.slot_id).click();
    await a.page
      .getByText(
        "기기에 저장하지 못했습니다. 변경을 적용하지 않았거나 전송 확인이 남아 있습니다. 공간을 확인한 뒤 다시 시도하세요.",
        { exact: true },
      )
      .first()
      .waitFor();
    assert.equal(
      await a.page.getByTestId("score-value-" + self.slot_id).textContent(),
      "9",
    );
    await snapshot(a.page, "04-storage-failure");
    await a.page.evaluate(() => {
      Storage.prototype.setItem = (window as any).originalSetItem;
    });
    // Same-device tabs use a local write lock; concurrent edits on different holes are retained.
    const tab = await a.page.context().newPage();
    tab.on("pageerror", (e) => errors.push(e.message));
    await tab.goto(scoreURL);
    await tab.getByTestId("current-hole").waitFor();
    await Promise.all([
      a.page.getByTestId("plus-" + self.slot_id).click(),
      tab.getByTestId("plus-" + second.slot_id).click(),
    ]);
    await a.page
      .getByTestId("score-value-" + self.slot_id)
      .filter({ hasText: "10" })
      .waitFor();
    await a.page
      .getByTestId("score-value-" + second.slot_id)
      .filter({ hasText: "5" })
      .waitFor();
    await tab.close();
    await call(a.page, "/api/me", { language: "en" }, "PATCH");
    await a.page.setViewportSize({ width: 320, height: 844 });
    await a.page.reload();
    await a.page.getByTestId("draft-holes").waitFor();
    await snapshot(a.page, "05-english-offline-drafts-320");
    assert.deepEqual(errors, []);
    console.log(
      "UI PASS: durable multi-hole drafts, offline cold restart/home entry, queued saves, reconnect with held conflict/other-hole sync, deferred conflict, tab-close lost-response replay, local-storage failure, concurrent tabs and 320px English.",
    );
  } finally {
    await browser.close();
  }
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
