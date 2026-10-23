import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTimestamp, dateStamp, dateTime } from "../src/data.js";

test("timestamps treat database times as UTC, preserve explicit offsets and show local minutes", () => {
  const sql = "2026-10-23 21:47:06";
  assert.equal(parseTimestamp(sql).toISOString(), "2026-10-23T21:47:06.000Z");
  assert.equal(
    parseTimestamp("2026-10-23T21:47:06").toISOString(),
    parseTimestamp(sql).toISOString(),
  );
  const displayed = dateStamp(sql, "Europe/Kyiv");
  assert.match(displayed, /Oct 24, 2026/);
  assert.match(displayed, /00:47/);
  assert.doesNotMatch(displayed, /00:47:06/);
  assert.equal(
    displayed,
    dateStamp("2026-10-24T00:47:06+03:00", "Europe/Kyiv"),
  );
  assert.match(dateStamp("2026-10-24T00:00:00Z", "UTC"), /00:00/);
  assert.equal(dateTime(sql, "UTC"), dateStamp(sql, "UTC"));
  assert.equal(dateStamp(null), "—");
  assert.equal(dateStamp("bad-date"), "—");
});
