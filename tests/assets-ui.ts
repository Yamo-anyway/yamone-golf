import { chromium } from "playwright";
import ko from "../src/ui/locales/ko";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { mkdir } from "node:fs/promises";
const base = process.env.PREVIEW_URL ?? "http://localhost:4173";
async function main() {
  execFileSync(process.execPath, ["design/build-gallery.mjs"], {
    stdio: "inherit",
  });
  const browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const page = await browser.newPage({
    viewport: { width: 1600, height: 1200 },
    locale: "ko-KR",
  });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await mkdir("qa/assets", { recursive: true });
  try {
    await page.goto(
      pathToFileURL(resolve(".tmp/asset-gallery/design/index.html")).href,
    );
    await page.getByTestId("kit-normal").waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: "design/asset-kit.png", fullPage: true });
    assert.equal(await page.getByTestId("kit-disabled").isDisabled(), true);
    assert.equal(await page.getByTestId("kit-busy").isDisabled(), true);
    assert.equal(
      await page.getByTestId("kit-busy").getAttribute("aria-busy"),
      "true",
    );
    const normal = page.getByTestId("kit-normal");
    const bg = await normal.evaluate(
      (e) => getComputedStyle(e).backgroundColor,
    );
    await normal.hover();
    await page.mouse.down();
    await page.waitForFunction(
      (original) =>
        getComputedStyle(document.querySelector('[data-testid="kit-normal"]')!)
          .backgroundColor !== original,
      bg,
    );
    assert.notEqual(
      await normal.evaluate((e) => getComputedStyle(e).backgroundColor),
      bg,
    );
    await page.screenshot({ path: "qa/assets/pressed.png" });
    await page.mouse.up();
    await page.getByTestId("kit-plus").focus();
    await page.keyboard.press("Enter");
    assert.equal(await page.getByTestId("kit-count").textContent(), "5");
    await page.getByTestId("kit-minus").click();
    assert.equal(await page.getByTestId("kit-count").textContent(), "4");
    await page
      .getByRole("checkbox", { name: "선택 완료", exact: true })
      .click();
    assert.equal(
      await page
        .getByRole("checkbox", { name: "선택 완료", exact: true })
        .getAttribute("aria-checked"),
      "false",
    );
    await page.getByRole("radio", { name: "후반", exact: true }).click();
    assert.equal(
      await page
        .getByRole("radio", { name: "전반", exact: true })
        .getAttribute("aria-checked"),
      "false",
    );
    assert.equal(
      await page
        .getByRole("radio", { name: "후반", exact: true })
        .getAttribute("aria-checked"),
      "true",
    );
    await page.getByRole("button", { name: "18홀", exact: true }).click();
    assert.equal(
      await page
        .getByRole("button", { name: "18홀", exact: true })
        .getAttribute("aria-pressed"),
      "true",
    );
    const search = page.getByTestId("kit-search");
    const border = await search.evaluate(
      (e) => getComputedStyle(e).borderColor,
    );
    await search.focus();
    assert.notEqual(
      await search.evaluate((e) => getComputedStyle(e).borderColor),
      border,
    );
    await search.fill("야모 골프");
    assert.equal(await search.inputValue(), "야모 골프");
    await page.getByRole("button", { name: "QR 코드", exact: true }).focus();
    assert.equal(
      await page
        .getByRole("button", { name: "QR 코드", exact: true })
        .evaluate((e) => getComputedStyle(e).outlineWidth),
      "2px",
    );
    for (const width of [320, 390, 1600]) {
      await page.setViewportSize({ width, height: 844 });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
        `kit overflow ${width}`,
      );
      for (const id of ["kit-normal", "kit-plus", "kit-minus"]) {
        const box = (await page.getByTestId(id).boundingBox())!;
        assert.ok(box.width >= 48 && box.height >= 48);
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(base);
    await page.getByTestId("nickname").waitFor();
    await page.screenshot({ path: "qa/assets/welcome-ko.png" });
    await page.getByTestId("nickname").fill("에셋 확인");
    await page.getByTestId("start").click();
    await page.getByTestId("backup-done").click();
    await page.goto(base + "/courses");
    // The native SVG illustrations must mount in real screens, not only the catalogue.
    await page.getByTestId("new-course").waitFor();
    await page.getByText(ko.noCourses, { exact: true }).waitFor();
    await page.screenshot({ path: "qa/assets/courses-ko.png" });
    await page.goto(base + "/records");
    await page.getByTestId("empty-records").waitFor();
    assert.ok(
      (await page.getByTestId("empty-records").locator("svg").count()) > 0,
    );
    await page.getByTestId("filter-nine").click();
    assert.equal(
      await page.getByTestId("filter-nine").getAttribute("aria-pressed"),
      "true",
    );
    await page.getByTestId("search-records").click();
    await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
    await page.screenshot({ path: "qa/assets/records-ko.png", fullPage: true });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS assets UI: button pressed/disabled/busy/focus, keyboard stepper, choice/radio/chips, field focus, 48px targets, 320/390/1600px, welcome and record states",
    );
  } finally {
    await browser.close();
  }
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
