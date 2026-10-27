#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import packageInfo from "../package.json" with { type: "json" };
import { parseArgs } from "node:util";
import { readFile } from "node:fs/promises";
import { hostname } from "node:os";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { setTimeout as delay } from "node:timers/promises";
import {
  client,
  originOf,
  loadConfig,
  saveConfig,
  removeConfig,
  clean,
} from "../lib/client.mjs";
import { editExternal } from "../lib/external-editor.mjs";
import {
  appearanceFields,
  appearanceFlags,
  defaultAppearance,
  loadAppearance,
  saveAppearance,
} from "../lib/appearance.mjs";
const version = packageInfo.version;
const options = {
  host: { type: "string" },
  page: { type: "string" },
  topic: { type: "string" },
  community: { type: "string" },
  title: { type: "string" },
  body: { type: "string" },
  "body-file": { type: "string" },
  file: { type: "string" },
  lines: { type: "string" },
  focus: { type: "string" },
  "start-line": { type: "string" },
  "end-line": { type: "string" },
  status: { type: "string" },
  revision: { type: "string" },
  "reply-id": { type: "string" },
  name: { type: "string" },
  project: { type: "string" },
  yes: { type: "boolean" },
  json: { type: "boolean" },
  editor: { type: "boolean" },
  "no-open": { type: "boolean" },
  "no-live": { type: "boolean" },
  ...Object.fromEntries(
    appearanceFields.map((field) => [
      field.key === "reviewLayout" ? "review-layout" : field.key,
      { type: "string" },
    ]),
  ),
  reset: { type: "boolean" },
  help: { type: "boolean", short: "h" },
  version: { type: "boolean", short: "v" },
};
let terminal;
const prompt = async (question, fallback = "") => {
  if (!process.stdin.isTTY)
    throw Error(
      "Interactive input needs a terminal. Provide command flags instead.",
    );
  terminal ??= createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const answer = await terminal.question(
    question + (fallback ? ` [${fallback}]` : "") + ": ",
  );
  return answer.trim() || fallback;
};
const out = (value) => {
  const text = clean(value);
  process.stdout.write(
    (process.stdout.isTTY &&
    !process.env.NO_COLOR &&
    /^(DEVDEVIAN|Devdevian ·|Publication preview)/.test(text.trimStart())
      ? "\x1b[38;5;141m" + text + "\x1b[0m"
      : text) + "\n",
  );
};
const positive = (value, label = "ID") => {
  if (!/^[1-9]\d*$/.test(String(value)) || !Number.isSafeInteger(Number(value)))
    throw Error(label + " must be a positive integer.");
  return Number(value);
};
const help = `Devdevian CLI ${version} · alpha

  devdevian                       Live terminal workspace
  devdevian tui                   Live workspace in this terminal
  devdevian open                  Open the workspace in a new terminal window
  devdevian login                 Authorize in your browser
  devdevian logout                Revoke this terminal
  devdevian appearance             Show local theme and layout preferences
  devdevian appearance --theme daylight --accent violet
  devdevian appearance --reset     Restore the default appearance
  devdevian whoami
  devdevian inbox [--page 2]
  devdevian feed [--topic web] [--page 2]
  devdevian search "retry strategies"
  devdevian conversation open POST_ID
  devdevian ask --title "..." --body-file question.md --topic web
  devdevian reply POST_ID --body "..." [--editor]
  devdevian review create --file src/retry.ts --lines 20:65 --title "..." --focus "..."
  devdevian review list POST_ID [--status open]
  devdevian review comment POST_ID --start-line 2 --end-line 4 --body "..."
  devdevian review thread POST_ID REVIEW_ID [--page 2]
  devdevian review reply POST_ID REVIEW_ID --body "..."
  devdevian review resolve POST_ID REVIEW_ID
  devdevian review reopen POST_ID REVIEW_ID
  devdevian communities [--page 2]

  --theme NAME       midnight | nebula | daylight | contrast
  --accent NAME      blue | violet | cyan | rose
  --density NAME     comfortable | compact
  --sidebar MODE     auto | hidden (Tab opens navigation)
  --review-layout MODE  auto | stacked
  --frame STYLE      round | single
  --motion MODE      subtle | reduced
  --no-live          Disable background reads in the live workspace
  --project PATH     Root directory for the live file/diff picker (default: current directory)
  --community ID     Publish to an approved private community
  --editor           Write text in $VISUAL / $EDITOR
  --json             Machine-readable output
  --yes              Explicitly publish without an interactive confirmation
  --host ORIGIN      Select server when logging in (HTTPS; loopback HTTP for development)

Only files you explicitly select are read. Code/text is previewed before publishing.
Credentials are stored locally with restricted file permissions; revoke access in Settings.
`;
async function editor(initial = "") {
  if (!process.stdin.isTTY || !process.stdout.isTTY)
    throw Error("--editor needs an interactive terminal.");
  terminal?.pause();
  try {
    return await editExternal(initial);
  } finally {
    terminal?.resume();
  }
}
async function boundedFile(file, max) {
  const data = await readFile(file);
  if (data.length > max * 4)
    throw Error(`File is too large (limit ${max} characters).`);
  const text = data.toString("utf8");
  if (text.includes("\u0000") || text.includes("\ufffd") || text.length > max)
    throw Error(`Choose a UTF-8 text file with at most ${max} characters.`);
  return text;
}
async function message(flags, initial = "") {
  if (flags["body-file"]) return boundedFile(flags["body-file"], 15000);
  if (flags.editor || (!flags.body && process.stdin.isTTY))
    return editor(flags.body || initial);
  if (!flags.body) throw Error("Provide --body, --body-file, or --editor.");
  return flags.body;
}
function show(data, json, kind = "posts") {
  if (json) {
    process.stdout.write(JSON.stringify(data) + "\n");
    return;
  }
  const items = data.items || data;
  if (Array.isArray(items)) {
    if (!items.length) out("Nothing here yet.");
    for (const item of items) {
      if (kind === "inbox")
        out(
          `${item.read_at ? " " : "●"} #${item.id} ${item.actor_name} · ${item.type}\n  ${item.post_title || ""}\n  ${item.post_id ? "Post " + item.post_id : ""}${item.code_review_id ? " · review " + item.code_review_id : ""}${item.feedback_reply_id ? " · reply " + item.feedback_reply_id : ""}`,
        );
      else if (kind === "reviews")
        out(
          `#${item.id} · ${item.resolved ? "resolved" : "open"} · lines ${item.start_line}–${item.end_line}${item.outdated ? " · earlier snippet" : ""}\n${item.deleted_at ? "[deleted]" : item.body}\n${item.quote || ""}`,
        );
      else if (kind === "replies")
        out(
          `#${item.id} · ${item.name || ""}\n${item.deleted_at ? "[deleted]" : item.body}`,
        );
      else
        out(
          `#${item.id} ${item.title || item.name || ""}${item.kind ? " · " + item.kind : ""}${item.topic ? " · #" + item.topic : ""}`,
        );
    }
    if (data.pagination)
      out(
        `Page ${data.pagination.page}/${data.pagination.pages || 1} · ${data.pagination.total} results`,
      );
  } else if (data.title) {
    out(`#${data.id} · ${data.kind}\n${data.title}\n\n${data.body}`);
    if (data.code) out("\nCode:\n" + data.code);
  } else out(JSON.stringify(data, null, 2));
}
async function confirm(payload, flags) {
  if (flags.yes) return;
  out("\nPublication preview");
  out(JSON.stringify(payload, null, 2));
  out(
    "Audience: " +
      (payload.community_id
        ? "private community " + payload.community_id
        : "PUBLIC feed"),
  );
  if (
    (await prompt("Publish this content? (yes/no)", "no")).toLowerCase() !==
    "yes"
  )
    throw Error("Cancelled. Nothing was published.");
}
function openBrowser(url) {
  const args =
    process.platform === "darwin"
      ? ["open", [url]]
      : process.platform === "win32"
        ? ["rundll32", ["url.dll,FileProtocolHandler", url]]
        : ["xdg-open", [url]];
  const child = spawn(args[0], args[1], {
    stdio: "ignore",
    detached: true,
    shell: false,
  });
  child.on("error", () => {});
  child.unref();
}
async function login(flags) {
  const origin = originOf(flags.host || "https://devdevian.vercel.app"),
    api = client(origin);
  const device = await api("/cli/device", {
    method: "POST",
    body: { name: flags.name || `Devdevian CLI · ${hostname()}` },
  });
  if (new URL(device.verification_uri).origin !== origin)
    throw Error("The server returned an unexpected authorization address.");
  out(
    `Open ${device.verification_uri}\nConfirm code: ${device.user_code}\nWaiting for browser approval…`,
  );
  if (!flags["no-open"]) openBrowser(device.verification_uri);
  const until = Date.now() + Math.min(device.expires_in, 600) * 1000;
  while (Date.now() < until) {
    await delay(Math.max(5, Number(device.interval) || 5) * 1000);
    const result = await api("/cli/token", {
      method: "POST",
      body: { device_code: device.device_code },
    });
    if (result.pending) continue;
    await saveConfig({
      origin,
      token: result.access_token,
      expires_at: result.expires_at,
    });
    out("Connected. Run devdevian to open your workspace.");
    return;
  }
  throw Error("Login expired. Run devdevian login again.");
}
async function execute(args, flags) {
  if (flags.help) {
    out(help);
    return;
  }
  if (flags.version) {
    out(version);
    return;
  }
  const command = args[0];
  if (command === "appearance") {
    const loaded = await loadAppearance(),
      updates = appearanceFlags(flags);
    if (flags.reset && Object.keys(updates).length)
      throw Error("Use --reset on its own, or choose appearance options.");
    if (loaded.warning) process.stderr.write(loaded.warning + "\n");
    const settings = flags.reset
      ? await saveAppearance(defaultAppearance)
      : Object.keys(updates).length
        ? await saveAppearance({ ...loaded.settings, ...updates })
        : loaded.settings;
    out(JSON.stringify(settings, null, 2));
    return;
  }
  if (command === "login") return login(flags);
  const config = await loadConfig();
  if (!config) throw Error("Sign in first: devdevian login");
  if (flags.host && originOf(flags.host) !== config.origin)
    throw Error(
      "Saved credentials belong to a different server. Run login --host for that server.",
    );
  const api = client(config.origin, config.token),
    page = positive(flags.page || "1", "Page");
  if (command === "logout") {
    try {
      await api("/cli/logout", { method: "POST", body: {} });
    } catch (e) {
      if (e.status !== 401) throw e;
    }
    await removeConfig();
    out("This terminal has been disconnected.");
    return;
  }
  if (command === "whoami") {
    const data = await api("/me");
    show(
      flags.json
        ? data
        : {
            account: "@" + data.user.username,
            name: data.user.name,
            server: config.origin,
          },
      flags.json,
    );
    return;
  }
  if (command === "inbox") {
    show(await api("/notifications?page=" + page), flags.json, "inbox");
    return;
  }
  if (command === "feed") {
    const query = new URLSearchParams({
      page: String(page),
      limit: "12",
      ...(flags.topic ? { topic: flags.topic } : {}),
    });
    show(await api("/posts?" + query), flags.json);
    return;
  }
  if (command === "communities") {
    show(await api("/communities?page=" + page + "&limit=12"), flags.json);
    return;
  }
  if (command === "search") {
    const query = args.slice(1).join(" ") || (await prompt("Search"));
    show(
      await api("/search?q=" + encodeURIComponent(query) + "&page=" + page),
      flags.json,
    );
    return;
  }
  if (command === "conversation" && args[1] === "open") {
    const id = positive(args[2]);
    show(await api("/posts/" + id), flags.json);
    if (!flags.json) {
      out("\nReplies:");
      show(await api(`/posts/${id}/replies?page=${page}`), false, "replies");
    }
    return;
  }
  if (command === "ask" || (command === "review" && args[1] === "create")) {
    const review = command === "review";
    let code = "";
    if (review) {
      const file = flags.file || (await prompt("Code file"));
      code = await boundedFile(file, 20000);
      if (flags.lines) {
        const m = flags.lines.match(/^(\d+):(\d+)$/);
        if (!m) throw Error("Use --lines START:END.");
        const lines = code.split("\n"),
          start = positive(m[1]),
          end = positive(m[2]);
        if (end < start || end > lines.length)
          throw Error("The selected range is outside the file.");
        code = lines.slice(start - 1, end).join("\n");
      }
    }
    const payload = {
      kind: review ? "review" : "question",
      topic: flags.topic || (await prompt("Topic ID", "web")),
      title: flags.title || (await prompt("Title")),
      body: await message(
        flags,
        review
          ? "Explain what the code does and the help you need."
          : "Describe the problem, expected behavior, and what you tried.",
      ),
      ...(flags.community ? { community_id: flags.community } : {}),
    };
    if (review) {
      payload.code = code;
      payload.review_focus =
        flags.focus || (await prompt("What should reviewers focus on?"));
    }
    await confirm(payload, flags);
    const result = await api("/posts", { method: "POST", body: payload });
    show(result, flags.json);
    if (!flags.json) out(config.origin + "/app#post/" + result.id);
    return;
  }
  if (command === "reply") {
    const id = positive(args[1]),
      body = await message(flags);
    const parent = await api("/posts/" + id);
    await confirm(
      { post_id: id, community_id: parent.community_id || null, body },
      flags,
    );
    show(
      await api(`/posts/${id}/replies`, { method: "POST", body: { body } }),
      flags.json,
    );
    return;
  }
  if (command === "review") {
    const action = args[1],
      post = positive(args[2]);
    if (action === "list") {
      show(
        await api(
          `/posts/${post}/code-reviews?page=${page}${flags.status ? "&status=" + encodeURIComponent(flags.status) : ""}`,
        ),
        flags.json,
        "reviews",
      );
      return;
    }
    if (action === "comment") {
      const current = await api(`/posts/${post}/code-reviews`),
        payload = {
          body: await message(flags),
          start_line: positive(flags["start-line"], "Start line"),
          end_line: positive(
            flags["end-line"] || flags["start-line"],
            "End line",
          ),
          snippet_hash: current.snippet_hash,
        };
      const parent = await api("/posts/" + post);
      await confirm(
        {
          post_id: post,
          community_id: parent.community_id || null,
          ...payload,
        },
        flags,
      );
      show(
        await api(`/posts/${post}/code-reviews`, {
          method: "POST",
          body: payload,
        }),
        flags.json,
      );
      return;
    }
    const id = positive(args[3]),
      url = `/posts/${post}/code-reviews/${id}`;
    if (action === "thread") {
      show(await api(url + "/replies?page=" + page), flags.json, "replies");
      return;
    }
    if (action === "reply") {
      const body = await message(flags);
      const parent = await api("/posts/" + post);
      await confirm(
        {
          post_id: post,
          community_id: parent.community_id || null,
          review_id: id,
          body,
        },
        flags,
      );
      show(
        await api(url + "/replies", { method: "POST", body: { body } }),
        flags.json,
      );
      return;
    }
    if (["resolve", "reopen"].includes(action)) {
      const data = await api(`/posts/${post}/code-reviews?target_id=${id}`),
        item = data.items.find((c) => c.id === id);
      if (!item) throw Error("Feedback not found.");
      show(
        await api(url, {
          method: "PATCH",
          body: { revision: item.revision, resolved: action === "resolve" },
        }),
        flags.json,
      );
      return;
    }
  }
  throw Error("Unknown command. Run devdevian --help.");
}

try {
  const { values, positionals } = parseArgs({
    options,
    allowPositionals: true,
    strict: true,
  });
  if (!positionals.length && !values.help && !values.version)
    await (await import("../lib/tui.mjs")).startTui(values);
  else if (positionals[0] === "tui")
    await (await import("../lib/tui.mjs")).startTui(values);
  else if (positionals[0] === "open") {
    const args = [];
    for (const key of [
      "host",
      "name",
      "project",
      ...appearanceFields.map((field) =>
        field.key === "reviewLayout" ? "review-layout" : field.key,
      ),
    ])
      if (values[key]) args.push("--" + key, values[key]);
    if (values["no-open"]) args.push("--no-open");
    if (values["no-live"]) args.push("--no-live");
    await (
      await import("../lib/window.mjs")
    ).openWindow({ entry: fileURLToPath(import.meta.url), args });
    out("Devdevian opened in a separate terminal window.");
  } else await execute(positionals, values);
} catch (e) {
  process.stderr.write("Devdevian: " + clean(e.message) + "\n");
  process.exitCode = 1;
} finally {
  terminal?.close();
}
