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
    await page.screenshot({ path: "qa/stage-3/" + name + ".png" });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
  }
  await mkdir("qa/stage-3", { recursive: true });
  try {
    const a = await start("야모"),
      b = await start("동반자"),
      c = await start("동반자");
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
    await a.page.goto(base + "/round?id=" + round.round_id);
    await a.page.getByTestId("manage-players").click();
    await a.page.getByTestId("manage-" + second.slot_id).click();
    await a.page
      .getByRole("button", { name: "사용자 연결", exact: true })
      .click();
    await a.page
      .getByTestId("player-code")
      .fill("yamone-golf://player/" + c.profile.personal_code);
    await a.page.getByTestId("find-player").click();
    assert.equal(
      await a.page.getByTestId("resolved-player-code").textContent(),
      c.profile.personal_code,
    );
    await snapshot(a.page, "01-confirm-player-link");
    await a.page.getByTestId("confirm-player-link").click();
    await a.page.getByTestId("manage-" + second.slot_id).waitFor();
    assert.equal(
      (await call(a.page, root + "/players")).players[1].user_id,
      c.profile.user_id,
    );
    assert.equal((await call(c.page, "/api/home")).active_round, null);
    // Linking does not create a participant or an ad record. A linked slot cannot be directly deleted.
    await a.page.getByTestId("manage-" + second.slot_id).click();
    await a.page.getByTestId("review-delete-player").click();
    assert.equal(await a.page.getByTestId("confirm-delete-player").count(), 0);
    await snapshot(a.page, "02-protected-slot");
    await a.page.getByTestId("cancel-player-edit").click();
    await a.page.getByTestId("manage-" + second.slot_id).click();
    await a.page.getByTestId("player-name").fill("연결 해제 선수");
    await a.page.getByTestId("save-player").click();
    await a.page.getByTestId("manage-" + second.slot_id).waitFor();
    assert.equal(
      (await call(a.page, root + "/players")).players[1].user_id,
      null,
    );
    // Background refresh must preserve the draft. Saving against a changed version requires a new review.
    await a.page.getByTestId("manage-" + second.slot_id).click();
    await a.page.getByTestId("player-name").fill("내 작성 중 이름");
    const latest = (await call(b.page, root + "/players")).players[1];
    await call(
      b.page,
      root + "/players/" + second.slot_id,
      {
        mutation_id: randomUUID(),
        version: latest.version,
        action: "rename",
        name: "다른 기록자 수정",
      },
      "PATCH",
    );
    await a.page.getByTestId("refresh-players").click();
    assert.equal(
      await a.page.getByTestId("player-name").inputValue(),
      "내 작성 중 이름",
    );
    await a.page.getByTestId("save-player").click();
    await a.page
      .getByRole("button", { name: "최신 내용으로 다시 열기", exact: true })
      .waitFor();
    await snapshot(a.page, "03-preserved-draft");
    await a.page
      .getByRole("button", { name: "최신 내용으로 다시 열기", exact: true })
      .click();
    await a.page.waitForFunction(
      () =>
        document.querySelector<HTMLInputElement>('[data-testid="player-name"]')
          ?.value === "다른 기록자 수정",
    );
    await a.page.getByTestId("cancel-player-edit").click();
    // Lost add response is retried with the same mutation ID, not a second slot.
    let lost = false;
    await a.page.route("**/api/rounds/*/players", async (route) => {
      if (route.request().method() !== "POST" || lost) {
        await route.continue();
        return;
      }
      lost = true;
      await route.fetch();
      await route.abort("connectionreset");
    });
    await a.page.getByTestId("add-slot").click();
    await a.page.getByTestId("player-name").fill("추가 선수");
    await a.page.getByTestId("save-player").click();
    await a.page
      .getByText(
        "서버에 연결하지 못했습니다. 입력한 내용은 그대로 두고 다시 시도하세요.",
        { exact: true },
      )
      .waitFor();
    await a.page.getByTestId("save-player").click();
    await a.page.getByTestId("add-slot").waitFor();
    const added = (await call(a.page, root + "/players")).players;
    assert.equal(added.length, 4);
    const extra = added[3];
    await a.page.goto(base + "/input-targets?id=" + round.round_id);
    await a.page.getByTestId("unselect-" + extra.slot_id).click();
    await a.page.getByTestId("target-up-" + third.slot_id).click();
    await a.page.getByTestId("save-targets").click();
    await a.page
      .getByText("내 입력 대상과 순서를 저장했습니다.", { exact: true })
      .waitFor();
    assert.deepEqual((await call(a.page, root + "/input-targets")).slot_ids, [
      self.slot_id,
      third.slot_id,
      second.slot_id,
    ]);
    assert.equal(
      (await call(b.page, root + "/input-targets")).slot_ids.length,
      4,
    );
    await a.page.reload();
    await a.page.getByTestId("selected-" + self.slot_id).waitFor();
    await snapshot(a.page, "04-personal-targets");
    // Actual drag and drop changes only the draft until saved.
    const handle = a.page.getByLabel("끌어서 순서 변경 야모", { exact: true });
    await handle.scrollIntoViewIfNeeded();
    const box = await handle.boundingBox();
    assert.ok(box);
    await a.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await a.page.mouse.down();
    await a.page.mouse.move(
      box.x + box.width / 2,
      box.y + box.height / 2 + 280,
      { steps: 12 },
    );
    await a.page.mouse.up();
    assert.deepEqual((await call(a.page, root + "/input-targets")).slot_ids, [
      self.slot_id,
      third.slot_id,
      second.slot_id,
    ]);
    await a.page.getByTestId("save-targets").click();
    await a.page
      .getByText("내 입력 대상과 순서를 저장했습니다.", { exact: true })
      .waitFor();
    assert.deepEqual((await call(a.page, root + "/input-targets")).slot_ids, [
      third.slot_id,
      self.slot_id,
      second.slot_id,
    ]);
    // A remains independent when B saves an empty list.
    await b.page.goto(base + "/input-targets?id=" + round.round_id);
    for (const p of added)
      await b.page.getByTestId("unselect-" + p.slot_id).click();
    await b.page.getByTestId("save-targets").click();
    await b.page
      .getByText("내 입력 대상과 순서를 저장했습니다.", { exact: true })
      .waitFor();
    await b.page.reload();
    await b.page
      .getByText(
        "선택된 플레이어가 없습니다. 관람만 할 때는 비워 두어도 됩니다.",
        { exact: true },
      )
      .waitFor();
    assert.equal(
      (await call(a.page, root + "/input-targets")).slot_ids.length,
      3,
    );
    // Safe deletion removes the slot from A’s targets, with history retained on the server.
    await a.page.goto(base + "/players?id=" + round.round_id);
    await a.page.getByTestId("manage-" + second.slot_id).click();
    await a.page.getByTestId("review-delete-player").click();
    await a.page.getByTestId("confirm-delete-player").click();
    await a.page
      .getByTestId("manage-" + second.slot_id)
      .waitFor({ state: "detached" });
    assert.deepEqual((await call(a.page, root + "/input-targets")).slot_ids, [
      third.slot_id,
      self.slot_id,
    ]);
    await call(b.page, "/api/me", { language: "en" }, "PATCH");
    await b.page.setViewportSize({ width: 320, height: 844 });
    await b.page.reload();
    await b.page
      .getByText(
        "No players selected. You can leave this empty if you are only viewing.",
        { exact: true },
      )
      .waitFor();
    await snapshot(b.page, "05-empty-targets-english-320");
    assert.deepEqual(errors, []);
    console.log(
      "UI PASS: code/QR-text identity confirmation, link/unlink, protected delete, preserved draft/version conflict, lost-add retry, personal selection/order/drag/empty list, safe deletion cleanup, English 320px.",
    );
  } finally {
    await browser.close();
  }
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
