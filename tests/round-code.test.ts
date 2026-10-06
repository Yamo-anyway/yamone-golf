import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeRoundCode, roundQRValue } from "../shared/round-code";
import { normalizePersonalCode } from "../shared/personal-code";

test("round codes accept typed and QR formats without mixing personal identities", () => {
  const code = "RSTUVWXY2345";
  assert.equal(normalizeRoundCode("rstu-vwxy-2345"), code);
  assert.equal(normalizeRoundCode(`  ${roundQRValue(code)}  `), code);
  assert.equal(normalizeRoundCode("YAMONE-GOLF://ROUND/rstuvwxy2345"), code);
  assert.equal(normalizeRoundCode(`yamone-golf://player/${code}`), null);
  assert.equal(normalizePersonalCode(roundQRValue(code)), null);
  assert.equal(normalizePersonalCode(`yamone-golf://player/${code}`), code);
});

test("round codes reject arbitrary URLs, ambiguous text, suffixes and malformed payloads", () => {
  for (const input of [
    null,
    12,
    "",
    "ABCDEFGHJK2",
    "ABCDEFGHJK234",
    "RSTUVWXY2340",
    "https://example.com/RSTUVWXY2345",
    "yamone-golf://round/RSTUVWXY2345?join=1",
    "yamone-golf://round/RSTUVWXY2345/",
    "yamone-golf://round/RSTUVWXY2345#x",
    "yamone-golf://round/RSTU-VWXY-2345",
    " ".repeat(181) + "RSTUVWXY2345",
  ])
    assert.equal(normalizeRoundCode(input), null, String(input));
});
