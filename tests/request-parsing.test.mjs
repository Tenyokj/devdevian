import { test } from "node:test";
import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
import { setTimeout as delay } from "node:timers/promises";
import { startTestServer } from "./http-fixture.mjs";

test("compressed JSON with trailing garbage cannot terminate the API process", async () => {
  const f = await startTestServer();
  try {
    // GHSA-27r3-jxmh-p828: the decoder must retain an error handler after parsing.
    const body = Buffer.concat([
      gzipSync('{"probe":true}'),
      Buffer.from("trailing garbage"),
    ]);
    const response = await fetch(f.base + "/api/unknown-probe", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Encoding": "gzip",
      },
      body,
    });
    assert.ok(
      response.status >= 400,
      "Malformed compressed input must be rejected.",
    );
    await delay(100);
    assert.equal((await fetch(f.base + "/api/health")).status, 200);
  } finally {
    await f.close();
  }
});
