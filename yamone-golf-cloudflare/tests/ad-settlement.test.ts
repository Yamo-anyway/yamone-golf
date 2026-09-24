import { test } from "node:test";
import assert from "node:assert/strict";
import { allowsTestAds, testAdEvidence } from "../src/ad-settlement";
test("test/native SDK labels never authorize production, preview or unknown environments", () => {
  for (const environment of [
    "production",
    "staging",
    "preview",
    "",
    "DEVELOPMENT",
  ])
    for (const source of [
      undefined,
      "development-test",
      "admob-test",
      "admob",
      "production",
    ])
      for (const outcome of [
        "completed",
        "unavailable",
        "load_failed",
        "show_failed",
        "load_timeout",
      ])
        assert.throws(() => testAdEvidence(environment, { source, outcome }), {
          code: "ads_not_configured",
        });
});
test("development only accepts known terminal outcomes and separates native test attribution", () => {
  for (const env of ["development", "test", "ui-test"]) {
    assert.equal(allowsTestAds(env), true);
    assert.deepEqual(
      testAdEvidence(env, { source: "admob-test", outcome: "completed" }),
      { source: "admob-test", outcome: "completed" },
    );
    assert.equal(
      testAdEvidence(env, { outcome: "unavailable" }).source,
      "development-test",
    );
    for (const outcome of ["interrupted", "opened", "loaded", "", null])
      assert.throws(() => testAdEvidence(env, { outcome }), {
        code: "ad_interrupted",
      });
    assert.throws(
      () => testAdEvidence(env, { source: "admob", outcome: "completed" }),
      { code: "ads_not_configured" },
    );
  }
});
