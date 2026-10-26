import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
export async function startTestServer() {
  const directory = await mkdtemp(join(tmpdir(), "devdevian-http-"));
  const probe = createServer();
  await new Promise((r) => probe.listen(0, "127.0.0.1", r));
  const port = probe.address().port;
  await new Promise((r) => probe.close(r));
  const path = join(directory, "fixture.sqlite");
  const server = spawn(process.execPath, ["server.mjs"], {
    env: {
      ...process.env,
      TURSO_DATABASE_URL: "",
      TURSO_AUTH_TOKEN: "",
      DB_PATH: path,
      UPLOAD_DRIVER: "local",
      NODE_ENV: "test",
      DEMO_MODE: "1",
      AUTH_TEST_UNVERIFIED: "1",
      VERCEL: "",
      PORT: String(port),
      MODERATOR_EMAILS: "moderator@fixture.test",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(Error("Fixture startup timeout: " + output)),
        10000,
      );
      server.stdout.on("data", (c) => {
        output += c;
        if (output.includes("Devdevian is ready")) {
          clearTimeout(timer);
          resolve();
        }
      });
      server.stderr.on("data", (c) => (output += c));
      server.once("exit", () => {
        clearTimeout(timer);
        reject(Error("Fixture exited: " + output));
      });
    });
  } catch (e) {
    server.kill();
    await rm(directory, { recursive: true, force: true });
    throw e;
  }
  const base = `http://127.0.0.1:${port}`;
  const client = () => {
    const jar = new Map();
    return async (path, body, method = body ? "POST" : "GET", headers = {}) => {
      const r = await fetch(base + "/api" + path, {
        method,
        headers: {
          "Content-Type": "application/json",
          Cookie: [...jar].map(([k, v]) => k + "=" + v).join("; "),
          ...headers,
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(10000),
      });
      for (const raw of r.headers.getSetCookie()) {
        const [key, value] = raw.split(";")[0].split("=");
        if (value) jar.set(key, value);
        else jar.delete(key);
      }
      let data = await r.json();
      if (data.items && data.pagination && Object.keys(data).length === 2)
        data = Object.assign(data.items, { pagination: data.pagination });
      return { status: r.status, data };
    };
  };
  return {
    base,
    path,
    directory,
    client,
    async close() {
      if (server.exitCode === null) {
        server.kill();
        await new Promise((r) => server.once("exit", r));
      }
      await rm(directory, { recursive: true, force: true });
    },
  };
}
