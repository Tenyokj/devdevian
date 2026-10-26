import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { originOf, clean, client } from "../lib/client.mjs";
test("remote origins are HTTPS and credentials/path/query origins are rejected", () => {
  for (const value of [
    "https://user:secret@example.test",
    "https://example.test/app",
    "https://example.test?x=1",
    "http://example.test",
  ])
    assert.throws(() => originOf(value));
  assert.equal(originOf("http://127.0.0.1:4173"), "http://127.0.0.1:4173");
  assert.equal(
    originOf("https://devdevian.vercel.app"),
    "https://devdevian.vercel.app",
  );
});
test("terminal output removes terminal controls and bidi overrides while retaining text", () => {
  assert.equal(
    clean("\x1b[31mhello\x1b[0m\nline\t2\x1b]52;c;secret\x07\u202e"),
    "hello\nline\t2",
  );
});
test("API client refuses redirects and handles non-JSON failures without mutation replay", async () => {
  let calls = 0,
    redirected = 0;
  const server = createServer((req, res) => {
    calls++;
    if (req.url === "/api/plain") {
      res.writeHead(503, { "Content-Type": "text/plain" });
      res.end("A server error");
    } else if (req.url === "/api/redirect") {
      res.writeHead(302, { Location: "/leak" });
      res.end();
    } else {
      redirected++;
      res.end("{}");
    }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  try {
    const api = client(
      "http://127.0.0.1:" + server.address().port,
      "ddv_" + "a".repeat(43),
    );
    await assert.rejects(
      api("/plain", { method: "POST", body: { test: 1 } }),
      /unexpected response/,
    );
    await assert.rejects(api("/redirect"), /Could not reach/);
    assert.equal(calls, 2);
    assert.equal(redirected, 0);
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
});
