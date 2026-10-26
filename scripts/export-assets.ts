import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { iconPaths } from "../src/ui/icon-paths";
import { artworkPaths, artworkAccent } from "../src/ui/artwork-paths";
import { brandPaths } from "../src/ui/brand-paths";
import { colors, ui } from "../src/ui/theme";
const require = createRequire(import.meta.url);
// Expo's image pipeline supplies sharp. No native app dependency is added.
const sharp = require("sharp") as typeof import("sharp").default;
const svg = (body: string, viewBox = "0 0 1024 1024") =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${body}</svg>\n`;
const mark = (foreground: string, ball: string) =>
  `<path d="${brandPaths.pole}" fill="none" stroke="${foreground}" stroke-width="36" stroke-linecap="round"/><path d="${brandPaths.flag}" fill="${foreground}"/><ellipse cx="423" cy="769" rx="130" ry="23" fill="${ball}" opacity=".4"/><circle cx="669" cy="745" r="28" fill="${ball}"/>`;
async function main() {
  await Promise.all(
    ["assets/brand", "assets/ui/icons", "assets/ui/states"].map((p) =>
      mkdir(p, { recursive: true }),
    ),
  );
  const tile = svg(
    `<rect width="1024" height="1024" rx="220" fill="${colors.green}"/>${mark(colors.lime, colors.white)}`,
  );
  const square = svg(
    `<rect width="1024" height="1024" fill="${colors.green}"/>${mark(colors.lime, colors.white)}`,
  );
  const foreground = svg(
    `<g transform="translate(51.2 51.2) scale(.9)">${mark(colors.lime, colors.white)}</g>`,
  );
  const mono = svg(
    `<g transform="translate(51.2 51.2) scale(.9)">${mark(colors.white, colors.white)}</g>`,
  );
  const source = {
    "logo.svg": tile,
    "brand/app-icon.svg": square,
    "brand/adaptive-foreground.svg": foreground,
    "brand/monochrome.svg": mono,
    "brand/mark.svg": svg(mark(colors.green, colors.green)),
  };
  for (const [path, content] of Object.entries(source))
    await writeFile("assets/" + path, content);
  for (const [path, content, size] of [
    ["icon.png", square, 1024],
    ["android-icon-foreground.png", foreground, 1024],
    ["android-icon-monochrome.png", mono, 1024],
    ["splash-icon.png", tile, 1024],
    ["favicon.png", square, 64],
    [
      "android-icon-background.png",
      svg(`<rect width="1024" height="1024" fill="${colors.green}"/>`),
      1024,
    ],
  ] as const)
    await sharp(Buffer.from(content))
      .resize(size, size)
      .png()
      .toFile("assets/" + path);
  for (const [name, d] of Object.entries(iconPaths))
    await writeFile(
      `assets/ui/icons/${name}.svg`,
      svg(
        `<path d="${d}" fill="none" stroke="${colors.ink}" stroke-width="${ui.iconStroke}" stroke-linecap="round" stroke-linejoin="round"/>`,
        "0 0 24 24",
      ),
    );
  for (const kind of Object.keys(
    artworkPaths,
  ) as (keyof typeof artworkPaths)[]) {
    await writeFile(
      `assets/ui/states/${kind}.svg`,
      svg(
        `<ellipse cx="104" cy="69" rx="71" ry="54" fill="${kind === "error" ? colors.errorSoft : colors.mint}"/><ellipse cx="104" cy="116" rx="63" ry="5" fill="${colors.line}"/>` +
          artworkPaths[kind]
            .map(
              (d) =>
                `<path d="${d}" fill="none" stroke="${artworkAccent(kind)}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`,
            )
            .join(""),
        "0 0 208 130",
      ),
    );
  }
  await writeFile(
    "assets/ui/tokens.json",
    JSON.stringify({ colors, ui }, null, 2) + "\n",
  );
  console.log(
    `Exported brand assets, ${Object.keys(iconPaths).length} icons, ${Object.keys(artworkPaths).length} state illustrations and shared tokens.`,
  );
}
void main();
