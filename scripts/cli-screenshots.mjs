// Reproducible captures of the real CLI against an isolated, disposable API/DB.
// Never reads production credentials or changes the developer's local data.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { chromium } from "@playwright/test";
import { startTestServer } from "../tests/http-fixture.mjs";
const { Terminal } = createRequire(
  new URL("../packages/cli/package.json", import.meta.url),
)("@xterm/headless");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const f = await startTestServer(),
  directory = await mkdtemp(join(tmpdir(), "devdevian-cli-capture-"));
let child, browser, term;
try {
  const author = f.client(),
    reviewer = f.client(),
    anon = f.client();
  for (const [api, name, username] of [
    [author, "Alex Morgan", "alexmorgan"],
    [reviewer, "Maya Chen", "mayachen"],
  ]) {
    const result = await api("/register", {
      name,
      username,
      email: username + "@capture.test",
      password: "Capture-fixture-only123!",
    });
    if (result.status !== 200) throw Error(JSON.stringify(result));
  }
  const code = `export async function retry<T>(\n  operation: () => Promise<T>,\n  attempts = 3,\n): Promise<T> {\n  for (let attempt = 0; attempt < attempts; attempt++) {\n    try {\n      return await operation();\n    } catch (error) {\n      if (attempt === attempts - 1) throw error;\n      await delay(200 * 2 ** attempt);\n    }\n  }\n  throw new Error('No attempts left');\n}`;
  const review = (
    await author("/posts", {
      title: "A second pair of eyes on my retry strategy?",
      body: "I am building a small API client. How would you handle timeouts, retries and idempotency here?",
      kind: "review",
      topic: "web",
      stack: "TypeScript, Node.js",
      code,
      review_focus: "Timeouts, retries and idempotency",
    })
  ).data;
  const endpoint = `/posts/${review.id}/code-reviews`,
    hash = (await reviewer(endpoint)).data.snippet_hash;
  const note = await reviewer(endpoint, {
    snippet_hash: hash,
    start_line: 8,
    end_line: 10,
    body: "Retry writes with an idempotency key.",
  });
  if (note.status !== 201) throw Error(JSON.stringify(note));
  for (const [title, body, topic, kind] of [
    [
      "When does a side project actually need a queue?",
      "We are adding background jobs to a small service. What signals made you reach for a queue?",
      "web",
      "discussion",
    ],
    [
      "How do you keep local-first data in sync?",
      "I would love to hear what worked for your offline-first application, especially when changes conflict.",
      "web",
      "question",
    ],
    [
      "My weekend project finally escaped localhost.",
      "Orbit is a tiny workspace for developer notes. Looking for feedback on the onboarding flow.",
      "indie",
      "showcase",
    ],
    [
      "What makes a useful code review?",
      "Small, focused changes and a little context have made our reviews much more useful. What would you add?",
      "web",
      "discussion",
    ],
  ]) {
    const r = await author("/posts", {
      title,
      body,
      topic: topic === "indie" ? "web" : topic,
      kind,
      demo_url: kind === "showcase" ? "https://example.com/orbit" : "",
    });
    if (r.status !== 201) throw Error(JSON.stringify(r));
  }
  const device = (await anon("/cli/device", { name: "CLI screenshot fixture" }))
    .data;
  await author("/cli/authorize", {
    user_code: device.user_code,
    approved: true,
  });
  const token = (await anon("/cli/token", { device_code: device.device_code }))
    .data.access_token;
  await writeFile(
    join(directory, "credentials.json"),
    JSON.stringify({ origin: f.base, token }),
    { mode: 0o600 },
  );
  const workspace = join(directory, "workspace");
  await mkdir(workspace);
  term = new Terminal({ cols: 140, rows: 38, allowProposedApi: true });
  child = spawn(
    "python3",
    [
      fileURLToPath(
        new URL("../packages/cli/test/terminal-driver.py", import.meta.url),
      ),
      process.execPath,
      fileURLToPath(
        new URL("../packages/cli/bin/devdevian.mjs", import.meta.url),
      ),
      "tui",
      "--no-live",
      "--theme",
      "midnight",
      "--accent",
      "violet",
      "--motion",
      "reduced",
      "--project",
      workspace,
    ],
    {
      cwd: workspace,
      env: {
        ...process.env,
        DEVDEVIAN_CONFIG_DIR: directory,
        DEVDEVIAN_TEST_COLUMNS: "140",
        DEVDEVIAN_TEST_ROWS: "38",
        FORCE_COLOR: "3",
        TERM: "xterm-256color",
      },
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  let error = "";
  child.stdout.on("data", (c) => term.write(c));
  child.stderr.on("data", (c) => (error += c));
  const screen = () =>
    Array.from(
      { length: 38 },
      (_, i) => term.buffer.active.getLine(i)?.translateToString(true) || "",
    ).join("\n");
  const wait = async (text) => {
    for (let i = 0; i < 160; i++) {
      if (screen().includes(text)) {
        await sleep(300);
        return;
      }
      await sleep(50);
    }
    throw Error("Missing " + text + "\n" + screen() + "\n" + error);
  };
  const send = async (input) => {
    child.stdin.write(JSON.stringify({ input }) + "\n");
    await sleep(160);
  };
  const command = async (value) => {
    await send("/");
    await send(value);
    await send("\r");
  };
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 830 },
    deviceScaleFactor: 1,
  });
  const escape = (s) =>
    s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  const hex = (n) => "#" + n.toString(16).padStart(6, "0");
  const palette = (n) =>
    n < 16
      ? [
          "#0b1020",
          "#ff7b93",
          "#7bdcbd",
          "#e6c893",
          "#97bcff",
          "#b59aff",
          "#87dfeb",
          "#e5eaff",
          "#657496",
          "#ff9bb0",
          "#97e8cb",
          "#f0dbaa",
          "#b6ccff",
          "#cbb3ff",
          "#a5eef6",
          "#ffffff",
        ][n]
      : n < 232
        ? hex(
            [
              Math.floor((n - 16) / 36),
              Math.floor((n - 16) / 6) % 6,
              (n - 16) % 6,
            ].reduce((v, c) => (v << 8) + (c ? 55 + 40 * c : 0), 0),
          )
        : hex((8 + 10 * (n - 232)) * 0x010101);
  const capture = async (name) => {
    let html = "";
    for (let y = 0; y < 38; y++) {
      html += '<div class="line">';
      const line = term.buffer.active.getLine(y);
      for (let x = 0; x < 140; x++) {
        const c = line.getCell(x);
        if (!c || c.getWidth() === 0) continue;
        let fg = c.isFgRGB()
          ? hex(c.getFgColor())
          : c.isFgPalette()
            ? palette(c.getFgColor())
            : "#e5eaff";
        let bg = c.isBgRGB()
          ? hex(c.getBgColor())
          : c.isBgPalette()
            ? palette(c.getBgColor())
            : "#0b1020";
        if (c.isInverse()) [fg, bg] = [bg, fg];
        html += `<span style="color:${fg};background:${bg};width:${c.getWidth() * 9.6}px;font-weight:${c.isBold() ? 600 : 400};opacity:${c.isDim() ? 0.65 : 1}">${escape(c.getChars() || " ")}</span>`;
      }
      html += "</div>";
    }
    await page.setContent(
      `<style>*{box-sizing:border-box}body{margin:0;background:#0b1020;padding:16px 48px;color:#96a3c1}header{font:11px Menlo,monospace;height:34px;display:flex;justify-content:space-between;align-items:center}.line{height:20px;white-space:pre;line-height:20px;font:16px/20px Menlo,"DejaVu Sans Mono",monospace}.line span{display:inline-block;height:20px;vertical-align:top}main{width:1344px}</style><header><span>devdevian tui</span><span>DEMONSTRATION WORKSPACE</span></header><main>${html}</main>`,
    );
    await page.screenshot({ path: `public/screenshots/${name}.png` });
    console.log("Captured " + name);
  };
  await wait("When does a side project");
  await capture("cli-feed");
  await command("/open " + review.id);
  await wait("A second pair of eyes");
  await send("v");
  await wait("idempotency key");
  await capture("cli-review");
  await command("/appearance");
  await wait("LIVE PREVIEW");
  await capture("cli-appearance");
} finally {
  child?.kill();
  term?.dispose();
  await browser?.close();
  await f.close();
  await rm(directory, { recursive: true, force: true });
}
