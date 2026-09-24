import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import configure from "../app.config";
test("native build defaults are test apps; optional UMP app IDs are validated without changing dev identity", () => {
  const android = process.env.ADMOB_TEST_ANDROID_APP_ID,
    ios = process.env.ADMOB_TEST_IOS_APP_ID;
  try {
    delete process.env.ADMOB_TEST_ANDROID_APP_ID;
    delete process.env.ADMOB_TEST_IOS_APP_ID;
    const config = JSON.parse(readFileSync("app.json", "utf8")).expo;
    const context = {
      config,
      projectRoot: process.cwd(),
      staticConfigPath: null,
      packageJsonPath: "package.json",
    };
    const base = configure(context);
    assert.deepEqual(base, config);
    process.env.ADMOB_TEST_ANDROID_APP_ID =
      "ca-app-pub-1111111111111111~1111111111";
    const result = configure(context);
    const plugin = result.plugins?.find(
      (p) => Array.isArray(p) && p[0] === "react-native-google-mobile-ads",
    );
    assert.ok(Array.isArray(plugin));
    assert.equal(plugin[1].androidAppId, process.env.ADMOB_TEST_ANDROID_APP_ID);
    assert.equal(plugin[1].delayAppMeasurementInit, true);
    assert.equal(result.android?.package, "com.yamone.golf.dev");
    process.env.ADMOB_TEST_IOS_APP_ID = "not-an-app-id";
    assert.throws(() => configure(context), /Invalid ADMOB_TEST/);
  } finally {
    if (android === undefined) delete process.env.ADMOB_TEST_ANDROID_APP_ID;
    else process.env.ADMOB_TEST_ANDROID_APP_ID = android;
    if (ios === undefined) delete process.env.ADMOB_TEST_IOS_APP_ID;
    else process.env.ADMOB_TEST_IOS_APP_ID = ios;
  }
});
