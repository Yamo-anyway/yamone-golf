import { chromium, type BrowserContext, type Page } from "playwright";
import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
async function main() {
  const base = process.env.PREVIEW_URL ?? "http://localhost:4173";
  const browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const errors: string[] = [];
  async function context(locale = "ko-KR", width = 390) {
    const c = await browser.newContext({
      viewport: { width, height: 844 },
      locale,
    });
    c.on("page", (p) => p.on("pageerror", (e) => errors.push(e.message)));
    return c;
  }
  async function start(c: BrowserContext, name: string) {
    const page = await c.newPage();
    page.on("dialog", (d) => void d.accept());
    await page.goto(base);
    await page.getByTestId("nickname").fill(name);
    await page.getByTestId("start").click();
    await page.getByTestId("backup-done").click();
    const p = await page.evaluate(async () => (await fetch("/api/me")).json());
    return { page, profile: p.profile };
  }
  async function api(page: Page, path: string) {
    return page.evaluate(async (path) => (await fetch(path)).json(), path);
  }
  async function home(page: Page) {
    const homeTab = page.getByRole("tab", { name: "홈", exact: true });
    // Task screens use the back arrow; tabs remain on the top-level screens.
    for (let depth = 0; depth < 8 && !(await homeTab.isVisible()); depth++) {
      const previous = page.url();
      await page
        .getByRole("button", { name: "돌아가기", exact: true })
        .first()
        .click();
      await page.waitForURL((url) => url.href !== previous);
    }
    assert.ok(await homeTab.isVisible(), "back navigation reaches a main tab");
    await homeTab.click();
    await page.waitForURL(base + "/");
    await page.getByTestId("refresh-home").click();
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
    await page.screenshot({ path: "qa/stage-2/" + name + ".png" });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
  }
  await mkdir("qa/stage-2", { recursive: true });
  try {
    const a = await start(await context(), "생성자"),
      b = await start(await context(), "동반자"),
      c = await start(await context(), "코드참여");
    await a.page.getByTestId("courses").click();
    await a.page.getByTestId("new-course").click();
    await a.page.getByTestId("course-name").fill("야모 레이크");
    await a.page.getByTestId("course-region").fill("경기");
    await a.page.getByTestId("save-course").click();
    await a.page.getByTestId("course-done").click();
    await a.page.getByTestId("public-courses").click();
    const shared = await api(a.page, "/api/courses");
    const course = shared.courses.find((x: any) => x.name === "야모 레이크");
    assert.ok(course);
    await a.page.getByTestId("add-" + course.course_id).click();
    // A second public course allows persistent personal reorder and drag validation.
    await a.page.getByTestId("new-course").click();
    await a.page.getByTestId("course-name").fill("야모 힐");
    await a.page.getByTestId("save-course").click();
    await a.page.getByTestId("course-done").click();
    await a.page.getByTestId("public-courses").click();
    await a.page.getByRole("button", { name: "검색", exact: true }).click();
    const shared2 = await api(a.page, "/api/courses");
    const course2 = shared2.courses.find((x: any) => x.name === "야모 힐");
    await a.page.getByTestId("add-" + course2.course_id).click();
    await a.page
      .getByRole("button", { name: "내 골프장", exact: true })
      .first()
      .click();
    await Promise.all([
      a.page.waitForResponse(
        (r) =>
          r.url().endsWith("/api/me/courses") &&
          r.request().method() === "PATCH",
      ),
      a.page.getByTestId("up-" + course2.course_id).click(),
    ]);
    assert.equal(
      (await api(a.page, "/api/me/courses")).courses[0].course_id,
      course2.course_id,
    );
    assert.equal((await api(b.page, "/api/me/courses")).courses.length, 0);
    await a.page.reload();
    await a.page.getByTestId("up-" + course2.course_id).waitFor();
    assert.equal(
      await a.page
        .getByTestId("up-" + course2.course_id)
        .getAttribute("aria-disabled"),
      "true",
    );
    await snapshot(a.page, "01-my-courses");
    // Drag the first row down, using the measured row height; up/down remain accessible alternatives.
    const handle = a.page.getByLabel("끌어서 순서 변경 야모 힐", {
      exact: true,
    });
    await handle.scrollIntoViewIfNeeded();
    const box = await handle.boundingBox();
    assert.ok(box);
    const draggedResponse = a.page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/me/courses") && r.request().method() === "PATCH",
    );
    await a.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await a.page.mouse.down();
    await a.page.mouse.move(
      box.x + box.width / 2,
      box.y + box.height / 2 + 310,
      { steps: 12 },
    );
    await a.page.mouse.up();
    await draggedResponse;
    assert.equal(
      (await api(a.page, "/api/me/courses")).courses[0].course_id,
      course.course_id,
    );

    await a.page
      .getByRole("button", { name: "공용 정보 수정", exact: true })
      .first()
      .click();
    await a.page.getByTestId("course-name").fill("저장 전 초안");
    await b.page.evaluate(async (c) => {
      const r = await fetch("/api/courses/" + c.course_id, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...c, region: "강원" }),
      });
      if (!r.ok) throw new Error("Concurrent course edit failed");
    }, course);
    await a.page.getByTestId("save-course").click();
    await a.page
      .getByRole("button", { name: "최신 정보 불러오기", exact: true })
      .waitFor();
    assert.equal(
      await a.page.getByTestId("course-name").inputValue(),
      "저장 전 초안",
    );
    await a.page
      .getByRole("button", { name: "최신 정보 불러오기", exact: true })
      .click();
    await a.page.waitForFunction(
      () =>
        document.querySelector<HTMLInputElement>('[data-testid="course-name"]')
          ?.value === "야모 레이크",
    );
    await home(a.page);
    await a.page.getByTestId("new-round").click();
    await a.page.getByTestId("choose-" + course.course_id).click();
    await a.page.getByTestId("add-player").click();
    await a.page.getByTestId("player-1").fill("동반자");
    await a.page.getByTestId("review-create").click();
    await a.page.getByTestId("ad-unavailable").waitFor();
    await snapshot(a.page, "02-round-review");
    // Closing while the ad test is displayed must not execute or settle an action.
    await a.page.reload();
    await a.page.getByTestId("ad-unavailable").waitFor();
    assert.equal((await api(a.page, "/api/home")).active_round, null);
    let lost = false,
      roundId = "";
    await a.page.route("**/api/round-actions/*/execute", async (route) => {
      if (lost) {
        await route.continue();
        return;
      }
      lost = true;
      const response = await route.fetch();
      roundId = (await response.json()).round.round_id;
      await route.abort("connectionreset");
    });
    await a.page.getByTestId("ad-unavailable").click();
    await a.page
      .getByText(
        "서버에 연결하지 못했습니다. 입력한 내용은 그대로 두고 다시 시도하세요.",
        { exact: true },
      )
      .waitFor();
    await a.page.reload();
    await a.page.getByTestId("execute-round").click();
    await a.page.getByTestId("round-code").waitFor();
    assert.equal(
      (await api(a.page, "/api/home")).active_round.round_id,
      roundId,
    );
    const code = (await a.page.getByTestId("round-code").textContent())!;
    await a.page.getByTestId("invite-code").fill(b.profile.personal_code);
    await a.page.getByTestId("send-invite").click();
    await a.page.getByText("초대를 보냈습니다.", { exact: true }).waitFor();
    await b.page.getByTestId("refresh-home").click();
    let invitations = (await api(b.page, "/api/home")).invitations;
    await b.page.getByTestId("decline-" + invitations[0].invitation_id).click();
    await b.page
      .getByTestId("decline-" + invitations[0].invitation_id)
      .waitFor({ state: "detached" });
    assert.equal((await api(b.page, "/api/home")).active_round, null);
    assert.equal(
      await b.page.getByTestId("new-round").getAttribute("aria-disabled"),
      null,
    );
    // Send a fresh invitation; a declined invite does not come back by itself.
    await a.page.getByTestId("invite-code").fill("");
    await a.page.getByTestId("invite-code").fill(b.profile.personal_code);
    await a.page.getByTestId("send-invite").click();
    await a.page.getByText("초대를 보냈습니다.", { exact: true }).waitFor();
    await b.page.getByTestId("refresh-home").click();
    invitations = (await api(b.page, "/api/home")).invitations;
    await b.page.getByTestId("accept-" + invitations[0].invitation_id).click();
    await b.page.getByTestId("ad-complete").click();
    await b.page.getByTestId("round-code").waitFor();
    assert.equal(
      (await api(b.page, "/api/home")).active_round.round_id,
      roundId,
    );
    await c.page.getByTestId("join-round").click();
    await c.page.getByTestId("join-code").fill(code);
    await c.page.getByTestId("lookup-round").click();
    await c.page.getByTestId("confirm-join").click();
    await c.page.getByTestId("ad-unavailable").click();
    await c.page.getByTestId("round-code").waitFor();
    await a.page.getByTestId("refresh-round").click();
    await a.page.getByText("참여 사용자 · 3", { exact: true }).waitFor();
    await snapshot(a.page, "03-shared-round");
    const detail = await api(a.page, "/api/rounds/" + roundId);
    assert.equal(detail.participants.length, 3);
    assert.equal(detail.players.length, 2);
    await home(b.page);
    await b.page.getByTestId("open-round").waitFor();
    assert.equal(await b.page.getByTestId("new-round").count(), 0);
    const en = await start(await context("ja-JP", 320), "English");
    await en.page.getByTestId("courses").click();
    await en.page.getByTestId("public-courses").click();
    await en.page.getByText("야모 레이크", { exact: true }).waitFor();
    await snapshot(en.page, "04-course-search-english-320");
    assert.deepEqual(errors, []);
    console.log(
      "UI PASS: shared course create/search, private order/reload/drag, 18-hole repeated nine, interrupted ad, lost execute response/retry without a second ad, decline/reinvite/accept, code join, three-user round, English 320px.",
    );
  } finally {
    await browser.close();
  }
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
