import { chromium, type BrowserContext, type Page } from "playwright";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";

async function main() {
  const base = process.env.PREVIEW_URL ?? "http://localhost:4173";
  const browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const errors: string[] = [];
  async function context() {
    const value = await browser.newContext({
      viewport: { width: 390, height: 844 },
      locale: "ko-KR",
    });
    value.on("page", (page) =>
      page.on("pageerror", (error) => errors.push(error.message)),
    );
    return value;
  }
  async function profile(page: Page) {
    return page.evaluate(async () => (await fetch("/api/me")).json());
  }
  async function register(value: BrowserContext) {
    const page = await value.newPage();
    await page.goto(base);
    await page.getByTestId("nickname").fill("이메일 야모");
    await page.getByTestId("start").click();
    await page.getByTestId("backup-key").waitFor();
    const user = (await profile(page)).profile;
    await page.getByTestId("backup-done").click();
    return { page, user };
  }
  await mkdir("qa/stage-11", { recursive: true });
  try {
    const originalContext = await context();
    const original = await register(originalContext);
    await original.page.getByRole("tab", { name: "내 정보" }).click();
    await original.page.getByTestId("profile-recovery-email").waitFor();
    await original.page
      .getByTestId("profile-recovery-email")
      .fill("player@example.com");
    await original.page.getByTestId("send-email-verification").click();
    await original.page.getByTestId("verify-email-code").waitFor();
    assert.match(
      await original.page.getByTestId("verify-email-code").inputValue(),
      /^[A-Z2-9]{12}$/,
    );
    await original.page.getByTestId("verify-recovery-email").click();
    await original.page.getByTestId("recovery-email-hint").waitFor();
    assert.equal(
      await original.page.getByTestId("recovery-email-hint").textContent(),
      "p***@example.com",
    );
    await original.page.screenshot({
      path: "qa/stage-11/01-verified-recovery-email.png",
      fullPage: true,
    });

    const replacementContext = await context();
    const replacement = await replacementContext.newPage();
    let recoveryRequest = "";
    let recoveryCode = "";
    replacement.on("request", (request) => {
      if (request.url().endsWith("/api/email-recovery/requests"))
        recoveryRequest = request.postDataJSON().request_id;
    });
    replacement.on("response", async (response) => {
      if (response.url().endsWith("/api/email-recovery/requests"))
        recoveryCode = (await response.json()).test_code;
    });
    await replacement.goto(base);
    await replacement
      .getByRole("button", { name: "이메일로 기록 복구" })
      .click();
    await replacement
      .getByTestId("recovery-email")
      .fill("player@example.com");
    await replacement.getByTestId("send-email-recovery").click();
    await replacement.getByTestId("email-recovery-code").waitFor();
    assert.ok(recoveryRequest && recoveryCode);

    await replacement.goto(
      `${base}/email-recovery?kind=recover&request_id=${encodeURIComponent(recoveryRequest)}&code=${encodeURIComponent(recoveryCode)}`,
    );
    await replacement
      .getByText("이 기기로 기존 기록을 가져올까요?", { exact: false })
      .waitFor();
    await replacement.getByRole("button", { name: "가져오기" }).click();
    await replacement
      .getByText("기존 기록을 이 기기로 가져왔습니다.")
      .waitFor();
    await replacement.screenshot({
      path: "qa/stage-11/02-email-deep-link-recovered.png",
      fullPage: true,
    });
    await replacement
      .getByRole("button", { name: "홈으로" })
      .click();
    await replacement.getByTestId("backup-key").waitFor();
    assert.equal((await profile(replacement)).profile.user_id, original.user.user_id);

    await original.page.reload();
    await original.page
      .getByText("다른 기기로 이전되었습니다", { exact: true })
      .waitFor();
    assert.deepEqual(errors, []);
    console.log(
      "UI PASS: verified recovery email, masked display, recovery code, deep link confirmation, replacement key and old-device revocation.",
    );
  } finally {
    await browser.close();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
