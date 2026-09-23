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
      path: "qa/stage-9/" + name + ".png",
    });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
  }
  await mkdir("qa/stage-9", { recursive: true });
  try {
    const a = await start("계산자"),
      b = await start("Player B", "en-US", 320);
    const course = (
      await call(a.page, "/api/courses", {
        course_id: randomUUID(),
        name: "야모 신페리오 골프장",
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
        { name: "계산자", self: true },
        { name: "Player B", self: false },
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
    for (let hole = 1; hole <= 18; hole++) {
      const sheet = await call(a.page, root + "/scores");
      await call(
        a.page,
        root + "/scores",
        {
          mutation_id: randomUUID(),
          hole,
          roster_version: sheet.roster_version,
          target_version: sheet.target_version,
          entries: sheet.slot_ids.map((slot_id: string, i: number) => ({
            slot_id,
            strokes: i === 0 ? 4 : i === 1 ? 5 : null,
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
      const p = roster[index];
      const delivery = (
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
        delivery_id: delivery.delivery_id,
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
    const own = await receive(0, a),
      received = await receive(1, b);
    await a.page.goto(base + "/round-ending?id=" + round.round_id);
    await a.page.getByTestId("open-peoria").click();
    await a.page.getByTestId("peoria-empty").waitFor();
    await a.page.getByTestId("peoria-prepare").click();
    await a.page.getByTestId("peoria-confirm").waitFor();
    assert.match(
      await a.page.getByTestId("peoria-confirm").innerText(),
      /미완료 제외/,
    );
    await snapshot(a.page, "01-exclude-incomplete-confirmation");
    await a.page.getByRole("button", { name: "취소", exact: true }).click();
    assert.equal((await call(a.page, root + "/peoria")).runs.length, 0);
    await a.page.getByTestId("peoria-prepare").click();
    await a.page.getByTestId("peoria-confirm").click();
    await a.page.getByTestId("peoria-saved").waitFor();
    assert.match(
      await a.page.getByTestId("peoria-selected").innerText(),
      /결과 1/,
    );
    assert.match(
      await a.page
        .getByTestId("peoria-result-" + roster[1].slot_id)
        .innerText(),
      /75.6/,
    );
    await snapshot(a.page, "02-first-result");
    await b.page.goto(base + "/record?id=" + received.receipt_id);
    await b.page.getByTestId("open-peoria").click();
    await b.page.getByTestId("peoria-record-flow").waitFor();
    await b.page.getByTestId("peoria-locked").waitFor();
    assert.equal(await b.page.getByTestId("peoria-prepare").count(), 0);
    await snapshot(b.page, "03-english-320-read-only");
    // A confirmed list must be reviewed again if scores change before execution.
    await a.page.getByTestId("peoria-prepare").click();
    await a.page.getByTestId("peoria-confirm").waitFor();
    const ownPath = "/api/records/" + own.receipt_id + "/scores",
      view = await call(a.page, ownPath);
    await call(
      a.page,
      ownPath,
      {
        user_id: a.profile.user_id,
        mutation_id: randomUUID(),
        player_slot_id: roster[0].slot_id,
        slot_version: view.slot_version,
        hole: 1,
        strokes: 5,
        version: 1,
      },
      "PUT",
    );
    await a.page.getByTestId("peoria-confirm").click();
    await a.page.getByTestId("peoria-clear-rejected").waitFor();
    assert.equal((await call(a.page, root + "/peoria")).runs.length, 1);
    await a.page.getByTestId("peoria-stale").waitFor();
    await a.page.getByTestId("peoria-clear-rejected").click();
    await a.page.getByTestId("peoria-pending").waitFor({ state: "hidden" });
    let lost = false;
    await a.page.route("**" + root + "/peoria", async (route) => {
      if (route.request().method() === "POST" && !lost) {
        lost = true;
        const response = await route.fetch();
        assert.equal(response.status(), 201);
        await route.abort("failed");
      } else await route.continue();
    });
    await a.page.getByTestId("peoria-prepare").click();
    await a.page.getByTestId("peoria-confirm").click();
    await a.page.getByTestId("peoria-retry").waitFor();
    assert.equal((await call(a.page, root + "/peoria")).runs.length, 2);
    await snapshot(a.page, "04-response-loss-pending");
    const context = a.page.context();
    await a.page.close();
    a.page = await context.newPage();
    a.page.on("pageerror", (e) => errors.push(e.message));
    await a.page.goto(base);
    await a.page.getByTestId("home-resume-peoria").click();
    await a.page.getByTestId("peoria-retry").click();
    await a.page.getByTestId("peoria-saved").waitFor();
    assert.match(
      await a.page.getByTestId("peoria-selected").innerText(),
      /결과 2/,
    );
    assert.equal((await call(a.page, root + "/peoria")).runs.length, 2);
    await a.page.getByTestId("peoria-prepare").click();
    await a.page.getByTestId("peoria-confirm").click();
    await a.page.getByTestId("peoria-locked").waitFor();
    assert.match(await a.page.getByTestId("peoria-count").innerText(), /3\/3/);
    assert.equal(await a.page.getByTestId("peoria-prepare").count(), 0);
    await snapshot(a.page, "05-three-result-limit");
    await a.page.getByTestId("peoria-run-1").click();
    assert.match(
      await a.page.getByTestId("peoria-selected").innerText(),
      /결과 1/,
    );
    await a.page.getByTestId("peoria-snapshot-toggle").click();
    await a.page.getByTestId("card-half-0").waitFor();
    await snapshot(a.page, "06-past-result-snapshot");
    const h = await call(a.page, root + "/peoria");
    assert.equal(h.runs[2].snapshot.players[0].scores[0], 4);
    assert.equal(h.runs[0].snapshot.players[0].scores[0], 5);
    assert.doesNotMatch(
      JSON.stringify(h),
      /hidden_holes|request_hash|request_id/,
    );
    await b.page.getByTestId("refresh-peoria").click();
    await b.page.getByTestId("peoria-run-3").waitFor();
    assert.match(
      await b.page.getByTestId("peoria-selected").innerText(),
      /Result 3/,
    );
    await snapshot(b.page, "07-english-latest-history");
    assert.deepEqual(errors, []);
    console.log(
      "Peoria UI passed: exclusion/cancel, results, receipt read-only, stale confirmation, lost response/restart/replay, three-run limit, historical snapshot, English 320px.",
    );
  } finally {
    await browser.close();
  }
}
void main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
