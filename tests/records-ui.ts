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
      path: "qa/stage-7/" + name + ".png",
    });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
  }
  await mkdir("qa/stage-7", { recursive: true });
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
    await write(a.page, [4, 5, 6]);
    const endState = await call(a.page, root + "/ending");
    await call(a.page, root + "/ending", {
      user_id: a.profile.user_id,
      mutation_id: randomUUID(),
      record_version: endState.record_version,
    });
    await a.page.goto(base + "/round?id=" + round.round_id);
    await a.page.getByTestId("manage-players").click();
    await a.page.getByTestId("manage-" + second.slot_id).click();
    await a.page
      .getByRole("button", { name: "사용자 연결", exact: true })
      .click();
    await a.page.getByTestId("player-code").fill(c.profile.personal_code);
    await a.page.getByTestId("find-player").click();
    await a.page.getByTestId("confirm-player-link").click();
    await a.page.getByTestId("refresh-players").waitFor();
    await a.page.goto(base + "/round-records?id=" + round.round_id);
    await a.page.getByTestId("send-record-" + second.slot_id).click();
    await a.page
      .getByText("전송 대기", { exact: true })
      .filter({ visible: true })
      .first()
      .waitFor();
    const v = (await call(c.page, "/api/record-inbox")).items[0];
    assert.ok(v);
    await snapshot(a.page, "01-ended-player-deliveries");
    await c.page.goto(base);
    await c.page.getByTestId("home-records").click();
    await c.page.getByTestId("receive-" + v.delivery_id).click();
    await c.page.getByTestId("receive-ad-complete").waitFor();
    await snapshot(c.page, "02-first-receive-ad");
    // Exiting while the test ad is merely displayed must not settle it.
    const context = c.page.context();
    await c.page.close();
    c.page = await context.newPage();
    c.page.on("pageerror", (e) => errors.push(e.message));
    c.page.on("dialog", (d) => void d.accept());
    await c.page.goto(base);
    await c.page.getByTestId("home-resume-receipt").click();
    await c.page.getByTestId("receive-ad-complete").waitFor();
    assert.equal((await call(c.page, "/api/records")).items.length, 0);
    // Save an ad outcome locally while the acknowledgement fails. Leaving the
    // receive flow must settle the proof without registering a personal record.
    let adFailed!: () => void;
    const failedAd = new Promise<void>((resolve) => {
      adFailed = resolve;
    });
    await c.page.route("**/api/receipt-actions/*/ad", async (route) => {
      await route.abort("connectionfailed");
      adFailed();
    });
    await c.page.getByTestId("receive-ad-unavailable").click();
    await failedAd;
    await c.page.getByTestId("execute-receive").waitFor();
    await c.page.unroute("**/api/receipt-actions/*/ad");
    await c.page.getByTestId("cancel-receive").click();
    await c.page.getByTestId("receive-" + v.delivery_id).waitFor();
    assert.equal((await call(c.page, "/api/records")).items.length, 0);
    await c.page.getByTestId("receive-" + v.delivery_id).click();
    await c.page.getByTestId("execute-receive").waitFor();
    assert.equal(await c.page.getByTestId("receive-ad-complete").count(), 0);
    // Drop the receive response after the server commits, then reopen and retry.
    let receivedAndDropped!: () => void;
    const dropped = new Promise<void>((resolve) => {
      receivedAndDropped = resolve;
    });
    await c.page.route("**/api/receipt-actions/*/execute", async (route) => {
      await route.fetch();
      await route.abort("connectionfailed");
      receivedAndDropped();
    });
    await c.page.getByTestId("execute-receive").click();
    await dropped;
    await c.page.getByTestId("execute-receive").waitFor();
    const got = (await call(c.page, "/api/records")).items[0];
    assert.ok(got);
    await c.page.close();
    c.page = await context.newPage();
    c.page.on("pageerror", (e) => errors.push(e.message));
    c.page.on("dialog", (d) => void d.accept());
    await c.page.goto(base + "/receive-record");
    await c.page.getByTestId("execute-receive").click();
    await c.page.getByTestId("card-half-1").waitFor();
    assert.equal(await c.page.getByTestId("receive-ad-complete").count(), 0);
    assert.equal(await c.page.getByTestId("save-hole").count(), 0);
    const detail = await call(c.page, "/api/records/" + got.receipt_id);
    assert.equal(detail.sheet.players.length, 3);
    assert.equal(detail.sheet.scores.length, 3);
    await snapshot(c.page, "03-whole-round-received");
    await c.page.getByTestId("delete-record").click();
    await c.page.getByTestId("record-deleted").waitFor();
    await c.page.getByTestId("record-list").click();
    await c.page.getByTestId("empty-inbox").waitFor();
    await c.page.getByTestId("empty-records").waitFor();
    await snapshot(c.page, "04-deleted-no-old-delivery");
    // Only an explicit new send produces a new inbox entry. Its ad is already settled.
    await a.page.goto(base + "/round-records?id=" + round.round_id);
    await a.page.getByTestId("send-record-" + second.slot_id).click();
    await a.page
      .getByText("전송 대기", { exact: true })
      .filter({ visible: true })
      .first()
      .waitFor();
    const sentAgain = (await call(c.page, "/api/record-inbox")).items[0];
    assert.notEqual(sentAgain.delivery_id, v.delivery_id);
    await c.page.getByTestId("refresh-records").click();
    await c.page.getByTestId("receive-" + sentAgain.delivery_id).click();
    await c.page.getByTestId("execute-receive").waitFor();
    assert.equal(await c.page.getByTestId("receive-ad-complete").count(), 0);
    await c.page.getByTestId("execute-receive").click();
    await c.page.getByTestId("delete-record").waitFor();
    // Creator receives their own record with the creation ad settlement.
    await a.page.getByTestId("send-record-" + self.slot_id).click();
    await a.page.getByTestId("execute-receive").waitFor();
    assert.equal(await a.page.getByTestId("receive-ad-complete").count(), 0);
    await a.page.getByTestId("execute-receive").click();
    await a.page.getByTestId("record-deliveries").waitFor();
    // Third player is connected and sent, then sender cancels before receiving.
    const p = (await call(a.page, root + "/players")).players.find(
      (p: any) => p.slot_id === third.slot_id,
    );
    await call(
      a.page,
      root + "/players/" + third.slot_id,
      {
        mutation_id: randomUUID(),
        version: p.version,
        action: "link",
        code: b.profile.personal_code,
        confirmed_user_id: b.profile.user_id,
      },
      "PATCH",
    );
    await a.page.getByTestId("record-deliveries").click();
    await a.page.waitForURL("**/round-records?*");
    await a.page
      .getByTestId("send-record-" + third.slot_id)
      .filter({ visible: true })
      .click();
    await a.page
      .getByText("전송 대기", { exact: true })
      .filter({ visible: true })
      .first()
      .waitFor();
    const waiting = (await call(b.page, "/api/record-inbox")).items[0];
    await a.page
      .getByTestId("cancel-delivery-" + waiting.delivery_id)
      .filter({ visible: true })
      .click();
    await a.page
      .getByTestId("cancel-delivery-" + waiting.delivery_id)
      .filter({ visible: true })
      .waitFor({ state: "detached" });
    assert.equal((await call(b.page, "/api/record-inbox")).items.length, 0);
    await call(c.page, "/api/me", { language: "en" }, "PATCH");
    await c.page.setViewportSize({ width: 320, height: 844 });
    await c.page.goto(base + "/records");
    await c.page.getByTestId("refresh-records").waitFor();
    await snapshot(c.page, "05-english-320-records");
    assert.deepEqual(errors, []);
    console.log(
      "Stage 7 UI passed: ended code link, delivery, ad interruption/restart, lost receive response/replay, whole-round read, personal deletion/new delivery, no repeat ads, sender cancellation and English 320px.",
    );
  } finally {
    await browser.close();
  }
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
