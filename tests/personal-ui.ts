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
      path: "qa/stage-8/" + name + ".png",
    });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
  }
  await mkdir("qa/stage-8", { recursive: true });
  try {
    const a = await start("기록자"),
      b = await start("야모");
    const course = (
      await call(a.page, "/api/courses", {
        course_id: randomUUID(),
        name: "개인 통계 테스트 골프장",
        region: "경기",
        segments: [{ name: "OUT", pars: Array(9).fill(4) }],
      })
    ).course;
    const prep = await call(a.page, "/api/round-actions", {
      action_id: randomUUID(),
      kind: "create",
      course_id: course.course_id,
      course_version: course.version,
      segment_indices: [0, 0],
      players: [
        { name: "기록자", self: true },
        { name: "야모", self: false },
        { name: "미완료 선수", self: false },
      ],
    });
    await call(a.page, "/api/round-actions/" + prep.action_id + "/ad", {
      outcome: "unavailable",
    });
    const round = (
        await call(
          a.page,
          "/api/round-actions/" + prep.action_id + "/execute",
          {},
        )
      ).round,
      root = "/api/rounds/" + round.round_id;
    let roster = (await call(a.page, root + "/players")).players;
    await call(
      a.page,
      root + "/players/" + roster[1].slot_id,
      {
        mutation_id: randomUUID(),
        version: roster[1].version,
        action: "link",
        code: b.profile.personal_code,
        confirmed_user_id: b.profile.user_id,
      },
      "PATCH",
    );
    for (let h = 1; h <= 18; h++) {
      const sheet = await call(a.page, root + "/scores");
      await call(
        a.page,
        root + "/scores",
        {
          mutation_id: randomUUID(),
          hole: h,
          roster_version: sheet.roster_version,
          target_version: sheet.target_version,
          entries: sheet.slot_ids.map((id: string, i: number) => ({
            slot_id: id,
            strokes: i === 2 ? null : 4,
            version: 0,
          })),
        },
        "PUT",
      );
    }
    const ending = await call(a.page, root + "/ending");
    await call(a.page, root + "/ending", {
      user_id: a.profile.user_id,
      mutation_id: randomUUID(),
      record_version: ending.record_version,
    });
    roster = (await call(a.page, root + "/players")).players;
    async function receive(index: number, who: typeof a) {
      const p = roster[index],
        v = (
          await call(a.page, root + "/deliveries", {
            user_id: a.profile.user_id,
            mutation_id: randomUUID(),
            slot_id: p.slot_id,
            version: p.version,
            recipient_id: p.user_id,
          })
        ).delivery;
      const act = await call(who.page, "/api/receipt-actions", {
        user_id: who.profile.user_id,
        action_id: randomUUID(),
        delivery_id: v.delivery_id,
      });
      if (!act.ad_settled)
        await call(who.page, "/api/receipt-actions/" + act.action_id + "/ad", {
          user_id: who.profile.user_id,
          outcome: "unavailable",
        });
      return (
        await call(
          who.page,
          "/api/receipt-actions/" + act.action_id + "/execute",
          { user_id: who.profile.user_id },
        )
      ).receipt;
    }
    const record = await receive(1, b),
      owner = await receive(0, a),
      id = record.receipt_id,
      editURL = base + "/record-edit?id=" + id;
    await b.page.goto(base + "/records");
    await b.page.getByTestId("open-statistics").click();
    await b.page
      .getByTestId("eligible-rounds")
      .filter({ hasText: "1" })
      .waitFor();
    assert.equal(
      await b.page.getByTestId("stat-averageScore").innerText(),
      "72",
    );
    await snapshot(b.page, "01-own-18-hole-statistics");
    await b.page.goto(base + "/records");
    await b.page.getByTestId("record-search").fill("없는 골프장");
    await b.page.getByTestId("search-records").click();
    await b.page.getByTestId("empty-records").waitFor();
    await b.page.getByTestId("record-search").fill("개인 통계");
    await b.page.getByTestId("filter-statistics").click();
    await b.page.getByTestId("search-records").click();
    await b.page.getByTestId("record-" + id).click();
    await b.page.getByTestId("edit-own-scores").click();
    await b.page
      .getByTestId("correction-current-hole")
      .filter({ hasText: "홀 1 ·" })
      .waitFor();
    await b.page.getByTestId("correction-plus").click();
    await b.page
      .getByTestId("correction-value")
      .filter({ hasText: "5" })
      .waitFor();
    await b.page.getByTestId("correction-hole-2").click();
    await b.page.getByTestId("correction-keep-editing").click();
    await b.page.getByTestId("correction-hole-2").click();
    await b.page.getByTestId("correction-keep-move").click();
    await b.page
      .getByTestId("correction-current-hole")
      .filter({ hasText: "홀 2 ·" })
      .waitFor();
    await b.page.getByTestId("correction-plus").click();
    await b.page
      .getByTestId("correction-value")
      .filter({ hasText: "5" })
      .waitFor();
    await b.page
      .getByTestId("correction-drafts")
      .filter({ hasText: "1, 2" })
      .waitFor();
    // Cold restart retains both drafts, and refresh cannot overwrite them.
    const context = b.page.context();
    await b.page.close();
    b.page = await context.newPage();
    b.page.on("pageerror", (e) => errors.push(e.message));
    b.page.on("dialog", (d) => void d.accept());
    await b.page.goto(base);
    await b.page.getByTestId("home-correction-" + id).click();
    await b.page
      .getByTestId("correction-drafts")
      .filter({ hasText: "1, 2" })
      .waitFor();
    await b.page.getByTestId("correction-hole-1").click();
    await b.page.getByTestId("correction-keep-move").click();
    await b.page
      .getByTestId("correction-current-hole")
      .filter({ hasText: "홀 1 ·" })
      .waitFor();
    assert.equal(await b.page.getByTestId("correction-value").innerText(), "5");
    await snapshot(b.page, "02-restored-own-score-drafts");
    const endpoint = "/api/records/" + id + "/scores";
    async function serverEdit(strokes: number) {
      const v = await call(b.page, endpoint);
      await call(
        b.page,
        endpoint,
        {
          user_id: b.profile.user_id,
          mutation_id: randomUUID(),
          player_slot_id: v.player_slot_id,
          slot_version: v.slot_version,
          hole: 1,
          strokes,
          version: v.scores.find((s: any) => s.hole === 1).version,
        },
        "PUT",
      );
    }
    await serverEdit(6);
    await b.page.getByTestId("save-correction").click();
    await b.page
      .getByTestId("correction-conflict")
      .filter({ hasText: "6 → 5" })
      .waitFor();
    await serverEdit(7);
    await b.page.getByTestId("confirm-correction").click();
    await b.page
      .getByTestId("correction-conflict")
      .filter({ hasText: "7 → 5" })
      .waitFor();
    await snapshot(b.page, "03-reconfirm-latest-score");
    await b.page.getByTestId("reject-correction").click();
    await b.page
      .getByTestId("correction-value")
      .filter({ hasText: "7" })
      .waitFor();
    assert.ok(
      (await b.page.getByTestId("correction-drafts").innerText()).includes("2"),
    );
    await b.page.getByTestId("correction-plus").click();
    let dropped!: () => void;
    const done = new Promise<void>((r) => {
      dropped = r;
    });
    await b.page.route("**/api/records/*/scores", async (route) => {
      if (route.request().method() === "PUT") {
        await route.fetch();
        await route.abort("connectionfailed");
        dropped();
      } else await route.continue();
    });
    await b.page.getByTestId("save-correction").click();
    await done;
    await b.page.getByTestId("retry-correction").waitFor();
    await b.page.close();
    b.page = await context.newPage();
    b.page.on("pageerror", (e) => errors.push(e.message));
    b.page.on("dialog", (d) => void d.accept());
    await b.page.goto(editURL);
    await b.page.getByTestId("retry-correction").click();
    await b.page.getByTestId("correction-saved").waitFor();
    assert.equal(await b.page.getByTestId("correction-value").innerText(), "8");
    const full = await call(a.page, "/api/records/" + owner.receipt_id);
    assert.equal(
      full.sheet.scores.find(
        (s: any) => s.slot_id === roster[1].slot_id && s.hole === 1,
      ).strokes,
      8,
    );
    assert.equal((await call(b.page, "/api/statistics")).average_strokes, 76);
    await b.page.getByTestId("delete-correction").click();
    await b.page
      .getByTestId("correction-state")
      .filter({ hasText: "미입력" })
      .waitFor();
    assert.equal((await call(b.page, "/api/statistics")).eligible_rounds, 0);
    await b.page.getByTestId("save-correction").click();
    await b.page
      .getByTestId("correction-state")
      .filter({ hasText: "저장했습니다" })
      .waitFor();
    assert.equal((await call(b.page, "/api/statistics")).average_strokes, 72);
    // Finite known rejection retains the draft and is not auto-posted on refresh.
    await b.page.getByTestId("correction-hole-2").click();
    await b.page.getByTestId("discard-correction").click();
    await b.page
      .getByTestId("correction-drafts")
      .waitFor({ state: "detached" });
    await b.page.getByTestId("correction-plus").click();
    await b.page
      .getByTestId("correction-value")
      .filter({ hasText: "5" })
      .waitFor();
    const linked = (await call(a.page, root + "/players")).players[1];
    await call(
      a.page,
      root + "/players/" + linked.slot_id,
      {
        mutation_id: randomUUID(),
        version: linked.version,
        action: "unlink",
        name: "연결 해제",
      },
      "PATCH",
    );
    await b.page.getByTestId("save-correction").click();
    await b.page.getByTestId("retry-correction").waitFor();
    await b.page.getByTestId("refresh-correction").click();
    await b.page.getByTestId("correction-locked").waitFor();
    assert.equal(await b.page.getByTestId("correction-value").innerText(), "5");
    await snapshot(b.page, "04-link-change-held");
    assert.equal((await call(b.page, "/api/statistics")).eligible_rounds, 0);
    await b.page.getByTestId("discard-correction").click();
    await b.page
      .getByTestId("correction-drafts")
      .waitFor({ state: "detached" });
    const unlinked = (await call(a.page, root + "/players")).players[1];
    await call(
      a.page,
      root + "/players/" + unlinked.slot_id,
      {
        mutation_id: randomUUID(),
        version: unlinked.version,
        action: "link",
        code: b.profile.personal_code,
        confirmed_user_id: b.profile.user_id,
      },
      "PATCH",
    );
    await b.page.getByTestId("refresh-correction").click();
    await b.page
      .getByTestId("correction-locked")
      .waitFor({ state: "detached" });
    await b.page.getByRole("tab", { name: "홈", exact: true }).click();
    await b.page.getByTestId("home-records").waitFor();
    await call(b.page, "/api/me", { language: "en" }, "PATCH");
    await b.page.setViewportSize({ width: 320, height: 844 });
    await b.page.goto(base + "/statistics");
    await b.page.getByTestId("eligible-rounds").waitFor();
    await snapshot(b.page, "05-english-320-statistics");
    await b.page.goto(editURL);
    await b.page.getByTestId("correction-current-hole").waitFor();
    await snapshot(b.page, "06-english-320-own-edit");
    assert.deepEqual(errors, []);
    console.log(
      "Stage 8 UI passed: own complete-18 statistics, course search/filter, multi-hole durable drafts, move protection, repeated conflicts/rejection, lost-response restart, shared score update, delete/refill eligibility, shell navigation and English 320px.",
    );
  } finally {
    await browser.close();
  }
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
