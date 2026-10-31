import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import { promisify } from "node:util";
import { loadConfig, originOf } from "./client.mjs";

const exec = promisify(execFile);
const defaultOrigin = "https://devdevian.vercel.app";

// A diagnostic report is safe to share: never include tokens, account data,
// local file contents, provider responses or arbitrary exception messages.
export async function runDoctor({
  host,
  offline = false,
  project = process.cwd(),
  runtime = process.versions.node,
  terminal = {
    tty: !!process.stdin.isTTY && !!process.stdout.isTTY,
    columns: process.stdout.columns,
    rows: process.stdout.rows,
  },
  loadSavedConfig = loadConfig,
  fetchImpl = fetch,
  gitVersion = () =>
    exec("git", ["--version"], { timeout: 2000, maxBuffer: 1024 }),
  checkProject = (path) => stat(path),
  signal,
} = {}) {
  const checks = [];
  const add = (id, status, message, action) =>
    checks.push({ id, status, message, ...(action ? { action } : {}) });
  add(
    "runtime",
    Number(runtime.split(".")[0]) >= 24 ? "ok" : "error",
    `Node.js ${/^\d+\.\d+\.\d+$/.test(runtime) ? runtime : "unknown"}`,
    Number(runtime.split(".")[0]) >= 24
      ? undefined
      : "Install Node.js 24 or newer.",
  );
  if (!terminal.tty)
    add(
      "terminal",
      "warn",
      "Non-interactive terminal; commands and JSON still work.",
      "Open an interactive terminal for devdevian tui.",
    );
  else if (terminal.columns < 60 || terminal.rows < 18)
    add(
      "terminal",
      "warn",
      "The live workspace needs at least 60 × 18 cells.",
      "Enlarge the terminal panel, then run devdevian tui.",
    );
  else add("terminal", "ok", "Interactive terminal is large enough.");
  try {
    if (!(await checkProject(project)).isDirectory()) throw Error();
    add(
      "workspace",
      "ok",
      "Workspace directory is available; no project files were read.",
    );
  } catch {
    add(
      "workspace",
      "error",
      "Workspace directory is unavailable.",
      "Choose an existing directory with --project PATH.",
    );
  }
  try {
    await gitVersion();
    add("git", "ok", "Git is available for local file and diff workflows.");
  } catch {
    add(
      "git",
      "warn",
      "Git is unavailable. Forum and public PR reads can still work.",
      "Install Git to use local repository context and git diff.",
    );
  }
  let config = null;
  try {
    config = await loadSavedConfig();
    add(
      "credentials",
      config ? "ok" : "warn",
      config
        ? "Saved credentials passed local validation."
        : "This terminal is not signed in.",
      config ? undefined : "Run devdevian login, then devdevian tui --start.",
    );
  } catch {
    add(
      "credentials",
      "error",
      "Saved credentials could not be safely loaded.",
      "Check credentials.json permissions (owner-only, 600) and format. Doctor leaves it unchanged; use devdevian login to reconnect.",
    );
  }
  let origin;
  try {
    origin = originOf(host || config?.origin || defaultOrigin);
  } catch {
    add(
      "origin",
      "error",
      "Invalid server address.",
      "Use an HTTPS origin without credentials, a path, query or fragment; loopback HTTP is allowed for development.",
    );
    return { schema: 1, origin: null, ok: false, checks };
  }
  add("origin", "ok", "Server address passed validation.");
  async function get(path, token) {
    const response = await fetchImpl(origin + "/api" + path, {
      method: "GET",
      redirect: "error",
      credentials: "omit",
      headers: {
        Accept: "application/json",
        ...(token ? { Authorization: "Bearer " + token } : {}),
      },
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(5000)])
        : AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw Object.assign(Error("HTTP response rejected"), {
        status: response.status,
      });
    }
    const chunks = [];
    let bytes = 0;
    for await (const chunk of response.body) {
      bytes += chunk.length;
      if (bytes > 65536) throw Error("Response limit");
      chunks.push(chunk);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  }
  if (offline) {
    add("health", "skipped", "Offline mode: server was not contacted.");
    add("session", "skipped", "Offline mode: saved session was not checked.");
  } else {
    let healthy = false;
    try {
      const health = await get("/health");
      if (
        health?.ok !== true ||
        typeof health.version !== "string" ||
        !/^\d+\.\d+\.\d+$/.test(health.version)
      )
        throw Error();
      healthy = true;
      add("health", "ok", `Devdevian API ${health.version} is reachable.`);
    } catch {
      if (signal?.aborted) throw signal.reason;
      add(
        "health",
        "error",
        "The server could not return a valid health response within five seconds.",
        "Check the selected address, connection and service status. Doctor does not retry requests.",
      );
    }
    // A host override must never send credentials for one server to another.
    if (!config)
      add("session", "skipped", "No valid saved credentials to check.");
    else if (config.origin !== origin)
      add(
        "session",
        "warn",
        "Saved credentials belong to a different server and were not sent.",
        "Run devdevian login --host " + origin + " to connect to this server.",
      );
    else if (!healthy)
      add(
        "session",
        "skipped",
        "Session check skipped because the server health check failed.",
      );
    else
      try {
        const result = await get("/me", config.token);
        if (!result?.user) throw Object.assign(Error(), { status: 401 });
        add("session", "ok", "This terminal has an active Devdevian session.");
      } catch (error) {
        if (signal?.aborted) throw signal.reason;
        add(
          "session",
          "error",
          error.status === 401
            ? "Session expired or was revoked."
            : "Session could not be checked.",
          error.status === 401
            ? "Run devdevian login to reconnect. Existing local drafts are kept."
            : "Try doctor again when the service is available; do not repeat an uncertain publication.",
        );
      }
  }
  return {
    schema: 1,
    origin,
    ok: !checks.some((c) => c.status === "error"),
    checks,
  };
}

export function doctorLines(report) {
  return [
    "CONNECTION CHECK · read-only",
    report.origin ? "Server: " + report.origin : "Server: invalid address",
    "",
    ...report.checks.flatMap((c) => [
      `${{ ok: "PASS", warn: "NOTE", error: "FAIL", skipped: "SKIP" }[c.status]} · ${c.message}`,
      ...(c.action ? ["  Next: " + c.action] : []),
      "",
    ]),
    report.ok
      ? "Checks complete. Notes above may still need attention."
      : "Checks found a problem. Follow the next steps above.",
    "No settings or files were changed. No requests were retried.",
  ];
}

export const starterChoices = [
  {
    id: "feed",
    title: "Explore the public feed",
    detail: "Read a conversation before writing your first one.",
  },
  {
    id: "ask",
    title: "Ask your first question",
    detail: "Write context, choose a topic, then preview before publishing.",
  },
  {
    id: "pr",
    title: "Review a public GitHub PR",
    detail:
      "Paste a PR URL. F chooses files; A collects hunks; R composes a review.",
  },
  {
    id: "doctor",
    title: "Check my connection",
    detail: "Inspect the environment and session without changing anything.",
  },
  {
    id: "help",
    title: "Learn the keyboard controls",
    detail: "Tab changes focus; arrows select; Enter opens; Esc returns.",
  },
];
