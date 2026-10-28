import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formSteps,
  stepAt,
  readingMatches,
  nextReadingMatch,
  ReadingMemory,
} from "../lib/workflow.mjs";
import { paletteItems } from "../lib/palette.mjs";
import { catalogFields } from "../lib/catalog.mjs";
test("wizard groups cover each project/event field once and keep image selection separate", () => {
  for (const entity of ["project", "event"]) {
    const form = { kind: "catalog", entity, topics: [] },
      fields = catalogFields(form),
      steps = formSteps(form, fields),
      indexes = steps.flatMap((s) => s.indexes);
    assert.equal(indexes.length, fields.length);
    assert.equal(new Set(indexes).size, fields.length);
    assert.ok(
      steps
        .at(-1)
        .indexes.every((i) =>
          ["logo", "screenshots", "banner"].includes(fields[i].key),
        ),
    );
    assert.equal(stepAt(steps, fields.length, fields.length), steps.length - 1);
  }
  assert.deepEqual(formSteps({ kind: "appearance" }, []), []);
});
test("palette filters scoped actions, keeps recent entries bounded and creates explicit search/direct-open choices", () => {
  const actions = [{ id: "reply", label: "Write a reply" }];
  const r = paletteItems({ query: "reply", actions });
  assert.equal(r[0].id, "action:reply");
  assert.ok(!r.some((i) => i.id === "action:delete"));
  assert.ok(paletteItems({ query: "event 19" })[0].command === "/event 19");
  assert.ok(
    !paletteItems({ query: "event 9999999999999999999999" }).some(
      (i) => i.id === "command",
    ),
  );
  assert.equal(paletteItems({ query: "not found" }).at(-1).query, "not found");
  const history = Array.from({ length: 40 }, (_, i) => ({
    route: { view: "post", id: i },
    label: "Post " + i,
  }));
  assert.equal(
    paletteItems({ history }).filter((i) => i.group === "Recent").length,
    8,
  );
  assert.ok(
    !paletteItems({ query: "\x1b[31mreview" }).some((i) =>
      i.label.includes("\x1b"),
    ),
  );
});
test("reader searches rendered lines literally, cycles in both directions and restores bounded reading positions", () => {
  const rows = Array.from({ length: 40 }, (_, i) => ({
    text: i === 7 || i === 25 ? "Use [a+b] safely" : "Line " + i,
  }));
  const matches = readingMatches(rows, "[A+B]");
  assert.deepEqual(matches, [7, 25]);
  assert.equal(nextReadingMatch(matches, 25), 7);
  assert.equal(nextReadingMatch(matches, 7, -1), 25);
  assert.equal(nextReadingMatch([], 12), 12);
  const memory = new ReadingMemory(2);
  memory.save("a", 20, rows);
  assert.equal(memory.restore("a", rows, 5), 20);
  const longer = [{ text: "New introduction" }, ...rows];
  assert.equal(memory.restore("a", longer, 5), 21);
  assert.equal(memory.restore("a", rows, 30), 10);
  memory.save("b", 4, rows);
  memory.save("c", 5, rows);
  assert.equal(memory.restore("a", rows, 5), 0);
  memory.clear();
  assert.equal(memory.restore("c", rows, 5), 0);
});
