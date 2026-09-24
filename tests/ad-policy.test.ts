import { test } from "node:test";
import assert from "node:assert/strict";
import {
  adAllowsAction,
  needsRoundAd,
  showBanner,
  type BannerContext,
} from "../src/data/ad-policy";
test("all banner screens deny active-round, edit, fullscreen and unconfirmed ended state", () => {
  for (const screen of [
    "home",
    "record-list",
    "record-detail",
    "scorecard",
    "statistics",
    "peoria",
    "profile",
    "other",
  ] as const) {
    assert.equal(
      showBanner({ screen, flow: "round", roundEnded: true }),
      false,
    );
    for (const flow of ["browse", "round", "record"] as const) {
      assert.equal(
        showBanner({ screen, flow, roundEnded: true, editing: true }),
        false,
      );
      assert.equal(
        showBanner({ screen, flow, roundEnded: true, fullscreen: true }),
        false,
      );
    }
  }
  for (const screen of ["record-detail", "scorecard", "peoria"] as const) {
    assert.equal(showBanner({ screen, flow: "record" }), false);
    assert.equal(
      showBanner({ screen, flow: "record", roundEnded: true }),
      true,
    );
  }
});
test("banner uses navigation context: live round never, ended record view only", () => {
  assert.equal(showBanner({ screen: "home", flow: "browse" }), true);
  assert.equal(
    showBanner({ screen: "scorecard", flow: "round", roundEnded: true }),
    false,
    "end screen does not suddenly acquire a banner",
  );
  assert.equal(
    showBanner({ screen: "scorecard", flow: "record", roundEnded: true }),
    true,
  );
  assert.equal(
    showBanner({ screen: "scorecard", flow: "record", roundEnded: false }),
    false,
  );
  assert.equal(showBanner({ screen: "profile", flow: "browse" }), false);
  for (const screen of [
    "home",
    "record-detail",
    "scorecard",
    "statistics",
  ] as BannerContext["screen"][]) {
    assert.equal(
      showBanner({
        screen,
        flow: "record",
        roundEnded: true,
        fullscreen: true,
      }),
      false,
    );
    assert.equal(
      showBanner({ screen, flow: "record", roundEnded: true, editing: true }),
      false,
    );
  }
});
test("round ad is settled by completion or failure but not by app interruption", () => {
  assert.equal(adAllowsAction("interrupted"), false);
  for (const outcome of [
    "completed",
    "unavailable",
    "load_failed",
    "show_failed",
    "load_timeout",
  ] as const)
    assert.equal(adAllowsAction(outcome), true);
  for (const action of ["create", "join", "receive", "end", "score"] as const)
    assert.equal(needsRoundAd(action, true), false);
  assert.equal(needsRoundAd("end", false), false);
  assert.equal(needsRoundAd("score", false), false);
  assert.equal(needsRoundAd("receive", false), true);
});
