import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizePersonalCode } from "../shared/personal-code";
test("a personal QR and typed code map to the same public identifier", () => {
  assert.equal(normalizePersonalCode("abcd-efgh-jk23"), "ABCDEFGHJK23");
  assert.equal(
    normalizePersonalCode("yamone-golf://player/ABCDEFGHJK23"),
    "ABCDEFGHJK23",
  );
});
test("foreign URLs, recovery keys, UUIDs and QR query strings cannot be used as a player code", () => {
  for (const input of [
    "https://example.com/ABCDEFGHJK23",
    "yamone-golf://player/ABCDEFGHJK23?token=secret",
    "YMGF-K7P4-82NX-6Q",
    "YMGF" + "A".repeat(32),
    "a37a2ba3-57a6-42bb-bbd9-b3139c5268f8",
    null,
  ])
    assert.equal(normalizePersonalCode(input), null);
});
