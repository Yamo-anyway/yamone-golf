import { chromium, type Page } from "playwright";
import ko from "../src/ui/locales/ko";
import en from "../src/ui/locales/en";
import { galleryText, type GalleryCopyKey } from "../design/gallery-copy";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { mkdir } from "node:fs/promises";
const base = process.env.PREVIEW_URL ?? "http://localhost:4173";
type Language = "ko" | "en";
async function noOverflow(page: Page) {
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
}
async function noKorean(page: Page) {
  assert.doesNotMatch(await page.locator("body").innerText(), /[가-힣]/);
}
async function kit(page: Page, language: Language) {
  const t = (key: GalleryCopyKey) => galleryText(language, key);
  await page.goto(
    pathToFileURL(resolve(`.tmp/asset-gallery/design/index-${language}.html`))
      .href,
  );
  await page.getByTestId("kit-normal").waitFor();
  await page.evaluate(() => document.fonts.ready);
  if (language === "en") await noKorean(page);
  await page.screenshot({
    path:
      language === "ko" ? "design/asset-kit.png" : "design/asset-kit-en.png",
    fullPage: true,
  });
  assert.equal(await page.getByTestId("kit-disabled").isDisabled(), true);
  assert.equal(await page.getByTestId("kit-busy").isDisabled(), true);
  assert.equal(
    await page.getByTestId("kit-busy").getAttribute("aria-busy"),
    "true",
  );
  const normal = page.getByTestId("kit-normal");
  const bg = await normal.evaluate((e) => getComputedStyle(e).backgroundColor);
  await normal.hover();
  await page.mouse.down();
  await page.waitForFunction(
    (original) =>
      getComputedStyle(document.querySelector('[data-testid="kit-normal"]')!)
        .backgroundColor !== original,
    bg,
  );
  await page.mouse.up();
  await page.getByTestId("kit-plus").focus();
  await page.keyboard.press("Enter");
  assert.equal(await page.getByTestId("kit-count").textContent(), "5");
  await page.getByTestId("kit-minus").click();
  assert.equal(await page.getByTestId("kit-count").textContent(), "4");
  await page
    .getByRole("checkbox", { name: t("선택 완료"), exact: true })
    .click();
  assert.equal(
    await page
      .getByRole("checkbox", { name: t("선택 완료"), exact: true })
      .getAttribute("aria-checked"),
    "false",
  );
  await page.getByRole("radio", { name: t("후반"), exact: true }).click();
  assert.equal(
    await page
      .getByRole("radio", { name: t("전반"), exact: true })
      .getAttribute("aria-checked"),
    "false",
  );
  assert.equal(
    await page
      .getByRole("radio", { name: t("후반"), exact: true })
      .getAttribute("aria-checked"),
    "true",
  );
  await page.getByRole("button", { name: t("18홀"), exact: true }).click();
  assert.equal(
    await page
      .getByRole("button", { name: t("18홀"), exact: true })
      .getAttribute("aria-pressed"),
    "true",
  );
  const search = page.getByTestId("kit-search");
  const border = await search.evaluate((e) => getComputedStyle(e).borderColor);
  await search.focus();
  await page.waitForFunction(
    (original) =>
      getComputedStyle(document.querySelector('[data-testid="kit-search"]')!)
        .borderColor !== original,
    border,
  );
  await search.fill(language === "ko" ? "야모 골프" : "Yamone Golf");
  await page.getByRole("button", { name: t("QR 코드"), exact: true }).focus();
  assert.equal(
    await page
      .getByRole("button", { name: t("QR 코드"), exact: true })
      .evaluate((e) => getComputedStyle(e).outlineWidth),
    "2px",
  );
  for (const width of [320, 390, 1600]) {
    await page.setViewportSize({ width, height: 844 });
    await noOverflow(page);
    assert.deepEqual(
      await page
        .getByRole("button")
        .evaluateAll((nodes) =>
          nodes
            .filter((e) => e.scrollWidth > e.clientWidth + 1)
            .map((e) => e.textContent),
        ),
      [],
      `Clipped labels in ${language} at ${width}px`,
    );
    for (const id of ["kit-normal", "kit-plus", "kit-minus"]) {
      const box = (await page.getByTestId(id).boundingBox())!;
      assert.ok(box.width >= 48 && box.height >= 48);
    }
  }
}
async function api(page: Page, path: string, value?: unknown, method?: string) {
  return page.evaluate(
    async ({ path, value, method }) => {
      const response = await fetch(path, {
        method: method ?? (value === undefined ? "GET" : "POST"),
        headers:
          value === undefined
            ? undefined
            : { "Content-Type": "application/json" },
        body: value === undefined ? undefined : JSON.stringify(value),
      });
      const result = await response.json();
      if (!response.ok) throw Error(JSON.stringify(result));
      return result;
    },
    { path, value, method },
  );
}
async function app(page: Page, language: Language) {
  const t = language === "ko" ? ko : en;
  await page.goto(base);
  await page.getByTestId("nickname").waitFor();
  assert.equal(
    await page.getByTestId("start").getAttribute("aria-label"),
    t.start,
  );
  if (language === "en") await noKorean(page);
  await page.screenshot({ path: `qa/assets/welcome-${language}.png` });
  await page.getByTestId("nickname").fill(language === "ko" ? "야모" : "Yamo");
  await page.getByTestId("start").click();
  await page.getByTestId("backup-done").click();
  await page.goto(base + "/courses");
  await page.getByText(t.noCourses, { exact: true }).waitFor();
  if (language === "en") await noKorean(page);
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await noOverflow(page);
  }
  await page.screenshot({ path: `qa/assets/courses-${language}.png` });
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
  await page.getByText(t.noMatchingRecords, { exact: true }).waitFor();
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
  if (language === "en") await noKorean(page);
  await noOverflow(page);
  await page.screenshot({
    path: `qa/assets/records-${language}.png`,
    fullPage: true,
  });
  if (language === "ko") {
    // User-selected language takes priority over the device and survives reload.
    await page.goto(base + "/profile");
    await page.getByRole("radio", { name: "English", exact: true }).click();
    await page.getByText(en.languageHint, { exact: true }).waitFor();
    await page.reload();
    await page.getByText(en.languageHint, { exact: true }).waitFor();
    assert.equal((await api(page, "/api/me")).profile.language, "en");
    await page.getByRole("radio", { name: "한국어", exact: true }).click();
    await page.getByText(ko.languageHint, { exact: true }).waitFor();
    await page.getByRole("radio", { name: ko.system, exact: true }).click();
    assert.equal((await api(page, "/api/me")).profile.language, "system");
  }
  const course = (
    await api(page, "/api/courses", {
      course_id: randomUUID(),
      name:
        language === "ko" ? "야모 레이크 골프클럽" : "Yamone Lake Golf Club",
      region: language === "ko" ? "경기도" : "Gyeonggi",
      segments: [
        { name: "LAKE", pars: [4, 4, 3, 5, 4, 4, 3, 5, 4] },
        { name: "HILL", pars: [4, 5, 3, 4, 4, 5, 3, 4, 4] },
      ],
    })
  ).course;
  const action = await api(page, "/api/round-actions", {
    action_id: randomUUID(),
    kind: "create",
    course_id: course.course_id,
    course_version: course.version,
    segment_indices: [0, 1],
    players: (language === "ko"
      ? ["야모", "민수", "서연", "준호"]
      : ["Yamo", "Alex", "Jamie", "Sam"]
    ).map((name, i) => ({ name, self: i === 0 })),
  });
  await api(page, "/api/round-actions/" + action.action_id + "/ad", {
    outcome: "unavailable",
  });
  const round = (
    await api(page, "/api/round-actions/" + action.action_id + "/execute", {})
  ).round;
  await page.goto(base + "/scores?id=" + round.round_id);
  await page
    .getByTestId("current-hole")
    .filter({ hasText: language === "ko" ? "1번홀" : "Hole 1" })
    .waitFor();
  await page.locator('[data-testid^="plus-"]').first().click();
  assert.equal(
    await page.getByTestId("save-hole").getAttribute("aria-label"),
    t.saveHole,
  );
  if (language === "en") await noKorean(page);
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await noOverflow(page);
    const save = (await page.getByTestId("save-hole").boundingBox())!;
    assert.ok(
      save.x >= 0 &&
        save.x + save.width <= width &&
        save.y + save.height <= 844,
    );
  }
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
  await page.screenshot({ path: `qa/assets/scores-${language}.png` });
  await page.getByTestId("save-hole").click();
  await page.waitForURL(base + "/scorecard?id=" + round.round_id);
  await page.getByTestId("card-half-0").waitFor();
  if (language === "en") await noKorean(page);
}
async function main() {
  execFileSync(process.execPath, ["design/build-gallery.mjs"], {
    stdio: "inherit",
  });
  const browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const errors: string[] = [];
  await mkdir("qa/assets", { recursive: true });
  try {
    for (const language of ["ko", "en"] as const) {
      const page = await browser.newPage({
        viewport: { width: 1600, height: 1200 },
        locale: language === "ko" ? "ko-KR" : "en-US",
      });
      page.on("pageerror", (e) => errors.push(e.message));
      await kit(page, language);
      await page.setViewportSize({ width: 390, height: 844 });
      await app(page, language);
      await page.close();
      console.log(
        `PASS ${language} assets: localized kit, button states/keyboard/choices, no clipping at 320/390/1600px, app welcome/course/records/scores/card`,
      );
    }
    assert.deepEqual(errors, []);
    console.log(
      "PASS Korean/English automatic locale, saved language override/reload, translated empty states/actions and language-neutral vectors",
    );
  } finally {
    await browser.close();
  }
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
