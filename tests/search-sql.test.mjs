import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { portableQuery } from "../search-sql.mjs";
test("portable cloud search keeps wildcards literal, Unicode case-insensitive and values bound", () => {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE documents(title TEXT)");
  for (const title of [
    "Привет WORLD",
    "literal *?[] value",
    "ordinary text",
    "ＦＵＬＬＷＩＤＴＨ",
  ])
    db.prepare("INSERT INTO documents VALUES(?)").run(title);
  const find = (query) => {
    const p = portableQuery(
      "SELECT title FROM documents WHERE dev_search(title,?)",
      [query],
    );
    return db
      .prepare(p.sql)
      .all(...p.args)
      .map((row) => row.title);
  };
  assert.deepEqual(find("ПРИВЕТ world"), ["Привет WORLD"]);
  assert.deepEqual(find("*?[]"), ["literal *?[] value"]);
  assert.deepEqual(find("fullwidth"), ["ＦＵＬＬＷＩＤＴＨ"]);
  assert.deepEqual(find("' OR 1=1 --"), []);
  const p = portableQuery(
    "SELECT '?' AS mark,title FROM documents WHERE title<>? AND dev_search(title,?) AND title<>?",
    ["excluded", "привет", "other"],
  );
  assert.deepEqual(
    db
      .prepare(p.sql)
      .all(...p.args)
      .map((row) => row.title),
    ["Привет WORLD"],
  );
  db.close();
});
