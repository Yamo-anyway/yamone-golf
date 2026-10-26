import { chromium } from "playwright";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
const base = process.env.PREVIEW_URL ?? "http://localhost:4173";
async function main() {
  const browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    locale: "ko-KR",
  });
  page.on("response", async (response) => {
    if (
      response.url().includes("/api/") &&
      !response.ok() &&
      response.status() !== 401
    ) {
      try {
        const data = await response.json();
        console.log(
          "API failure",
          new URL(response.url()).pathname,
          response.status(),
          data.error,
        );
      } catch {
        /* no JSON error */
      }
    }
  });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const api = async (path: string, value?: unknown, method?: string) =>
    page.evaluate(
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
        if (!r.ok) throw Error(JSON.stringify(data));
        return data;
      },
      { path, value, method },
    );
  const overflow = async () =>
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
  await mkdir("qa/scorecard-flow", { recursive: true });
  try {
    await page.goto(base);
    await page.getByTestId("nickname").fill("야모");
    await page.getByTestId("start").click();
    await page.getByTestId("backup-done").click();
    const course = (
      await api("/api/courses", {
        course_id: randomUUID(),
        name: "야모 레이크 골프클럽",
        region: "경기도",
        segments: [
          { name: "LAKE", pars: [4, 4, 3, 5, 4, 4, 3, 5, 4] },
          { name: "HILL", pars: [4, 5, 3, 4, 4, 5, 3, 4, 4] },
        ],
      })
    ).course;
    const action = await api("/api/round-actions", {
      action_id: randomUUID(),
      kind: "create",
      course_id: course.course_id,
      course_version: course.version,
      segment_indices: [0, 1],
      players: [
        "야모",
        "민수",
        "서연",
        "준호",
        "지우",
        "하늘",
        "동반자 긴 이름 테스트",
        "수빈",
      ].map((name, i) => ({ name, self: i === 0 })),
    });
    await api("/api/round-actions/" + action.action_id + "/ad", {
      outcome: "unavailable",
    });
    const round = (
      await api("/api/round-actions/" + action.action_id + "/execute", {})
    ).round;
    const root = "/api/rounds/" + round.round_id,
      cardURL = base + "/scorecard?id=" + round.round_id;
    await page.goto(cardURL);
    await page.getByTestId("card-half-0").waitFor();
    const sheet = () => api(root + "/scores");
    const slots = (await sheet()).players;
    const self = slots[0].slot_id;
    const checkCard = async () => {
      const heading = (await page
          .getByTestId("scorecard-course-name")
          .boundingBox())!,
        actions = (await page.getByTestId("scorecard-actions").boundingBox())!,
        table = (await page.getByTestId("card-half-0").boundingBox())!;
      assert.ok(
        actions.y >= heading.y + heading.height &&
          actions.y + actions.height <= table.y + 1,
      );
      assert.equal(
        await page
          .getByTestId("card-half-0")
          .locator('[data-testid^="card-hole-"]')
          .count(),
        9,
      );
      const header = (await page.getByTestId("card-hole-1").boundingBox())!,
        cell = (await page
          .getByTestId("card-score-" + self + "-1")
          .boundingBox())!,
        name = (await page
          .getByTestId("card-player-name-0-" + self)
          .boundingBox())!;
      assert.ok(Math.abs(header.width - cell.width) < 1);
      assert.ok(name.width > header.width * 9);
      assert.ok(
        await page
          .getByTestId("card-player-name-0-" + slots[6].slot_id)
          .textContent(),
      );
      await overflow();
    };
    await checkCard();
    await page.getByTestId("card-hole-3").click();
    await page
      .getByTestId("current-hole")
      .filter({ hasText: "3번홀 Par 3" })
      .waitFor();
    assert.equal(
      await page
        .getByText("이 홀의 내 입력 대상 전체", { exact: true })
        .count(),
      0,
    );
    await page.getByTestId("plus-" + self).click();
    await page.getByTestId("cancel-hole").click();
    await page.waitForURL(cardURL);
    assert.equal(
      (await sheet()).scores.filter((s: any) => s.hole === 3).length,
      0,
    );
    await page.getByTestId("card-hole-1").click();
    await page.getByTestId("plus-" + self).click();
    await page.getByTestId("save-hole").click();
    await page.waitForURL(cardURL);
    assert.equal(
      (await sheet()).scores.find(
        (s: any) => s.slot_id === self && s.hole === 1,
      ).strokes,
      5,
    );
    // Clicking a score cell enters that column's hole, too.
    await page.getByTestId("card-score-" + self + "-1").click();
    await page.getByTestId("delete-hole").click();
    await page.getByTestId("confirm-delete-hole").click();
    await page
      .getByTestId("score-value-" + self)
      .filter({ hasText: "—" })
      .waitFor();
    assert.equal(
      (await sheet()).scores.find(
        (s: any) => s.slot_id === self && s.hole === 1,
      ).strokes,
      5,
    );
    await page.screenshot({ path: "qa/scorecard-flow/delete-before-save.png" });
    await page.getByTestId("cancel-hole").click();
    await page.waitForURL(cardURL);
    assert.equal(
      (await sheet()).scores.find(
        (s: any) => s.slot_id === self && s.hole === 1,
      ).strokes,
      5,
    );
    await page.getByTestId("card-hole-1").click();
    await page.getByTestId("delete-hole").click();
    await page.getByTestId("confirm-delete-hole").click();
    await page.getByTestId("save-hole").click();
    await page.waitForURL(cardURL);
    assert.equal(
      (await sheet()).scores.filter(
        (s: any) => s.hole === 1 && s.strokes !== null,
      ).length,
      0,
    );
    // Saving an edit also returns to the card; offline saves expose a queued status.
    await page.getByTestId("card-hole-1").click();
    await page.getByTestId("plus-" + self).click();
    await page.getByTestId("save-hole").click();
    await page.waitForURL(cardURL);
    await page.getByTestId("card-hole-1").click();
    await page.getByTestId("plus-" + self).click();
    await page.getByTestId("save-hole").click();
    await page.waitForURL(cardURL);
    assert.equal(
      (await sheet()).scores.find(
        (s: any) => s.slot_id === self && s.hole === 1,
      ).strokes,
      6,
    );
    let disconnected = true;
    await page.route("**/api/rounds/*/scores", async (route) => {
      if (disconnected && route.request().method() === "PUT")
        await route.abort("internetdisconnected");
      else await route.continue();
    });
    await page.getByTestId("card-hole-2").click();
    await page.getByTestId("plus-" + self).click();
    await page.getByTestId("save-hole").click();
    await page.waitForURL(cardURL);
    await page.getByTestId("scorecard-pending").waitFor();
    disconnected = false;
    await page.getByTestId("scorecard-enter-scores").click();
    await page.getByTestId("save-hole").click();
    await page.waitForURL(cardURL);
    await page.getByTestId("scorecard-pending").waitFor({ state: "hidden" });
    assert.equal(
      (await sheet()).scores.find(
        (s: any) => s.slot_id === self && s.hole === 2,
      ).strokes,
      5,
    );
    for (const width of [320, 390, 430]) {
      await page.setViewportSize({ width, height: 844 });
      await checkCard();
      await page.screenshot({
        path: "qa/scorecard-flow/card-ko-" + width + ".png",
      });
    }
    await page.getByTestId("scorecard-round-room").click();
    await page.waitForURL(base + "/round?id=" + round.round_id);
    await api("/api/me", { language: "en" }, "PATCH");
    await page.goto(cardURL);
    await page.setViewportSize({ width: 320, height: 740 });
    await checkCard();
    await page.getByTestId("card-hole-12").click();
    await page
      .getByTestId("current-hole")
      .filter({ hasText: "Hole 12 Par 3" })
      .waitFor();
    await overflow();
    await page.screenshot({ path: "qa/scorecard-flow/entry-en-320.png" });
    await page.getByTestId("cancel-hole").click();
    await page.waitForURL(cardURL);
    const ending = await api(root + "/ending");
    await api(root + "/ending", {
      user_id: (await api("/api/me")).profile.user_id,
      mutation_id: randomUUID(),
      record_version: ending.record_version,
    });
    await page.goto(cardURL);
    // Wait for the cached card to mount before checking its refreshed ended state.
    await page.getByTestId("card-half-0").waitFor();
    await page
      .getByTestId("scorecard-enter-scores")
      .waitFor({ state: "hidden" });
    assert.equal(
      await page.getByTestId("card-hole-1").getAttribute("role"),
      null,
    );
    await page.getByTestId("card-hole-1").dispatchEvent("click");
    await page.getByTestId("card-score-" + self + "-1").dispatchEvent("click");
    assert.equal(page.url(), cardURL);
    assert.equal(await page.getByTestId("save-hole").count(), 0);
    assert.deepEqual(errors, []);
    console.log(
      "PASS scorecard flow: staged deletion/cancel/save, new/edit/queued return, header/cell hole entry, fixed columns, full-width nicknames, top room actions, 8 players, 320/390/430px, Korean/English, ended card read-only",
    );
  } catch (error) {
    await page
      .screenshot({ path: "qa/scorecard-flow/failure.png" })
      .catch(() => {});
    console.log(
      "UI failure",
      page.url(),
      "pageerrors",
      errors,
      "visible test IDs",
      await page
        .locator("[data-testid]")
        .evaluateAll((nodes) =>
          nodes.slice(0, 35).map((node) => node.getAttribute("data-testid")),
        ),
    );
    throw error;
  } finally {
    await browser.close();
  }
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
