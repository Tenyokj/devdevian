import { test } from "node:test";
import assert from "node:assert/strict";
import { runDoctor, doctorLines } from "../lib/doctor.mjs";
import { commandProblemMessage } from "../lib/problems.mjs";

const origin = "https://forum.example.test";
const token = "ddv_" + "x".repeat(43);
const local = {
  host: origin,
  runtime: "24.1.0",
  terminal: { tty: true, columns: 100, rows: 30 },
  gitVersion: async () => {},
  checkProject: async () => ({ isDirectory: () => true }),
  loadSavedConfig: async () => ({ origin, token }),
};
const response = (data, status = 200) =>
  new Response(JSON.stringify(data), { status });

test("doctor makes only bounded explicit GETs and reports no credentials, account data or response bodies", async () => {
  const calls = [];
  const report = await runDoctor({
    ...local,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return response(
        url.endsWith("/health")
          ? { ok: true, version: "0.1.8" }
          : { user: { email: "private@example.test", token, id: 1 } },
      );
    },
  });
  assert.equal(report.ok, true);
  assert.equal(calls.length, 2);
  assert.ok(
    calls.every(
      (c) =>
        c.options.method === "GET" &&
        c.options.redirect === "error" &&
        c.options.credentials === "omit" &&
        c.options.signal,
    ),
  );
  assert.equal(calls[0].options.headers.Authorization, undefined);
  assert.equal(calls[1].options.headers.Authorization, "Bearer " + token);
  const output = JSON.stringify(report) + doctorLines(report).join("\n");
  assert.doesNotMatch(output, /private@example|ddv_|"id":1/);
});

test("doctor never forwards a saved session to a host override or a failed health endpoint", async () => {
  for (const override of ["https://another.example.test", origin]) {
    const calls = [];
    const report = await runDoctor({
      ...local,
      host: override,
      fetchImpl: async (url, options) => {
        calls.push({ url, options });
        return override === origin
          ? response({ error: token }, 503)
          : response({ ok: true, version: "0.1.8" });
      },
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].options.headers.Authorization, undefined);
    assert.notEqual(report.checks.find((c) => c.id === "session").status, "ok");
    assert.doesNotMatch(JSON.stringify(report), /ddv_/);
  }
});

test("offline doctor stays local, distinguishes missing credentials and never repairs invalid files", async () => {
  for (const loader of [
    async () => null,
    async () => {
      throw Error("secret: " + token);
    },
  ]) {
    let requests = 0;
    const report = await runDoctor({
      ...local,
      offline: true,
      loadSavedConfig: loader,
      fetchImpl: async () => {
        requests++;
        throw Error();
      },
    });
    assert.equal(requests, 0);
    assert.equal(
      report.checks.find((c) => c.id === "health").status,
      "skipped",
    );
    assert.doesNotMatch(JSON.stringify(report), /secret:|ddv_/);
  }
});

test("doctor rejects invalid origins and unsafe health responses, handles expiry, large bodies and cancellation", async () => {
  let requests = 0;
  const bad = await runDoctor({
    ...local,
    host: "https://user:secret@example.test/path",
    fetchImpl: async () => {
      requests++;
    },
  });
  assert.equal(bad.ok, false);
  assert.equal(bad.origin, null);
  assert.equal(requests, 0);
  for (const data of [
    { ok: true, version: "\x1b[2Jsecret" },
    { version: "0.1.8" },
    "x".repeat(65537),
  ]) {
    requests = 0;
    const report = await runDoctor({
      ...local,
      fetchImpl: async () => {
        requests++;
        return response(data);
      },
    });
    assert.equal(report.ok, false);
    assert.equal(requests, 1);
    assert.doesNotMatch(JSON.stringify(report), /secret|x{20}/);
  }
  const expired = await runDoctor({
    ...local,
    fetchImpl: async (url) =>
      url.endsWith("/me")
        ? response({ error: token }, 401)
        : response({ ok: true, version: "0.1.8" }),
  });
  assert.equal(expired.ok, false);
  assert.match(
    doctorLines(expired).join("\n"),
    /Session expired.*\n.*devdevian login/,
  );
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    runDoctor({
      ...local,
      signal: controller.signal,
      fetchImpl: async () => {
        throw controller.signal.reason;
      },
    }),
  );
});

test("doctor explains local prerequisites and shell failures without live-workspace key instructions", async () => {
  const report = await runDoctor({
    ...local,
    runtime: "22.0.0",
    offline: true,
    terminal: { tty: true, columns: 59, rows: 17 },
    checkProject: async () => {
      throw Error();
    },
    gitVersion: async () => {
      throw Error();
    },
  });
  assert.equal(report.ok, false);
  const lines = doctorLines(report).join("\n");
  assert.match(lines, /Node.js 24/);
  assert.match(lines, /60 × 18/);
  assert.match(lines, /Install Git/);
  assert.match(commandProblemMessage({ status: 401 }), /devdevian login/);
  assert.match(
    commandProblemMessage({ code: "NETWORK", message: "Offline" }),
    /devdevian doctor/,
  );
  assert.doesNotMatch(
    commandProblemMessage({ status: 503, message: "Unavailable" }),
    /Shift\+R|Ctrl\+L/,
  );
});
