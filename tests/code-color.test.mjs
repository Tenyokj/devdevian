import { test } from "node:test";
import assert from "node:assert/strict";
import { codeTokens } from "../src/code-tokens.mjs";
test("syntax colors preserve exact published lines, whitespace and inert markup across languages", () => {
  for (const [path, code] of [
    ["a.ts", "/* spanning\n   comment */\nconst retry: number = 42;\n"],
    ["a.py", 'def retry():\n    return "<script>alert(1)</script>"\n'],
    ["a.sql", "SELECT id\nFROM users WHERE id = 1;"],
    ["a.json", '{"text": "<&>"}'],
    ["plain.txt", "\t  x\r\n\n  "],
  ]) {
    const lines = codeTokens(code, path);
    assert.equal(
      lines.map((tokens) => tokens.map((t) => t.text).join("")).join("\n"),
      code,
    );
    assert.equal(lines.length, code.split("\n").length);
    assert.ok(
      lines
        .flat()
        .every((t) => typeof t.text === "string" && !/[<>]/.test(t.classes)),
    );
  }
  assert.ok(
    codeTokens('const value = "hello";', "x.js")
      .flat()
      .some((t) => t.classes.includes("hljs-keyword")),
  );
  assert.equal(codeTokens("x".repeat(30000), "x.js").flat()[0].classes, "");
});
