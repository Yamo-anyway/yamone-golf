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
      path: "qa/stage-6/" + name + ".png",
    });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
  }
  await mkdir("qa/stage-6", { recursive: true });
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
    const endURL = base + "/round-ending?id=" + round.round_id;
    await b.page.goto(endURL);
    await b.page.getByTestId("end-confirm").waitFor();
    assert.equal(await b.page.getByTestId("end-confirm").isDisabled(), true);
    await a.page.goto(endURL);
    await a.page.getByTestId("end-permission-" + b.profile.user_id).click();
    await a.page
      .getByTestId("end-permission-" + b.profile.user_id)
      .filter({ hasText: "회수" })
      .waitFor();
    await snapshot(a.page, "01-ending-permissions");
    await b.page.getByTestId("refresh-ending").click();
    await b.page.waitForFunction(
      () =>
        document
          .querySelector('[data-testid="end-confirm"]')
          ?.getAttribute("aria-disabled") !== "true",
    );
    await a.page.goto(scoreURL);
    await a.page.getByTestId("current-hole").waitFor();
    await a.page.getByTestId("plus-" + self.slot_id).click();
    await a.page.getByTestId("hole-2").click();
    await a.page.getByTestId("keep-draft-and-move").click();
    await a.page
      .getByTestId("current-hole")
      .filter({ hasText: "홀 2" })
      .waitFor();
    await a.page.getByTestId("plus-" + second.slot_id).click();
    await a.page.getByTestId("scores-end-round").click();
    await a.page.getByTestId("keep-draft-and-move").click();
    await a.page.getByTestId("end-draft-1").waitFor();
    await a.page.getByTestId("end-draft-2").waitFor();
    assert.equal(await a.page.getByTestId("end-confirm").isDisabled(), true);
    await snapshot(a.page, "02-all-hole-drafts-protected");
    await a.page.getByTestId("end-save-all").click();
    await a.page.waitForFunction(
      () =>
        document
          .querySelector('[data-testid="end-confirm"]')
          ?.getAttribute("aria-disabled") !== "true",
    );
    await a.page
      .getByTestId("completion-" + self.slot_id)
      .filter({ hasText: "2/18" })
      .waitFor();
    // Another participant changes a saved score after the review was rendered.
    await write(b.page, [7, 4, 4], 1);
    await a.page.getByTestId("end-confirm").click();
    await a.page
      .getByText("확인 중에 라운드 기록이 변경되었습니다.", { exact: false })
      .waitFor();
    assert.equal((await call(a.page, root + "/ending")).status, "active");
    await snapshot(a.page, "03-latest-confirmation-required");
    // Lost response after successful ending: close and reopen a new page, then retry.
    let sent = 0;
    await a.page.route("**/ending", async (route) => {
      if (route.request().method() === "POST") {
        sent++;
        await route.fetch();
        await route.abort("connectionfailed");
      } else await route.continue();
    });
    await a.page.getByTestId("end-confirm").click();
    await a.page.getByTestId("retry-end").waitFor();
    assert.equal(sent, 1);
    const context = a.page.context();
    await a.page.close();
    a.page = await context.newPage();
    a.page.on("pageerror", (e) => errors.push(e.message));
    a.page.on("dialog", (d) => void d.accept());
    await a.page.goto(endURL);
    await a.page.getByTestId("retry-end").click();
    await a.page
      .getByTestId("end-reason")
      .filter({ hasText: "종료되었습니다" })
      .waitFor();
    await a.page.getByTestId("retry-end").waitFor({ state: "detached" });
    await snapshot(a.page, "04-ending-recovered");
    assert.equal((await call(a.page, "/api/home")).active_round, null);
    assert.equal((await call(b.page, "/api/home")).active_round, null);
    await a.page.getByTestId("end-home").click();
    await a.page.getByTestId("ended-round-" + round.round_id).click();
    await a.page.getByTestId("end-reason").waitFor();
    assert.equal(await a.page.getByTestId("enter-scores").count(), 0);
    await a.page.getByTestId("round-scorecard").click();
    await a.page.getByTestId("refresh-scorecard").waitFor();
    // Other participant's later local draft is retained when the server has ended.
    await b.page.goto(scoreURL);
    await b.page.getByTestId("current-hole").waitFor();
    // The saved active cache renders first; wait for the server's ended state.
    await b.page
      .getByTestId("scores-end-round")
      .filter({ hasText: "종료된 라운드" })
      .waitFor();
    assert.equal(await b.page.getByTestId("save-hole").count(), 0);
    // Small English completion view.
    await call(b.page, "/api/me", { language: "en" }, "PATCH");
    await b.page.setViewportSize({ width: 320, height: 844 });
    await b.page.goto(endURL);
    await b.page
      .getByTestId("end-reason")
      .filter({ hasText: "ended" })
      .waitFor();
    await snapshot(b.page, "05-english-320-ended");
    assert.deepEqual(errors, []);
    console.log(
      "Stage 6 UI passed: delegation, multi-hole ending gate, latest confirmation, response-loss restart, ended summary, new-round availability and English 320px.",
    );
  } finally {
    await browser.close();
  }
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
