#!/usr/bin/env node
import { extensionPublication } from "../lib/extensions.mjs";
import {
  participationPlan,
  participationPayload,
} from "../lib/project-access.mjs";
import {
  githubWorkPlan,
  githubTaskRoot,
  githubTaskLines,
} from "../lib/github-work.mjs";
import {
  contributionRoot,
  requireContributions,
  contributionSubmitPlan,
  contributionDecisionPlan,
  contributionPayload,
} from "../lib/contributions.mjs";
import {
  loadRoom,
  requireRoom,
  roomTaskPlan,
  roomDecisionPlan,
} from "../lib/rooms.mjs";
import {
  flowPage,
  flowRequest,
  flowActionPlan,
  flowOutcomePlan,
  flowInvitePlan,
  flowID,
} from "../lib/review-flow.mjs";
import {
  ProjectBinding,
  loadWorkspace,
  requestPlan,
  revisionBase,
  revisionFiles,
  revisionPlan,
  feedbackAnchor,
  workspaceId,
} from "../lib/project-workspace.mjs";
import { loadReviewQueue } from "../lib/review-queue.mjs";
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
import { selectPRHunks, combinePRSelections } from "../lib/pr-diff.mjs";
import { connectedGitHubReader, githubList } from "../lib/github-connected.mjs";
import { githubReader, pullRequestLines } from "../lib/github-reader.mjs";
import { readGitHubContext, workspaceRoot } from "../lib/workspace.mjs";
import { githubContextLines } from "../lib/github-context.mjs";
import { conversationLinks } from "../lib/conversation-links.mjs";
import { workQuery, loadWork } from "../lib/my-work.mjs";
import { RecentStore } from "../lib/recent.mjs";
import { DraftStore } from "../lib/drafts.mjs";
import { runDoctor, doctorLines } from "../lib/doctor.mjs";
import { commandProblemMessage } from "../lib/problems.mjs";
import { renderHelp } from "../lib/help.mjs";
const version = packageInfo.version;
const options = {
  host: { type: "string" },
  page: { type: "string" },
  port: { type: "string" },
  topic: { type: "string" },
  section: { type: "string" },
  mode: { type: "string" },
  members: { type: "string" },
  state: { type: "string" },
  query: { type: "string" },
  community: { type: "string" },
  title: { type: "string" },
  body: { type: "string" },
  "body-file": { type: "string" },
  file: { type: "string" },
  lines: { type: "string" },
  focus: { type: "string" },
  "github-context": { type: "boolean" },
  pr: { type: "string" },
  connected: { type: "boolean" },
  "share-private": { type: "boolean" },
  contribution: { type: "string" },
  repository: { type: "string" },
  installation: { type: "string" },
  hunks: { type: "string" },
  selections: { type: "string" },
  "start-line": { type: "string" },
  "end-line": { type: "string" },
  status: { type: "string" },
  revision: { type: "string" },
  "reply-id": { type: "string" },
  name: { type: "string" },
  username: { type: "string" },
  verdict: { type: "string" },
  snapshot: { type: "string" },
  remark: { type: "string" },
  project: { type: "string" },
  mine: { type: "boolean" },
  archived: { type: "boolean" },
  "related-post": { type: "string" },
  yes: { type: "boolean" },
  json: { type: "boolean" },
  editor: { type: "boolean" },
  "no-open": { type: "boolean" },
  "no-live": { type: "boolean" },
  offline: { type: "boolean" },
  start: { type: "boolean" },
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
  devdevian doctor [--offline] [--json]  Read-only environment and connection checks
  devdevian tui --start           Open the getting-started guide
  devdevian login                 Authorize in your browser
  devdevian logout                Revoke this terminal
  devdevian appearance             Show local theme and layout preferences
  devdevian appearance --theme daylight --accent violet
  devdevian appearance --reset     Restore the default appearance
  devdevian assigned [--section waiting|accepted|sent|completed] [--page 2]
  devdevian review requests POST_ID
  devdevian review invite POST_ID --username USER [--body "..."]
  devdevian review accept POST_ID REQUEST_ID
  devdevian review decline POST_ID REQUEST_ID
  devdevian review cancel POST_ID REQUEST_ID
  devdevian review outcome POST_ID REQUEST_ID --verdict changes_requested --body "..."
  devdevian review link POST_ID --snapshot ID --remark ID [--body "..."]
  devdevian review links POST_ID
  devdevian workspace activity PROJECT_ID
  devdevian reviews [--section open|awaiting] [--page 2]
  devdevian work [--section attention|tasks|results|continue|mine|reviews|saved|following] [--page 2]
  devdevian room [PROJECT_ID] [--state open|in_progress|ready] [--mine]
  devdevian contributions PROJECT_ID [--page 2]
  devdevian contributions submit PROJECT_ID POST_ID --body "..." [--pr PR_URL]
  devdevian contributions accept|changes|withdraw PROJECT_ID CONTRIBUTION_ID --body "..."
  devdevian contributions history PROJECT_ID CONTRIBUTION_ID
  devdevian room import PROJECT_ID ISSUE_URL [--share-private]
  devdevian room link-pr PROJECT_ID POST_ID PR_URL [--contribution ID] [--share-private]
  devdevian room github PROJECT_ID POST_ID [--json]
  devdevian room github-history PROJECT_ID POST_ID [--page 2]
  devdevian room decisions PROJECT_ID [--archived]
  devdevian room activity PROJECT_ID
  devdevian room claim|release|assign|state PROJECT_ID POST_ID [--username NAME] [--state ready]
  devdevian room decision pin|edit|archive|restore PROJECT_ID [DECISION_ID] --title "..." --body "..."
  devdevian room decision history PROJECT_ID DECISION_ID
  devdevian workspace [PROJECT_ID] [--state open|in_progress|ready]
  devdevian workspace bind PROJECT_ID     Link this directory locally (explicit confirmation)
  devdevian workspace unbind              Remove only the local association
  devdevian workspace link POST_ID [--state open]
  devdevian workspace state POST_ID --state ready
  devdevian workspace unlink POST_ID
  devdevian review versions POST_ID [--page 2]
  devdevian review snapshot POST_ID SNAPSHOT_ID
  devdevian review revise POST_ID --file src/retry.ts --focus "..."
  devdevian review revise POST_ID --selections files.json --focus "..."
  devdevian whoami
  devdevian inbox [--page 2]
  devdevian feed [--topic web] [--page 2]
  devdevian extensions init my-extension
  devdevian extensions dev my-extension [--port 4188] [--no-open]
  devdevian extensions pack my-extension
  devdevian extensions updates
  devdevian extensions update INSTALLED_RELEASE_ID [--yes]
  devdevian extensions history SLUG
  devdevian extensions list [--query focus] [--page 2]
  devdevian extensions mine
  devdevian extensions publish --file my-extension.devext.json [--yes]
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
  devdevian participation PROJECT_ID [--json]
  devdevian participation set PROJECT_ID --mode approved --members "alice,bob"
  devdevian communities [--page 2]
  devdevian github connect                  Connect the GitHub App in your browser
  devdevian github status
  devdevian github installations
  devdevian github repositories --installation ID
  devdevian github pulls|issues --repository https://github.com/owner/repo
  devdevian github checks PR_URL
  devdevian github pr PR_URL --connected    Use your GitHub App access (including private PRs)
  devdevian github diff PR_URL --connected --file src/retry.ts
  devdevian github pr https://github.com/owner/repo/pull/42 [--page 2]
  devdevian github diff PR_URL --file src/retry.ts [--page 2]
  devdevian github review PR_URL --file src/retry.ts --hunks 1:2 --title "..." --focus "..." --body "..."
  devdevian github review PR_URL --selections selections.json --title "..." --focus "..." --body "..."

  Inside the workspace: /projects, /project ID, /events, /event ID
  Ctrl+K or /actions opens quick actions; type to filter
  Ctrl+N / Ctrl+P moves between form steps; Ctrl+S validates and previews
  Forms: Tab fields/buttons, Enter selects Back/Next or adds a line in multiline text
  Full reply text: / find, n/N matches, Home/End, Esc remembers your place
  N creates · F filters · E edits your publication · X opens context actions

  --theme NAME       midnight | nebula | daylight | contrast | halloween
  --accent NAME      blue | violet | cyan | rose | orange
  --density NAME     comfortable | compact
  --sidebar MODE     auto | hidden (Tab opens navigation)
  --review-layout MODE  auto | stacked
  --frame STYLE      round | single
  --motion MODE      subtle | reduced
  --welcome MODE     on | off (Devi greeting)
  --no-live          Disable background reads in the live workspace
  --project PATH     Root directory for the live file/diff picker (default: current directory)
  --github-context   Include local GitHub origin, branch and base commit in a review
  --pr URL           Optional matching GitHub PR URL (requires --github-context)
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
  if (kind === "work") for (const warning of data.warnings || []) out(warning);
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
      else if (kind === "flow")
        out(
          `#${item.id} · post #${item.post_id} · @${item.reviewer_username} · ${item.state} · v${item.revision_number}\n${item.outcome_body || item.message || ""}`,
        );
      else if (kind === "revisions")
        out(
          `v${item.number} · snapshot #${item.id} · ${item.files.length} file(s) · ${item.created}\n${item.review_focus || ""}`,
        );
      else if (kind === "workspace")
        out(
          `#${item.id} ${item.title} · ${item.state.replaceAll("_", " ")} · ${item.kind}`,
        );
      else if (kind === "work" && item.type)
        out(
          `#${item.id} ${item.title}\n  ${item.action || "Open item"}${item.state ? " · " + item.state.replaceAll("_", " ") : ""}${item.project_name ? " · " + item.project_name : ""}${item.community_id ? " · Private" : ""}`,
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
    for (const line of githubContextLines(data.github_context)) out(line);
    for (const link of conversationLinks(data))
      out(link.label + " · " + link.url);
  } else out(JSON.stringify(data, null, 2));
}
async function confirm(payload, flags) {
  if (flags.yes) return;
  out("\nPublication preview");
  out(JSON.stringify(payload, null, 2));
  if (!payload.local_only)
    out(
      "Audience: " +
        (payload.audience ||
          (payload.community_id
            ? "private community " + payload.community_id
            : "PUBLIC feed")),
    );
  if (
    (
      await prompt(
        payload.local_only
          ? "Save this local association? (yes/no)"
          : "Confirm this change? (yes/no)",
        "no",
      )
    ).toLowerCase() !== "yes"
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
    out(
      "Connected. Run devdevian to open your workspace. New here? Run devdevian tui --start.",
    );
    return;
  }
  throw Error("Login expired. Run devdevian login again.");
}
async function execute(args, flags) {
  if (flags.help) {
    process.stdout.write(
      renderHelp(help, {
        tty: !!process.stdout.isTTY,
        columns: process.stdout.columns || 80,
        noColor:
          process.env.NO_COLOR !== undefined || process.env.TERM === "dumb",
        json: !!flags.json,
      }) + "\n",
    );
    return;
  }
  if (flags.version) {
    out(version);
    return;
  }
  const command = args[0];
  if (command === "doctor") {
    const report = await runDoctor({
      host: flags.host,
      offline: !!flags.offline,
      project: flags.project,
    });
    if (flags.json)
      process.stdout.write(
        JSON.stringify({ cli_version: version, ...report }) + "\n",
      );
    else out(`Devdevian CLI ${version}\n\n` + doctorLines(report).join("\n"));
    if (!report.ok) process.exitCode = 1;
    return;
  }
  const readingGitHub =
    command === "github" && ["pr", "diff"].includes(args[1]);
  if (readingGitHub && flags.connected) {
    const c = await loadConfig();
    if (!c?.token) throw Error("Sign in to Devdevian first.");
    const a = client(c.origin, c.token),
      reader = connectedGitHubReader(a);
    const d =
      args[1] === "diff"
        ? await reader.loadDiff(args[2], {
            page: positive(flags.page || "1"),
            path: flags.file,
          })
        : await reader.load(args[2], { page: positive(flags.page || "1") });
    if (flags.json) process.stdout.write(JSON.stringify(d) + "\n");
    else
      out(
        args[1] === "diff"
          ? d.title +
              "\n" +
              (d.patch.reason ||
                d.patch.hunks.map((h) => h.lines.join("\n")).join("\n"))
          : pullRequestLines(d).join("\n"),
      );
    return;
  }
  if (command === "github" && args[1] === "diff") {
    const data = await githubReader.loadDiff(args[2], {
      page: positive(flags.page || "1", "Page"),
      path: flags.file,
    });
    if (flags.json) process.stdout.write(JSON.stringify(data) + "\n");
    else
      out(
        data.title +
          "\nHead: " +
          data.pull.commit +
          "\nBase: " +
          data.pull.base_commit +
          "\n\n" +
          (data.patch.reason ||
            data.patch.hunks
              .map((h, i) => `HUNK ${i + 1}\n` + h.lines.join("\n"))
              .join("\n\n")),
      );
    return;
  }
  if (command === "github" && args[1] === "pr") {
    const data = await githubReader.load(args[2], {
      page: positive(flags.page || "1", "Page"),
    });
    if (flags.json) process.stdout.write(JSON.stringify(data) + "\n");
    else out(data.title + "\n\n" + pullRequestLines(data).join("\n"));
    return;
  }
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
  if (command === "extensions" && ["init", "pack", "dev"].includes(args[1])) {
    const tools = await import("../lib/extension-tools.mjs"),
      directory = args[2] || (args[1] === "init" ? null : ".");
    if (!directory) throw Error("Use extensions init my-extension.");
    if (args[1] === "init")
      show(await tools.initExtension(directory), flags.json);
    else if (args[1] === "pack")
      show(await tools.packExtension(directory), flags.json);
    else {
      const port = Number(flags.port || "4188");
      if (!Number.isInteger(port) || port < 1 || port > 65535)
        throw Error("Use a port from 1 to 65535.");
      const server = await tools.serveExtension(directory, { port });
      out(
        "Local SDK playground: " +
          server.origin +
          "\nSample UI and data only. No account or production connection. Review capabilities and start preview. Ctrl+C to stop.",
      );
      if (!flags["no-open"]) openBrowser(server.origin);
      process.once("SIGINT", async () => {
        await server.close();
        process.exit(0);
      });
      process.once("SIGTERM", async () => {
        await server.close();
        process.exit(0);
      });
    }
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
  if (command === "assigned") {
    show(
      await flowPage(api, flags.section || "waiting", page),
      flags.json,
      "flow",
    );
    return;
  }
  if (command === "workspace" && args[1] === "activity") {
    show(
      await api(`/projects/${flowID(args[2])}/review-activity?page=${page}`),
      flags.json,
    );
    return;
  }
  if (
    command === "review" &&
    [
      "requests",
      "invite",
      "accept",
      "decline",
      "cancel",
      "outcome",
      "link",
      "links",
    ].includes(args[1])
  ) {
    const post = flowID(args[2]),
      action = args[1];
    let plan;
    if (action === "requests") {
      show(
        await api(`/posts/${post}/review-flow?page=${page}`),
        flags.json,
        "flow",
      );
      return;
    }
    if (action === "links") {
      show(await api(`/posts/${post}/revision-links?page=${page}`), flags.json);
      return;
    }
    if (action === "invite")
      plan = await flowInvitePlan(api, post, flags.username, flags.body || "");
    else if (action === "link") {
      const parent = await api(`/posts/${post}`);
      plan = {
        url: `/posts/${post}/revision-links`,
        method: "POST",
        payload: {
          snapshot_id: flowID(flags.snapshot),
          review_id: flowID(flags.remark),
          body: flags.body || "",
        },
        audience: parent.community_id
          ? "Private community"
          : "Public conversation",
      };
    } else {
      const row = await flowRequest(api, post, args[3]);
      plan =
        action === "outcome"
          ? flowOutcomePlan(row, flags.verdict, await message(flags))
          : flowActionPlan(row, action);
    }
    await confirm({ audience: plan.audience, ...plan.payload }, flags);
    show(
      await api(plan.url, { method: plan.method, body: plan.payload }),
      flags.json,
    );
    return;
  }
  const reviewGitHubReader = flags.connected
    ? connectedGitHubReader(api)
    : githubReader;
  if (
    command === "github" &&
    [
      "connect",
      "status",
      "installations",
      "repositories",
      "pulls",
      "issues",
      "checks",
    ].includes(args[1])
  ) {
    const kind = args[1];
    if (kind === "connect") {
      const url = config.origin + "/app#github";
      out("Connect the GitHub App in your browser: " + url);
      if (!flags["no-open"]) openBrowser(url);
      return;
    }
    if (kind === "status") {
      show(await api("/github/status"), flags.json);
      return;
    }
    if (kind === "checks") {
      const data = await connectedGitHubReader(api).load(args[2]);
      const root =
        "/repos" +
        new URL(data.pull.repository).pathname +
        "/commits/" +
        data.pull.commit;
      const [runs, states] = await Promise.all([
        api(
          "/github/read?" +
            new URLSearchParams({ path: root + "/check-runs?per_page=20" }),
        ),
        api(
          "/github/read?" +
            new URLSearchParams({ path: root + "/status?per_page=20" }),
        ),
      ]);
      show(
        {
          commit: data.pull.commit,
          checks: runs.data.check_runs,
          status: states.data,
        },
        flags.json,
      );
      return;
    }
    const d = await githubList(api, kind, {
      repository: flags.repository,
      installation: flags.installation,
      page,
    });
    show(d, flags.json);
    return;
  }
  if (command === "contributions") {
    const action = args[1];
    if (["submit", "accept", "changes", "withdraw"].includes(action)) {
      const project = workspaceId(args[2]);
      const plan =
        action === "submit"
          ? await contributionSubmitPlan(api, project, args[3])
          : await contributionDecisionPlan(
              api,
              project,
              args[3],
              {
                accept: "accepted",
                changes: "changes_requested",
                withdraw: "withdrawn",
              }[action],
            );
      const values = {
        ...plan.values,
        body: await message(flags, plan.values.body),
      };
      if (action === "submit") values.pr = flags.pr || values.pr;
      const prepared = await contributionPayload(api, plan, values);
      await confirm(
        {
          audience: plan.audience,
          ...prepared.payload,
          ...(prepared.pull ? { checked_public_pr: prepared.pull } : {}),
        },
        flags,
      );
      show(
        await api(plan.url, { method: plan.method, body: prepared.payload }),
        flags.json,
      );
      return;
    }
    const project = workspaceId(action === "history" ? args[2] : action);
    show(
      requireContributions(
        await api(
          contributionRoot(project) +
            (action === "history" ? `/${workspaceId(args[3])}/history` : "") +
            `?page=${page}`,
        ),
      ),
      flags.json,
    );
    return;
  }
  if (command === "room") {
    const action = args[1];
    if (action === "github-history") {
      show(
        await api(githubTaskRoot(args[2], args[3]) + "/history?page=" + page),
        flags.json,
      );
      return;
    }
    if (action === "github") {
      const data = await api(githubTaskRoot(args[2], args[3]));
      if (flags.json) show(data, true);
      else for (const line of githubTaskLines(data)) out(line);
      return;
    }
    if (["import", "link-pr"].includes(action)) {
      const plan = await githubWorkPlan(
        api,
        args[2],
        action === "link-pr" ? args[3] : null,
        action === "link-pr" ? args[4] : args[3],
        {
          contribution: flags.contribution,
          sharePrivate: !!flags["share-private"],
        },
      );
      await confirm(
        { audience: plan.audience, source: plan.ticket, ...plan.payload },
        flags,
      );
      show(
        await api(plan.url, { method: plan.method, body: plan.payload }),
        flags.json,
      );
      return;
    }
    if (["claim", "release", "assign", "state"].includes(action)) {
      const plan = await roomTaskPlan(api, args[2], args[3], action, {
        username: flags.username,
        state: flags.state,
      });
      await confirm(
        {
          audience: plan.audience,
          ...plan.payload,
          project_id: args[2],
          post_id: args[3],
        },
        flags,
      );
      show(
        await api(plan.url, { method: plan.method, body: plan.payload }),
        flags.json,
      );
      return;
    }
    if (action === "decision") {
      const operation = args[2],
        project = workspaceId(args[3]),
        id = args[4];
      if (operation === "history") {
        show(
          requireRoom(
            await api(
              `/projects/${project}/room/decisions/${workspaceId(id)}/history?page=${page}`,
            ),
          ),
          flags.json,
        );
        return;
      }
      if (!["pin", "edit", "archive", "restore"].includes(operation))
        throw Error("Choose pin, edit, archive, restore or history.");
      const plan = await roomDecisionPlan(
        api,
        project,
        operation === "pin" ? null : id,
        operation,
      );
      const payload = { ...plan.payload, ...plan.values };
      if (["pin", "edit"].includes(operation)) {
        payload.title = flags.title || payload.title;
        payload.body = await message(flags, payload.body);
      }
      if (flags["related-post"]) {
        if (operation !== "pin")
          throw Error("A decision preserves its original audience.");
        payload.post_id = workspaceId(flags["related-post"]);
      }
      await confirm({ audience: plan.audience, ...payload }, flags);
      show(
        await api(plan.url, { method: plan.method, body: payload }),
        flags.json,
      );
      return;
    }
    if (action === "decisions" || action === "activity") {
      const id = workspaceId(args[2]);
      show(
        requireRoom(
          await api(
            `/projects/${id}/room/${action}?page=${page}&archived=${flags.archived ? "1" : "0"}`,
          ),
        ),
        flags.json,
      );
      return;
    }
    let id = action ? workspaceId(action) : null;
    if (!id) {
      const me = await api("/me");
      const binding = new ProjectBinding({
        origin: config.origin,
        userId: me.user.id,
        root: await workspaceRoot(flags.project),
      });
      id = await binding.read();
    }
    if (!id) throw Error("Use room PROJECT_ID or workspace bind PROJECT_ID.");
    const data = await loadRoom(api, id, {
      state: flags.state,
      page,
      mine: flags.mine,
      query: flags.query,
    });
    if (!flags.json) out(data.title + " · " + data.room.project.goal);
    show(data, flags.json, "workspace");
    return;
  }
  if (command === "workspace") {
    const me = await api("/me"),
      root = await workspaceRoot(flags.project);
    const binding = new ProjectBinding({
      origin: config.origin,
      userId: me.user.id,
      root,
    });
    const action = args[1];
    if (action === "unbind") {
      await binding.remove();
      out("Local project association removed. Server data is unchanged.");
      return;
    }
    if (action === "bind") {
      const id = workspaceId(args[2]),
        data = await loadWorkspace(api, id);
      await confirm(
        {
          local_only: true,
          directory: root,
          project_id: id,
          project_name: data.workspace.project.name,
        },
        flags,
      );
      await binding.save(id);
      show({ project_id: id, local_only: true }, flags.json);
      return;
    }
    const id = /^[1-9]\d*$/.test(action || "")
      ? workspaceId(action)
      : await binding.read();
    if (!id)
      throw Error(
        "No project linked here. Run devdevian workspace bind PROJECT_ID.",
      );
    if (["link", "state", "unlink"].includes(action)) {
      if (action === "state" && !flags.state)
        throw Error("Choose --state open, in_progress or ready.");
      const plan = await requestPlan(
        api,
        id,
        args[2],
        flags.state || "open",
        action === "unlink",
      );
      if (action === "state" && plan.method !== "PATCH")
        throw Error("Link this conversation first.");
      await confirm(
        {
          ...plan.payload,
          project_id: id,
          post_id: workspaceId(args[2]),
          operation: action,
          audience: plan.audience,
        },
        flags,
      );
      show(
        await api(plan.url, { method: plan.method, body: plan.payload }),
        flags.json,
      );
      return;
    }
    if (action && !/^[1-9]\d*$/.test(action))
      throw Error("Use workspace [ID], bind, unbind, link, state or unlink.");
    const data = await loadWorkspace(api, id, {
      page,
      state: flags.state,
      query: flags.query,
    });
    if (!flags.json)
      out(data.title + " · " + JSON.stringify(data.workspace.counts));
    show(data, flags.json, "workspace");
    return;
  }
  if (
    command === "review" &&
    ["versions", "snapshot", "revise"].includes(args[1])
  ) {
    const id = workspaceId(args[2]);
    if (args[1] === "versions") {
      show(
        await api(`/posts/${id}/revisions?page=${page}`),
        flags.json,
        "revisions",
      );
      return;
    }
    if (args[1] === "snapshot") {
      show(
        await api(`/posts/${id}/revisions/${workspaceId(args[3])}`),
        flags.json,
      );
      return;
    }
    // Capture the base before reading files; never silently rebase after confirmation.
    const base = await revisionBase(api, id);
    if (!flags.file && !flags.selections)
      throw Error("Explicitly choose --file or --selections files.json.");
    const files = await revisionFiles(await workspaceRoot(flags.project), {
      file: flags.file,
      lines: flags.lines,
      selections: flags.selections,
    });
    const plan = revisionPlan(id, base, files, flags.focus);
    await confirm(
      {
        post_id: id,
        community_id: base.post.community_id || null,
        ...plan.payload,
      },
      flags,
    );
    show(
      await api(plan.url, { method: plan.method, body: plan.payload }),
      flags.json,
    );
    return;
  }
  if (command === "reviews") {
    show(await loadReviewQueue(api, flags.section || "open", page), flags.json);
    return;
  }
  if (command === "participation") {
    const editing = args[1] === "set",
      id = editing ? args[2] : args[1],
      plan = await participationPlan(api, id);
    if (!editing) {
      show(plan.data, flags.json);
      return;
    }
    if (!plan.data.can_manage)
      throw Error("Only the project owner can manage participation.");
    const payload = participationPayload(
      flags.mode || plan.values.mode,
      flags.members === undefined ? plan.values.members : flags.members,
      plan.payload.expected_version,
    );
    await confirm(
      { project_id: id, ...payload, audience: plan.audience },
      flags,
    );
    show(await api(plan.url, { method: "PUT", body: payload }), flags.json);
    return;
  }
  if (command === "work") {
    const section = flags.section || "attention";
    if (section === "continue") {
      const me = (await api("/me")).user,
        root = await workspaceRoot(flags.project || process.cwd());
      show(
        await loadWork(api, section, page, {
          drafts: new DraftStore({
            origin: config.origin,
            userId: me.id,
            root,
          }),
          recent: new RecentStore({
            origin: config.origin,
            userId: me.id,
            root,
          }),
        }),
        flags.json,
        "work",
      );
    } else show(await loadWork(api, section, page), flags.json, "work");
    return;
  }
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
  if (command === "extensions") {
    const action = args[1] || "list";
    if (action === "publish") {
      const plan = await extensionPublication(flags.file);
      await confirm(plan.preview, flags);
      const release = await api("/extensions/publish", {
        method: "POST",
        body: plan.payload,
      });
      show(
        flags.json
          ? release
          : {
              name: release.name,
              version: release.version,
              url: config.origin + "/app#extensions/" + release.id,
            },
        flags.json,
      );
    } else if (action === "list") {
      const params = new URLSearchParams({
        q: flags.query || "",
        page: String(page),
        format: "2",
      });
      const result = await api("/extensions/library?" + params);
      show(
        flags.json
          ? result
          : {
              items: [...result.builtins, ...result.items],
              pagination: result.pagination,
            },
        flags.json,
      );
    } else if (action === "updates") {
      const data = await api("/extensions/updates?page=" + page);
      show(
        flags.json
          ? data
          : {
              pagination: data.pagination,
              items: data.items.map((x) => ({
                id: x.from.id,
                name: `${x.to.name} · ${x.from.version} → ${x.to.version} · ${x.added_permissions.length} new capabilities`,
              })),
            },
        flags.json,
      );
    } else if (action === "update") {
      const updates = await api(
          "/extensions/updates?from=" + encodeURIComponent(args[2] || ""),
        ),
        plan = updates.items.find((x) => x.from.id === args[2]);
      if (!plan)
        throw Error("Choose an installed release ID from extensions updates.");
      await confirm(
        {
          ...plan,
          audience:
            "Your account only. Replaces the installed version; grants all new-version capabilities.",
        },
        flags,
      );
      show(
        await api("/extensions/update?format=2", {
          method: "POST",
          body: {
            from: plan.from.id,
            release: plan.to.id,
            acknowledge_update: true,
            acknowledge_unreviewed: true,
            granted_permissions: plan.to.permissions,
          },
        }),
        flags.json,
      );
    } else if (action === "history") {
      if (!/^[a-z][a-z0-9-]{2,47}$/.test(args[2] || ""))
        throw Error("Use extensions history SLUG.");
      show(
        await api("/extensions/history/" + args[2] + "?page=" + page),
        flags.json,
      );
    } else if (action === "mine") {
      const state = await api("/extensions/me?format=2");
      show(flags.json ? state : { items: state.published }, flags.json);
    } else
      throw Error(
        "Use extensions init, dev, pack, list, mine, history, updates, update or publish.",
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
  if (
    command === "ask" ||
    (command === "review" && args[1] === "create") ||
    (command === "github" && args[1] === "review")
  ) {
    const fromPR = command === "github",
      review = command === "review" || fromPR;
    let prSelection;
    if (fromPR && flags.selections) {
      if (
        flags.file ||
        flags.hunks ||
        flags.lines ||
        flags["github-context"] ||
        flags.pr
      )
        throw Error(
          "Use --selections instead of --file, --hunks or local context flags.",
        );
      const manifest = JSON.parse(await boundedFile(flags.selections, 20000));
      if (!Array.isArray(manifest) || !manifest.length || manifest.length > 10)
        throw Error(
          "Selections must list 1–10 files with path, hunks and optional page.",
        );
      const snapshots = [];
      for (const item of manifest) {
        if (
          !item ||
          typeof item.path !== "string" ||
          typeof item.hunks !== "string" ||
          !/^[1-9]\d*(?::[1-9]\d*)?$/.test(item.hunks)
        )
          throw Error("Each selection needs path and hunks, for example 1:2.");
        const [start, end = start] = item.hunks.split(":").map(Number);
        snapshots.push(
          selectPRHunks(
            await reviewGitHubReader.loadDiff(args[2], {
              path: item.path,
              page: positive(String(item.page ?? 1), "Page"),
            }),
            start,
            end,
          ),
        );
        // Stop immediately if a PR changed, rather than fetching the remaining files.
        combinePRSelections(snapshots);
      }
      prSelection = combinePRSelections(snapshots);
    } else if (fromPR) {
      if (!flags.hunks || !/^([1-9]\d*)(?::([1-9]\d*))?$/.test(flags.hunks))
        throw Error(
          "Choose --hunks START:END (or a single hunk number). Inspect github diff first.",
        );
      if (flags.lines || flags["github-context"] || flags.pr)
        throw Error(
          "PR reviews use their snapshot context. Omit --lines, --github-context and --pr.",
        );
      const [start, end = start] = flags.hunks.split(":").map(Number);
      prSelection = selectPRHunks(
        await reviewGitHubReader.loadDiff(args[2], {
          page: positive(flags.page || "1", "Page"),
          path: flags.file,
        }),
        start,
        end,
      );
    }
    let code = "",
      file,
      range;
    if ((flags["github-context"] || flags.pr) && !review)
      throw Error("GitHub context is available for review create.");
    if (flags.pr && !flags["github-context"])
      throw Error("--pr requires --github-context.");
    if (review && !fromPR) {
      file = flags.file || (await prompt("Code file"));
      code = await boundedFile(file, 20000);
      if (flags.lines) {
        const m = flags.lines.match(/^(\d+):(\d+)$/);
        if (!m) throw Error("Use --lines START:END.");
        const lines = code.split("\n"),
          start = positive(m[1]),
          end = positive(m[2]);
        if (end < start || end > lines.length)
          throw Error("The selected range is outside the file.");
        range = { start, end };
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
      if (prSelection?.private && !payload.community_id)
        throw Error(
          "Private GitHub code requires an explicitly selected private community. Use --community ID.",
        );
      payload.code = prSelection?.code || code;
      if (prSelection) {
        payload.details = { github_context: prSelection.context };
        payload.body +=
          "\n\nReview lines refer to the published patch, including its headers. This is a frozen GitHub PR snapshot, not a synchronized GitHub review.";
      }
      payload.review_focus =
        flags.focus || (await prompt("What should reviewers focus on?"));
      if (flags["github-context"])
        payload.details = {
          github_context: await readGitHubContext(
            await workspaceRoot(flags.project || process.cwd()),
            { kind: "file", path: file, ...range },
            { pullRequest: flags.pr || "" },
          ),
        };
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
      Object.assign(
        payload,
        feedbackAnchor(parent, current, payload.start_line, payload.end_line),
      );
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
    if (values.start) args.push("--start");
    await (
      await import("../lib/window.mjs")
    ).openWindow({ entry: fileURLToPath(import.meta.url), args });
    out("Devdevian opened in a separate terminal window.");
  } else await execute(positionals, values);
} catch (e) {
  process.stderr.write("Devdevian: " + commandProblemMessage(e) + "\n");
  process.exitCode = 1;
} finally {
  terminal?.close();
}
