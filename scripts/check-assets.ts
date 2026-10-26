import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { iconPaths } from "../src/ui/icon-paths";
import { artworkPaths } from "../src/ui/artwork-paths";
const require = createRequire(import.meta.url);
const sharp = require("sharp") as typeof import("sharp").default;
async function main() {
  const config = JSON.parse(await readFile("app.json", "utf8")).expo;
  const files = [
    config.icon,
    config.android.adaptiveIcon.foregroundImage,
    config.android.adaptiveIcon.monochromeImage,
    "assets/splash-icon.png",
    config.web.favicon,
  ];
  for (const path of files) {
    const meta = await sharp(path).metadata();
    assert.equal(meta.format, "png");
    assert.equal(meta.width, path.includes("favicon") ? 64 : 1024);
    assert.equal(meta.height, meta.width);
  }
  const { data, info } = await sharp(config.icon)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  for (let i = 3; i < data.length; i += info.channels)
    assert.equal(
      data[i],
      255,
      "Platform icon must be opaque, including its corners",
    );
  for (const path of files.slice(1, 3)) {
    const { data, info } = await sharp(path)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    let painted = 0;
    for (let y = 0; y < info.height; y++)
      for (let x = 0; x < info.width; x++)
        if (data[(y * info.width + x) * info.channels + 3] > 0) {
          painted++;
          // Android adaptive foreground fits inside the central 66/108 safe circle.
          assert.ok(
            Math.hypot(x - 512, y - 512) <= (1024 * 33) / 108,
            "Adaptive mark outside safe zone",
          );
        }
    assert.ok(painted > 10000, "Foreground must not be empty");
    assert.equal(data[3], 0, "Foreground corners must be transparent");
  }
  const splash = config.plugins.find(
    (p: unknown) => Array.isArray(p) && p[0] === "expo-splash-screen",
  );
  assert.ok(splash?.[1]?.image && splash[1].backgroundColor);
  for (const name of Object.keys(iconPaths))
    assert.match(
      await readFile(`assets/ui/icons/${name}.svg`, "utf8"),
      /viewBox="0 0 24 24"/,
    );
  for (const name of Object.keys(artworkPaths))
    assert.match(
      await readFile(`assets/ui/states/${name}.svg`, "utf8"),
      /viewBox="0 0 208 130"/,
    );
  console.log(
    "PASS platform assets: PNG dimensions/opacity, adaptive safe circle/transparency, splash config, vector exports",
  );
}
void main();
