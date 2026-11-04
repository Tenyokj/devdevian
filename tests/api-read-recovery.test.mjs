import { test } from "node:test";
import assert from "node:assert/strict";
import { api } from "../src/data.js";
const result = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers });
test("a transient failed read retries once; mutation failures are never replayed", async () => {
  const original = global.fetch;
  try {
    let calls = 0;
    global.fetch = async () =>
      ++calls === 1
        ? result({ error: "Temporary session read failure" }, 500)
        : result({ ok: true });
    assert.equal((await api("/recovery-fixture")).ok, true);
    assert.equal(calls, 2);
    calls = 0;
    global.fetch = async () => {
      calls++;
      return result({ error: "Write failed" }, 500);
    };
    await assert.rejects(
      api("/write-fixture", {
        method: "POST",
        body: { text: "keep this draft" },
      }),
      /Write failed/,
    );
    assert.equal(calls, 1);
  } finally {
    global.fetch = original;
  }
});
test("read recovery respects abort, retry-after, and account changes", async () => {
  const original = global.fetch;
  try {
    let calls = 0;
    global.fetch = async () => {
      calls++;
      return result({ error: "Capacity cooldown" }, 503, {
        "retry-after": "15",
      });
    };
    await assert.rejects(api("/cooldown-fixture"), /Capacity cooldown/);
    assert.equal(calls, 1);
    calls = 0;
    const c = new AbortController();
    global.fetch = async () => {
      calls++;
      queueMicrotask(() => c.abort());
      return result({ error: "Read failed" }, 500);
    };
    await assert.rejects(api("/abort-fixture", { signal: c.signal }));
    assert.equal(calls, 1);
    calls = 0;
    global.fetch = async (path, options) => {
      calls++;
      return options.method === "POST"
        ? result({ ok: true })
        : result({ error: "Read failed" }, 500);
    };
    const reading = api("/session-fixture");
    await new Promise((r) => setTimeout(r, 30));
    await api("/switch-fixture", { method: "POST", body: {} });
    await assert.rejects(reading, /session changed/);
    assert.equal(calls, 2);
  } finally {
    global.fetch = original;
  }
});
