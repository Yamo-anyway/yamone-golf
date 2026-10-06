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
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    locale: "ko-KR",
  });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  async function api(path: string, value?: unknown, method?: string) {
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
        if (!r.ok) throw Error(JSON.stringify(data));
        return data;
      },
      { path, value, method },
    );
  }
  async function shot(name: string) {
    await page.screenshot({ path: "qa/mobile-redesign/" + name + ".png" });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
  }
  await mkdir("qa/mobile-redesign", { recursive: true });
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
    await page.reload();
    await page.getByTestId("open-round").waitFor();
    await shot("01-home");
    await page.getByTestId("open-round").click();
    await page.getByTestId("enter-scores").waitFor();
    await shot("02-round");
    await page.getByTestId("enter-scores").click();
    await page.getByTestId("current-hole").waitFor();
    assert.equal(await page.getByTestId("bottom-navigation").count(), 0);
    assert.equal(await page.locator('[data-testid^="score-row-"]').count(), 8);
    const save = page.getByTestId("save-hole"),
      before = await save.boundingBox();
    assert.ok(before);
    await page.getByTestId("score-player-scroll").evaluate((e) => {
      e.scrollTop = e.scrollHeight;
    });
    const after = await save.boundingBox();
    assert.equal(before.y, after?.y, "Save must stay fixed for all8players");
    await page.getByTestId("score-player-scroll").evaluate((e) => {
      e.scrollTop = 0;
    });
    const firstPlus = page.locator('[data-testid^="plus-"]').first();
    await firstPlus.click();
    await page.getByTestId("hole-2").click();
    await page.getByTestId("keep-score-editing").click();
    assert.equal(
      await page.locator('[data-testid^="score-value-"]').first().textContent(),
      "5",
    );
    await shot("03-score-entry");
    await save.click();
    await page.getByTestId("score-notice").waitFor();
    const saved = await api("/api/rounds/" + round.round_id + "/scores");
    assert.equal(
      saved.scores.filter(
        (s: { hole: number; strokes: number | null }) =>
          s.hole === 1 && s.strokes !== null,
      ).length,
      8,
    );
    for (const width of [320, 430]) {
      await page.setViewportSize({ width, height: 740 });
      await shot("score-" + width);
      const b = await save.boundingBox();
      assert.ok(
        b && b.x >= 0 && b.x + b.width <= width && b.y + b.height < 740,
      );
    }
    await page.setViewportSize({ width: 740, height: 360 });
    await shot("score-landscape");
    const b = await save.boundingBox();
    assert.ok(b && b.y + b.height < 360);
    assert.ok(
      (await page.getByTestId("score-player-scroll").boundingBox())!.height >
        80,
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByTestId("open-scorecard").click();
    await page.getByTestId("card-half-0").waitFor();
    await shot("04-scorecard");
    await page.goto(base + "/courses");
    await page.getByTestId("public-courses").click();
    await page.getByTestId("add-" + course.course_id).waitFor();
    await shot("05-courses");
    await page.goto(base + "/profile");
    await page.getByTestId("personal-code").waitFor();
    await shot("06-profile");
    assert.deepEqual(errors, []);
    console.log(
      "PASS redesign:8players, fixed save, dirty hole guard, atomic save,320/390/430px,landscape,scorecard,courses,profile",
    );
  } finally {
    await browser.close();
  }
}
void main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
