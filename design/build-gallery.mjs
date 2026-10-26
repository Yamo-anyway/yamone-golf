import { build } from "esbuild";
import { mkdir, readFile, writeFile, cp } from "node:fs/promises";
await mkdir(".tmp/asset-gallery/design", { recursive: true });
await cp("assets", ".tmp/asset-gallery/assets", { recursive: true });
const result = await build({
  entryPoints: ["design/asset-gallery.tsx"],
  bundle: true,
  write: false,
  minify: true,
  platform: "browser",
  format: "iife",
  alias: {
    "react-native": "react-native-web",
    "react-native-svg": "react-native-svg/lib/module/ReactNativeSVG.web.js",
  },
  resolveExtensions: [
    ".web.tsx",
    ".web.ts",
    ".web.js",
    ".tsx",
    ".ts",
    ".jsx",
    ".js",
    ".json",
  ],
  define: { "process.env.NODE_ENV": '"production"' },
});
const css = await readFile("design/gallery.css", "utf8");
for (const language of ["ko", "en"]) {
  const html = `<!doctype html><html lang="${language}"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>YAMONE GOLF Asset Kit · ${language.toUpperCase()}</title><style>${css}</style><div id="root"></div><script>${result.outputFiles[0].text}</script></html>`;
  await writeFile(`.tmp/asset-gallery/design/index-${language}.html`, html);
  if (language === "ko")
    await writeFile(".tmp/asset-gallery/design/index.html", html);
}
console.log(
  "Gallery: .tmp/asset-gallery/design/index-ko.html and index-en.html",
);
