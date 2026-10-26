import { chromium, type Page } from "playwright";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import ko from "../src/ui/locales/ko";
import en from "../src/ui/locales/en";
const base = process.env.PREVIEW_URL ?? "http://localhost:4173";
const token = process.env.UI_COURSE_ADMIN_TOKEN;
async function main() {
  assert.ok(
    token,
    "Run with npm run test:ui so the isolated admin token is provided",
  );
  const browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const errors: string[] = [];
  let activePage: Page;
  let englishPage: Page | undefined;
  const admin = await browser.newPage({
    viewport: { width: 1360, height: 1000 },
  });
  activePage = admin;
  admin.on("pageerror", (e) => errors.push(e.message));
  async function adminAPI(path: string, method = "GET", value?: unknown) {
    const r = await admin.request.fetch(base + path, {
      method,
      headers: { Authorization: "Bearer " + token, Origin: base },
      ...(value === undefined ? {} : { data: value }),
    });
    const data = await r.json();
    assert.ok(r.ok(), JSON.stringify(data));
    return data;
  }
  async function overflow(page: Page) {
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
  }
  const added = [];
  await mkdir("qa/course-data", { recursive: true });
  try {
    for (const [cc, name, translated, city] of [
      ["KR", "Seoul Test Club", "서울 테스트 골프장", "Seoul"],
      ["KR", "seoul test club", "서울 테스트 골프장 별관", "Seoul"],
      ["PH", "Manila Test Club", "마닐라 테스트 골프장", "Manila"],
    ]) {
      added.push(
        (
          await adminAPI("/admin/api/courses", "POST", {
            name,
            country_code: cc,
            city,
            segments: [{ name: "OUT", pars: [3, 4, 5, 6, 7, 4, 4, 4, 4] }],
            localization: {
              name: { ko: translated, en: name, local: "" },
              address: { ko: "", en: "", local: "" },
            },
          })
        ).course,
      );
    }
    const [kr, , ph] = added;
    for (const language of ["ko", "en"] as const) {
      const t = language === "ko" ? ko : en;
      const page = await browser.newPage({
        viewport: { width: 390, height: 844 },
        locale: language === "ko" ? "ko-KR" : "en-US",
      });
      activePage = page;
      page.on("pageerror", (e) => errors.push(e.message));
      const regions: string[] = [];
      page.on("request", (r) => {
        if (r.url().includes("/api/courses"))
          regions.push(r.headers()["x-device-region"]);
      });
      await page.goto(base);
      await page
        .getByTestId("nickname")
        .fill(language === "ko" ? "야모" : "Yamo");
      await page.getByTestId("start").click();
      await page.getByTestId("backup-done").click();
      await page.goto(base + "/courses");
      await page.getByTestId("public-courses").click();
      await page.getByTestId("add-" + ph.course_id).waitFor();
      await page.getByTestId("course-country-filter").click();
      await page.getByTestId("country-search").fill("PH");
      await page.getByTestId("country-option-PH").click();
      await Promise.all([
        page.waitForResponse(
          (r) =>
            r.url().includes("/api/courses?") && r.url().includes("country=PH"),
        ),
        page.getByRole("button", { name: t.search, exact: true }).click(),
      ]);
      await page.getByTestId("add-" + ph.course_id).waitFor();
      await page
        .getByTestId("add-" + kr.course_id)
        .waitFor({ state: "hidden" });
      assert.equal(await page.getByTestId("add-" + kr.course_id).count(), 0);
      const shown =
        language === "ko"
          ? "마닐라 테스트 골프장(Manila Test Club)"
          : "Manila Test Club";
      await page.getByText(shown, { exact: true }).waitFor();
      for (const width of [320, 390]) {
        await page.setViewportSize({ width, height: 844 });
        await overflow(page);
      }
      await page.screenshot({ path: `qa/course-data/search-${language}.png` });
      await page.getByTestId("new-course").click();
      await page.getByTestId("course-name").waitFor();
      assert.equal(
        await page.getByTestId("course-country").getAttribute("aria-label"),
        language === "ko" ? "한국" : "United States",
      );
      await page.getByTestId("course-country").click();
      await page.setViewportSize({ width: 320, height: 844 });
      await page.getByTestId("country-search").fill("KH");
      await page.getByTestId("country-option-KH").waitFor();
      await overflow(page);
      await page.screenshot({ path: `qa/course-data/country-${language}.png` });
      await page.getByTestId("country-option-KH").click();
      await page
        .getByTestId("course-name")
        .fill(
          language === "ko" ? "프놈펜 개인 골프장" : "Phnom Penh User Club",
        );
      await page.getByTestId("course-region").fill("Phnom Penh");
      await page.getByTestId("save-course").click();
      await page.getByTestId("course-done").waitFor();
      await page.getByTestId("course-done").click();
      const kh = await page.evaluate(async () =>
        (await fetch("/api/courses?country=KH")).json(),
      );
      assert.ok(
        kh.courses.some(
          (c: { country_code: string }) => c.country_code === "KH",
        ),
      );
      assert.ok(regions.includes(language === "ko" ? "KR" : "US"));
      if (language === "en") englishPage = page;
      else await page.close();
    }
    activePage = admin;
    await admin.goto(base + "/admin");
    await admin.locator("#admin-token").fill(token);
    await admin.locator("#admin-login").click();
    await admin.waitForFunction(
      () =>
        document.querySelector("#login-modal")?.getAttribute("aria-hidden") ===
        "true",
    );
    await admin.locator("#dashboard-view").waitFor({ state: "visible" });
    await admin.locator("#courses-nav").click();
    await admin.locator('#country-list [data-country="KR"]').click();
    await admin
      .locator('#course-table [data-course="' + kr.course_id + '"]')
      .waitFor();
    assert.equal(
      await admin.locator('#country-list [data-country="KH"]').count(),
      0,
    );
    assert.equal(
      await admin.locator('#country-list [data-country="LA"]').count(),
      0,
    );
    await admin.locator("#audit-courses").click();
    await admin
      .locator("#course-audit-summary")
      .filter({ hasText: "중복 후보 1그룹" })
      .waitFor();
    await admin
      .locator('#course-table [data-course="' + kr.course_id + '"]')
      .click();
    await admin
      .locator("#review-footer")
      .getByRole("button", { name: "수정", exact: true })
      .click();
    await admin.locator("#edit-name").fill("Updated Seoul Club");
    await admin.locator("#translation-name-ko").fill("수정한 서울 골프장");
    await admin.locator("#translation-name-en").fill("Updated Seoul Club");
    await admin
      .locator("#review-footer")
      .getByRole("button", { name: "변경 저장", exact: true })
      .click();
    await admin.waitForFunction(
      () =>
        document
          .querySelector("#review-drawer")
          ?.getAttribute("aria-hidden") === "true",
    );
    const current = (await adminAPI("/admin/api/courses/" + kr.course_id))
      .course;
    assert.equal(current.name, "Updated Seoul Club");
    assert.equal(current.localization.name.en, "Updated Seoul Club");
    assert.ok(englishPage);
    const viewer = englishPage;
    activePage = viewer;
    await viewer.setViewportSize({ width: 320, height: 844 });
    await viewer.goto(base + "/courses");
    await viewer.getByTestId("public-courses").click();
    await viewer
      .getByText("Updated Seoul Club(수정한 서울 골프장)", { exact: true })
      .waitFor();
    await overflow(viewer);
    await adminAPI("/admin/api/courses/" + kr.course_id, "PUT", {
      ...current,
      active: false,
    });
    await viewer.reload();
    await viewer.getByTestId("public-courses").click();
    await viewer.getByTestId("add-" + ph.course_id).waitFor();
    assert.equal(await viewer.getByTestId("add-" + kr.course_id).count(), 0);
    assert.deepEqual(errors, []);
    console.log(
      "PASS courses UI: ko/en localized names, country filter, ephemeral device default, full-world KH registration, 320px picker, protected read-only admin audit, actual admin edits and inactive search visibility",
    );
  } catch (error) {
    await activePage!
      .screenshot({ path: "qa/course-data/failure.png", fullPage: true })
      .catch(() => {});
    console.log("Browser errors:", errors);
    throw error;
  } finally {
    await browser.close();
  }
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
