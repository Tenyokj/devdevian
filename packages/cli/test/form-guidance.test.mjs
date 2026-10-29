import { test } from "node:test";
import assert from "node:assert/strict";
import { fieldGuidance, stepControls } from "../lib/form-guidance.mjs";
import { editText } from "../lib/tui-model.mjs";
test("form guidance distinguishes text editing, step navigation and a separate preview", () => {
  assert.match(
    fieldGuidance({ key: "help", multiline: true }, { project: true }).detail,
    /People & links/,
  );
  assert.match(
    fieldGuidance({ multiline: true }).keys,
    /Space inserts a space.*Enter adds a line/,
  );
  assert.match(fieldGuidance({ options: [] }).keys, /choose/);
  const steps = [
    { label: "Story" },
    { label: "People & links" },
    { label: "Images" },
  ];
  assert.equal(stepControls(steps, 0)[0].enabled, false);
  assert.equal(stepControls(steps, 0)[1].label, "Next: People & links →");
  assert.equal(stepControls(steps, 2)[1].label, "Preview →");
  assert.equal(stepControls(steps, 2)[0].enabled, true);
});
test("multiline text preserves a literal space, a pasted URL and an explicit newline", () => {
  let r = editText("Review", 6, " ", {}, { multiline: true });
  r = editText(
    r.value,
    r.cursor,
    "https://example.com/design",
    {},
    { multiline: true },
  );
  assert.equal(r.value, "Review https://example.com/design");
  r = editText(r.value, r.cursor, "", { return: true }, { multiline: true });
  assert.equal(r.value, "Review https://example.com/design\n");
});
