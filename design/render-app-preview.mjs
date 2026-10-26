import { chromium } from "playwright";
import { writeFile, mkdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
const frames = [
  ["시작 · 공통 브랜드와 버튼", "qa/assets/welcome-ko.png"],
  ["골프장 · 빈 화면 안내", "qa/assets/courses-ko.png"],
  ["점수 입력 · ±와 고정 저장", "qa/mobile-redesign/03-score-entry.png"],
];
await mkdir(".tmp", { recursive: true });
const html = `<!doctype html><html lang="ko"><meta charset="utf-8"><style>
*{box-sizing:border-box}body{margin:0;background:#F5F6F2;color:#163C34;font-family:Arial,'Noto Sans CJK KR',sans-serif;padding:40px}header{display:flex;justify-content:space-between;align-items:end;margin-bottom:28px}h1{margin:8px 0 0;font-size:32px;letter-spacing:-1px}p{margin:0;color:#68766F;font-size:13px;line-height:1.7}.eyebrow{color:#174E3F;font-weight:bold;letter-spacing:2px;font-size:11px}.frames{display:flex;gap:28px}section{width:390px}h2{font-size:16px;margin:0 0 14px}.phone{width:390px;height:844px;overflow:hidden;border:1px solid #DFE5DE;border-radius:24px;background:#fff;box-shadow:0 10px 25px #163C3409}.phone img{display:block;width:390px}footer{text-align:center;margin-top:24px;font-size:11px;color:#68766F}
</style><header><div><p class="eyebrow">YAMONE GOLF · IMPLEMENTED APP PREVIEW</p><h1>새 에셋을 적용한 실제 앱 화면</h1></div><p>로컬 테스트 데이터 · 390px 화면<br>설치 앱의 OS 시작 화면은 별도 확인 예정</p></header><div class="frames">${frames.map(([title, path]) => `<section><h2>${title}</h2><div class="phone"><img src="${pathToFileURL(resolve(path)).href}"></div></section>`).join("")}</div><footer>브라우저에서 실행한 앱의 실제 캡처 · 2026.10.26</footer></html>`;
await writeFile(".tmp/app-preview.html", html);
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
try {
  const page = await browser.newPage({
    viewport: { width: 1306, height: 1055 },
  });
  await page.goto(pathToFileURL(resolve(".tmp/app-preview.html")).href);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: "design/app-preview.png", fullPage: true });
} finally {
  await browser.close();
}
console.log("Rendered design/app-preview.png");
