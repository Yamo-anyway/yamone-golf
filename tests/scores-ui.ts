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
      path: "qa/stage-4/" + name + ".png",
    });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
  }
  await mkdir("qa/stage-4", { recursive: true });
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
    assert.equal(
      await a.page.getByTestId("current-hole").textContent(),
      "홀 1 · PAR 4",
    );
    assert.equal(
      await a.page.getByTestId("score-state-" + self.slot_id).textContent(),
      "미입력 · PAR 기본값",
    );
    await snapshot(a.page, "01-hole-one-defaults");
    await a.page.getByTestId("plus-" + self.slot_id).click();
    await a.page.getByTestId("hole-2").click();
    await a.page.getByTestId("keep-score-editing").click();
    assert.equal(
      await a.page.getByTestId("score-value-" + self.slot_id).textContent(),
      "5",
    );
    await a.page.getByTestId("refresh-scores").click();
    assert.equal(
      await a.page.getByTestId("score-value-" + self.slot_id).textContent(),
      "5",
    );
    await a.page.getByTestId("hole-2").click();
    await snapshot(a.page, "02-unsaved-choices");
    await a.page.getByTestId("save-and-move").click();
    await a.page
      .getByTestId("current-hole")
      .filter({ hasText: "홀 2" })
      .waitFor();
    assert.equal(
      (await call(a.page, root + "/scores")).scores.find(
        (s: any) => s.slot_id === self.slot_id && s.hole === 1,
      ).strokes,
      5,
    );
    await a.page.getByTestId("plus-" + self.slot_id).click();
    await a.page.getByTestId("hole-3").click();
    await a.page.getByTestId("discard-and-move").click();
    await a.page
      .getByTestId("current-hole")
      .filter({ hasText: "홀 3" })
      .waitFor();
    assert.ok(
      !(await call(a.page, root + "/scores")).scores.some(
        (s: any) => s.hole === 2,
      ),
    );
    await a.page.reload();
    await a.page
      .getByTestId("current-hole")
      .filter({ hasText: "홀 3" })
      .waitFor();
    await a.page.getByTestId("hole-1").click();
    await a.page.getByTestId("plus-" + self.slot_id).click(); // draft6
    await a.page.getByTestId("plus-" + second.slot_id).click(); // independent draft5
    await write(b.page, [7, 4, 4]);
    await a.page.getByTestId("refresh-scores").click();
    assert.equal(
      await a.page.getByTestId("score-value-" + self.slot_id).textContent(),
      "6",
    );
    await a.page.getByTestId("save-hole").click();
    await a.page.getByTestId("reject-score-conflict").click();
    assert.equal(
      await a.page.getByTestId("score-value-" + self.slot_id).textContent(),
      "7",
    );
    assert.equal(
      await a.page.getByTestId("score-value-" + second.slot_id).textContent(),
      "5",
    );
    assert.equal(
      await a.page.getByTestId("score-state-" + second.slot_id).textContent(),
      "저장 전",
    );
    await a.page.getByTestId("plus-" + self.slot_id).click(); //8
    await write(b.page, [9, 4, 4]);
    await a.page.getByTestId("save-hole").click();
    await a.page.getByTestId("confirm-score-conflict").waitFor();
    await snapshot(a.page, "03-concurrent-score-confirmation");
    await write(b.page, [10, 4, 4]);
    await a.page.getByTestId("confirm-score-conflict").click();
    await a.page.getByText("야모: 10 → 8", { exact: true }).waitFor();
    await a.page.getByTestId("confirm-score-conflict").click();
    await a.page
      .getByTestId("score-notice")
      .filter({ hasText: "서버에 저장" })
      .waitFor();
    assert.equal(
      (await call(a.page, root + "/scores")).scores.find(
        (s: any) => s.slot_id === self.slot_id && s.hole === 1,
      ).strokes,
      8,
    );
    // A lost successful save stays on the hole and retries without a second overwrite.
    let lost = false;
    await a.page.route("**/api/rounds/*/scores", async (route) => {
      if (route.request().method() !== "PUT" || lost) {
        await route.continue();
        return;
      }
      lost = true;
      await route.fetch();
      await route.abort("connectionreset");
    });
    await a.page.getByTestId("plus-" + third.slot_id).click();
    await a.page.getByTestId("hole-2").click();
    await a.page.getByTestId("save-and-move").click();
    await a.page
      .getByText(
        "서버에 연결하지 못했습니다. 입력한 내용은 그대로 두고 다시 시도하세요.",
        { exact: true },
      )
      .waitFor();
    assert.equal(
      await a.page.getByTestId("current-hole").textContent(),
      "홀 1 · PAR 4",
    );
    await a.page.getByTestId("save-hole").click();
    await a.page
      .getByTestId("score-notice")
      .filter({ hasText: "서버에 저장" })
      .waitFor();
    assert.equal(
      (await call(a.page, root + "/scores")).scores.find(
        (s: any) => s.slot_id === third.slot_id && s.hole === 1,
      ).version,
      2,
    );
    await a.page.getByTestId("delete-hole").click();
    await a.page.getByTestId("confirm-delete-hole").click();
    await a.page
      .getByTestId("score-state-" + self.slot_id)
      .filter({ hasText: "미입력" })
      .waitFor();
    assert.ok(
      (await call(a.page, root + "/scores")).scores.every(
        (s: any) => s.strokes === null,
      ),
    );
    // Route push and shell navigation must both protect drafts.
    await a.page.getByTestId("plus-" + self.slot_id).click();
    await a.page.getByTestId("open-scorecard").click();
    await a.page.getByTestId("keep-score-editing").click();
    await a.page.getByRole("tab", { name: "홈", exact: true }).click();
    await a.page.getByTestId("discard-and-move").click();
    await a.page.getByTestId("enter-scores").waitFor({ state: "hidden" });
    await a.page.waitForURL(base + "/");
    // Scorecard: 9 holes + sum at 320 px, all symbols, ties and both languages.
    for (let h = 1; h <= 9; h++)
      await write(
        b.page,
        [h === 1 ? 2 : h === 2 ? 5 : 4, h === 1 ? 6 : 4, 4],
        h,
      );
    await a.page.goto(base + "/scorecard?id=" + round.round_id);
    await a.page.getByTestId("card-half-0").waitFor();
    await snapshot(a.page, "04-scorecard-korean");
    await call(a.page, "/api/me", { language: "en" }, "PATCH");
    await a.page.setViewportSize({ width: 320, height: 844 });
    await a.page.reload();
    await a.page.getByTestId("card-half-0").waitFor();
    await snapshot(a.page, "05-scorecard-english-320");
    const bounds = await a.page.getByTestId("card-half-0").boundingBox();
    assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 320);
    await a.page.goto(scoreURL);
    await a.page.getByTestId("current-hole").waitFor();
    await snapshot(a.page, "06-score-entry-english-320");
    assert.deepEqual(errors, []);
    console.log(
      "UI PASS: first hole, saved/default/unsaved states, three navigation choices, last-hole resume, atomic conflicts and reconfirmation, partial rejection, failed-save retention/retry, deletion, shell navigation, scorecard and 320px English.",
    );
  } finally {
    await browser.close();
  }
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
