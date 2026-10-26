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
await writeFile(
  ".tmp/asset-gallery/design/index.html",
  `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>YAMONE GOLF Asset Kit</title><style>${css}</style><div id="root"></div><script>${result.outputFiles[0].text}</script></html>`,
);
console.log("Gallery: .tmp/asset-gallery/design/index.html");
