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
  async function snapshot(page: Page, path: string) {
    // Optional QA-only font for Linux containers without Korean system fonts.
    if (process.env.QA_KOREAN_FONT) {
      const font = (await readFile(process.env.QA_KOREAN_FONT)).toString(
        "base64",
      );
      await page.addStyleTag({
        content: `@font-face{font-family:QAKorean;src:url(data:font/woff2;base64,${font}) format('woff2')}body,body *{font-family:QAKorean,sans-serif!important}`,
      });
      await page.evaluate(() => document.fonts.ready);
    }
    await page.screenshot({ path });
  }
  async function context(locale: string, width = 390) {
    const c = await browser.newContext({
      viewport: { width, height: 844 },
      locale,
    });
    c.on("page", (p) => p.on("pageerror", (e) => errors.push(e.message)));
    return c;
  }
  async function me(page: Page) {
    return page.evaluate(async () => (await fetch("/api/me")).json());
  }
  async function start(c: BrowserContext, name: string) {
    const page = await c.newPage();
    await page.goto(base);
    await page.getByTestId("nickname").fill(name);
    await page.getByTestId("start").click();
    await page.getByTestId("backup-key").waitFor();
    const key = (await page.getByTestId("backup-key").textContent())!;
    const identity = await me(page);
    await page.getByTestId("backup-done").click();
    return { page, key, profile: identity.profile };
  }
  await mkdir("qa/stage-1", { recursive: true });
  try {
    const first = await context("ko-KR");
    const welcome = await first.newPage();
    await welcome.goto(base);
    await welcome.getByTestId("nickname").waitFor();
    await snapshot(welcome, "qa/stage-1/01-welcome-ko.png");
    await welcome.close();
    const a = await start(first, "야모");
    await a.page.reload();
    await a.page.getByTestId("personal-code").waitFor();
    assert.equal((await me(a.page)).profile.user_id, a.profile.user_id);
    assert.equal(
      await a.page.evaluate(() =>
        sessionStorage.getItem("yamone.golf.cf.pending.v1"),
      ),
      null,
    );
    const cookies = await first.cookies();
    assert.ok(cookies.some((c) => c.name === "ymg_device_v3" && c.httpOnly));
    await a.page.getByRole("tab", { name: "내 정보", exact: true }).click();
    await a.page.getByTestId("edit-profile").click();
    await a.page.getByTestId("edit-nickname").fill("변경한 야모");
    await a.page.getByTestId("save-nickname").click();
    await a.page.getByTestId("edit-profile").waitFor();
    assert.equal((await me(a.page)).profile.user_id, a.profile.user_id);
    assert.equal((await me(a.page)).profile.nickname, "변경한 야모");
    await a.page
      .getByRole("button", { name: "내 QR 보기", exact: true })
      .click();
    await snapshot(a.page, "qa/stage-1/02-profile-ko.png");

    const duplicate = await context("ko-KR");
    const b = await start(duplicate, "변경한 야모");
    assert.notEqual(a.profile.user_id, b.profile.user_id);
    const newer = await context("ko-KR");
    const recovered = await newer.newPage();
    await recovered.goto(base);
    await recovered
      .getByRole("button", { name: "기존 기록 가져오기", exact: true })
      .click();
    await recovered.getByTestId("recovery-key").fill(a.key);
    await recovered.getByTestId("recover").click();
    await recovered.getByTestId("backup-key").waitFor();
    assert.equal((await me(recovered)).profile.user_id, a.profile.user_id);
    assert.notEqual(
      await recovered.getByTestId("backup-key").textContent(),
      a.key,
    );
    await a.page.reload();
    await a.page
      .getByText("다른 기기로 이전되었습니다", { exact: true })
      .waitFor();
    await snapshot(a.page, "qa/stage-1/03-old-device-blocked.png");

    const retryContext = await context("ko-KR");
    const retry = await retryContext.newPage();
    let interrupted = false;
    let committedId = "";
    await retry.route("**/api/users", async (route) => {
      if (interrupted) {
        await route.continue();
        return;
      }
      interrupted = true;
      const response = await route.fetch();
      committedId = (await response.json()).profile.user_id;
      await route.abort("connectionreset");
    });
    await retry.goto(base);
    await retry.getByTestId("nickname").fill("재시도");
    await retry.getByTestId("start").click();
    await retry.getByTestId("resume").waitFor();
    await retry.reload();
    await retry.getByTestId("resume").click();
    await retry.getByTestId("backup-key").waitFor();
    assert.equal((await me(retry)).profile.user_id, committedId);

    const english = await context("ja-JP", 320);
    const en = await english.newPage();
    await en.goto(base);
    await en
      .getByRole("button", { name: "Get started", exact: true })
      .waitFor();
    await en.screenshot({ path: "qa/stage-1/04-english-fallback-320.png" });
    assert.equal(
      await en.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      ),
      false,
    );
    assert.deepEqual(errors, []);
    console.log(
      "UI PASS: nickname start, cookie/reload, profile update, duplicate names, recovery/device revocation, lost-response retry, Korean + Japanese→English 320px.",
    );
  } finally {
    await browser.close();
  }
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
