import { test } from "node:test";
import assert from "node:assert/strict";
import { renderHelp } from "../lib/help.mjs";
const text =
  "Devdevian CLI 0.6.1-alpha.1 · alpha\n\n  devdevian tui                   Live workspace\n  --theme NAME       midnight | nebula\n";
test("help wordmark and selective accents adapt to terminal width, plain pipes and NO_COLOR", () => {
  const wide = renderHelp(text, { tty: true, columns: 100 });
  assert.ok(wide.includes("████"));
  assert.ok(wide.includes("\x1b[38;5;111m  devdevian"));
  assert.ok(wide.includes("Live workspace"));
  assert.ok(!wide.includes("\x1b[38;5;111mLive workspace"));
  const plain = renderHelp(text, { tty: true, columns: 100, noColor: true });
  assert.ok(plain.includes("████"));
  assert.ok(!plain.includes("\x1b"));
  const narrow = renderHelp(text, { tty: true, columns: 40 });
  assert.ok(narrow.includes("DEVDEVIAN"));
  assert.ok(!narrow.includes("████"));
  assert.equal(renderHelp(text), text);
  assert.equal(renderHelp(text, { tty: true, json: true }), text);
});
