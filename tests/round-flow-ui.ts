import { chromium, type Page } from "playwright";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
const base = process.env.PREVIEW_URL ?? "http://localhost:4173";
async function main() {
  const browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const errors: string[] = [];
  async function user(name: string) {
    const c = await browser.newContext({
      viewport: { width: 390, height: 844 },
      locale: "ko-KR",
    });
    const p = await c.newPage();
    p.on("pageerror", (e) => errors.push(e.message));
    await p.goto(base);
    await p.getByTestId("nickname").fill(name);
    await p.getByTestId("start").click();
    await p.getByTestId("backup-done").click();
    return p;
  }
  async function api(p: Page, path: string, value?: unknown) {
    return p.evaluate(
      async ({ path, value }) => {
        const r = await fetch(path, {
          method: value === undefined ? "GET" : "POST",
          headers: { "Content-Type": "application/json" },
          body: value === undefined ? undefined : JSON.stringify(value),
        });
        const data = await r.json();
        if (!r.ok) throw Error(JSON.stringify(data));
        return data;
      },
      { path, value },
    );
  }
  async function shot(p: Page, name: string) {
    await p.evaluate(() =>
      document.querySelectorAll("*").forEach((e) => {
        if (e.scrollTop) e.scrollTop = 0;
      }),
    );
    await p.screenshot({ path: `qa/round-flow/${name}.png` });
    assert.equal(
      await p.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
  }
  await mkdir("qa/round-flow", { recursive: true });
  try {
    const a = await user("야모"),
      b = await user("민준");
    const course = (
      await api(a, "/api/courses", {
        course_id: randomUUID(),
        name: "야모 레이크 골프클럽",
        region: "경기도",
        segments: [
          { name: "레이크", pars: [4, 4, 3, 5, 4, 4, 3, 5, 4] },
          { name: "포레스트", pars: [4, 4, 5, 3, 4, 4, 5, 3, 4] },
        ],
      })
    ).course;
    await a.getByTestId("new-round").waitFor();
    await shot(a, "01-home");
    await a.getByTestId("new-round").click();
    await a.getByTestId("public-courses").click();
    await a.getByTestId("choose-" + course.course_id).click();
    await a.getByTestId("setup-holes-9").click();
    await shot(a, "02-holes");
    await a.getByTestId("setup-players").click();
    await a.getByTestId("add-player").click();
    await a.getByTestId("player-1").fill("민준");
    await a.getByTestId("recorder-only").click();
    assert.equal(
      await a.getByTestId("player-0").inputValue(),
      "민준",
      "Recorder is removed from player roster",
    );
    await a.getByTestId("self-play").click();
    assert.equal(await a.getByTestId("player-0").inputValue(), "야모");
    await a.getByTestId("recorder-only").click();
    await a.getByTestId("add-player").click(); // Blank becomes temporary name.
    await a.getByRole("button", { name: "돌아가기", exact: true }).click();
    assert.equal(await a.getByTestId("setup-holes-9").isVisible(), true);
    await a.getByTestId("setup-players").click();
    assert.equal(await a.getByTestId("player-0").inputValue(), "민준");
    const footer = await a.getByTestId("review-create").boundingBox();
    assert.ok(footer && footer.y + footer.height < 844);
    await shot(a, "03-players");
    await a.getByTestId("review-create").click();
    await a.getByTestId("ad-unavailable").click();
    await a.getByTestId("round-code").waitFor();
    assert.match(
      (await a.getByTestId("round-my-role").textContent()) ?? "",
      /연결 없음/,
    );
    const home = await api(a, "/api/home"),
      round = home.active_round;
    const detail = await api(a, "/api/rounds/" + round.round_id);
    assert.equal(detail.players.length, 2);
    assert.equal(detail.round.hole_count, 9);
    assert.ok(detail.players.every((p: any) => p.user_id === null));
    assert.equal(detail.players[1].name, "플레이어 2");
    await b.getByTestId("join-round").click();
    await b.getByTestId("join-code").fill("NOT-A-ROUND");
    await b.getByTestId("lookup-round").click();
    await b.getByRole("alert").waitFor();
    assert.equal(await b.getByTestId("confirm-join").count(), 0);
    await b.getByTestId("join-code").fill(round.join_code);
    await b.getByTestId("lookup-round").click();
    await b.getByTestId("confirm-join").waitFor();
    await shot(b, "04-join");
    await b.getByTestId("confirm-join").click();
    await b.getByTestId("ad-unavailable").click();
    await b.getByTestId("round-code").waitFor();
    await shot(b, "05-room");
    const joined = await api(b, "/api/rounds/" + round.round_id);
    assert.equal(joined.participants.length, 2);
    assert.equal(joined.players.length, 2);
    assert.ok(
      joined.players.every((p: any) => p.user_id === null),
      "Matching nickname must not auto-link a player",
    );
    await b.getByTestId("prepare-targets").click();
    await b.getByTestId("unselect-" + detail.players[1].slot_id).click();
    await shot(b, "06-targets");
    await b.getByTestId("start-recording").click();
    await b.getByTestId("current-hole").waitFor();
    assert.equal(await b.locator('[data-testid^="score-row-"]').count(), 1);
    const mine = await api(
        b,
        "/api/rounds/" + round.round_id + "/input-targets",
      ),
      theirs = await api(a, "/api/rounds/" + round.round_id + "/input-targets");
    assert.equal(mine.slot_ids.length, 1);
    assert.equal(theirs.slot_ids.length, 2);
    await b.locator('[data-testid^="plus-"]').first().click();
    await b.getByTestId("save-hole").click();
    await b.getByTestId("score-notice").waitFor();
    await shot(b, "07-score");
    const scores = await api(b, "/api/rounds/" + round.round_id + "/scores");
    assert.equal(
      scores.scores.filter((s: any) => s.hole === 1 && s.strokes !== null)
        .length,
      1,
    );
    await b.goto(base + "/records");
    await b.getByTestId("empty-records").waitFor();
    await shot(b, "08-records");
    await a.goto(base + "/round-new?course_id=" + course.course_id);
    await a.getByTestId("setup-players").click();
    await a.setViewportSize({ width: 320, height: 640 });
    await shot(a, "players-320");
    assert.deepEqual(errors, []);
    console.log(
      "PASS round flow: staged setup/back, recorder-only roster, temporary name, 9-hole round, code lookup, participant vs player, private targets/save-and-score, exact score scope, 320px",
    );
  } finally {
    await browser.close();
  }
}
void main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
