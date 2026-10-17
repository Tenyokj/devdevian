// Destructive local-only screenshot fixture. Existing data is archived before reset.
import { DatabaseSync } from "node:sqlite";
import { mkdirSync, renameSync, existsSync, writeFileSync } from "node:fs";
import { randomUUID, randomBytes, scryptSync } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer, createConnection } from "node:net";
import { chromium } from "@playwright/test";

if (
  !process.argv.includes("--reset-local-data") ||
  process.env.NODE_ENV === "production" ||
  process.env.VERCEL
)
  throw Error(
    "Local use only: stop ports 4173/4174, then pass --reset-local-data.",
  );
for (const port of [4173, 4174]) {
  const active = await new Promise((resolve) => {
    const socket = createConnection({ port, host: "127.0.0.1" });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
  if (active)
    throw Error(`Stop the local server on ${port} before resetting data.`);
}
const password = "Devdevian-Test-2026!";
const people = [
  [
    "Alex Morgan",
    "alexmorgan",
    "author@devdevian.test",
    "Full-stack developer",
    "React, TypeScript, Node.js",
    "#8995f5",
    "Berlin, Germany",
    "Building thoughtful tools for small teams. Currently exploring optimistic UI and local-first software.",
  ],
  [
    "Maya Chen",
    "mayachen",
    "reviewer@devdevian.test",
    "Frontend engineer",
    "React, TypeScript, Accessibility",
    "#b18ae8",
    "Singapore",
    "Interfaces, accessibility, and the details that make software feel right. Happy to review your next component.",
  ],
  [
    "Sam Rivera",
    "samrivera",
    "moderator@devdevian.test",
    "Platform engineer",
    "Go, Docker, PostgreSQL",
    "#6ba6c8",
    "Lisbon, Portugal",
    "Reliable systems and useful conversations. Keeping things simple, one deploy at a time.",
  ],
  [
    "Noah Park",
    "noahpark",
    "noah@devdevian.test",
    "Product designer & developer",
    "Figma, React, CSS",
    "#d49e83",
    "Seoul, South Korea",
    "Turning complicated workflows into calmer interfaces. Co-building Orbit.",
  ],
  [
    "Amara Okafor",
    "amara",
    "amara@devdevian.test",
    "Backend developer",
    "Python, PostgreSQL, Redis",
    "#76b9a9",
    "Lagos, Nigeria",
    "APIs, background jobs, and the occasional weekend experiment. Working on developer tools.",
  ],
  [
    "Elena Rossi",
    "elenarossi",
    "elena@devdevian.test",
    "AI engineer",
    "Python, AI, TypeScript",
    "#c38daa",
    "Milan, Italy",
    "Making model-powered features useful, observable, and a little less mysterious.",
  ],
  [
    "Jamie Brooks",
    "jamiebrooks",
    "jamie@devdevian.test",
    "Open-source maintainer",
    "Rust, TypeScript, Open source",
    "#a5b97c",
    "Bristol, United Kingdom",
    "Small libraries, clear docs, and fewer dependencies. Building in public and learning along the way.",
  ],
  [
    "Sofia Torres",
    "sofiatorres",
    "sofia@devdevian.test",
    "Smart contract developer",
    "Solidity, Foundry, Web3",
    "#b2a0e1",
    "Madrid, Spain",
    "Testing the edge cases before they become production stories. Interested in onchain developer experience.",
  ],
];
const posts = [
  [
    1,
    1,
    "question",
    "web",
    "How do you roll back an optimistic update without losing newer changes?",
    "I’m building a small issue tracker. If two edits happen quickly and the first request fails, restoring the old snapshot also removes the second edit.\n\n```ts\nconst previous = cache.get(issueId);\ncache.set(issueId, { ...previous, title });\nawait updateIssue(issueId, { title });\n```\n\nWould you keep a queue of pending changes, or reconcile against the server version?",
    "React, TypeScript",
    "",
  ],
  [
    2,
    2,
    "review",
    "web",
    "A second pair of eyes on this fetch helper?",
    "I want the helper to stay small while making failures useful to callers. How would you handle non-JSON error responses?",
    "TypeScript, API design",
    'async function getAccount() {\n  const response = await fetch("/api/me");\n  if (!response.ok) throw new Error(`HTTP ${response.status}`);\n  return response.json();\n}',
  ],
  [
    3,
    4,
    "showcase",
    "indie",
    "Meet Orbit: a calmer home for your team’s next sprint",
    "We’ve been working on a lightweight issue tracker for small teams. Keyboard navigation and a clear “what’s next?” view were the starting points.\n\nI’d love feedback on the board layout — especially how the priority labels scan at a glance.",
    "React, TypeScript, PostgreSQL",
    "",
  ],
  [
    4,
    6,
    "discussion",
    "ai",
    "What made your first AI feature useful beyond the demo?",
    "We’re testing a documentation assistant. Retrieval quality improved more from better source structure than from changing models.\n\nWhat was the less obvious change that made your feature useful in day-to-day work?",
    "AI, Python, Product",
    "",
  ],
  [
    5,
    3,
    "question",
    "devops",
    "What belongs in a health check, and what should stay out?",
    "Our readiness check currently queries the database and Redis. A short downstream outage now restarts healthy application instances.\n\nHow do you separate liveness, readiness, and dependency monitoring?",
    "Docker, PostgreSQL, Node.js",
    "",
  ],
  [
    6,
    7,
    "showcase",
    "indie",
    "I made Fieldnotes to keep the “why” next to the code",
    "A tiny place for architectural decisions, short team notes, and the context that never quite fits in a commit message.\n\nThe first version focuses on fast writing and finding an old decision again. Curious how you organize your team’s working notes.",
    "TypeScript, Markdown, Open source",
    "",
  ],
  [
    7,
    8,
    "discussion",
    "web3",
    "What’s the one invariant you always test before a contract release?",
    "For payment flows, I start with conservation of balances and authorization. I’m collecting practical invariants that have caught real mistakes. What would you add to the checklist?",
    "Solidity, Foundry, Testing",
    "",
  ],
  [
    8,
    5,
    "review",
    "devops",
    "Review request: retrying a job without sending duplicate emails",
    "The worker can be interrupted after the provider accepts a request but before the job is marked complete. I’m adding an idempotency record and would appreciate feedback on the failure boundaries.",
    "Python, Redis, API design",
    'async def deliver(job):\n    key = f"message:{job.id}"\n    if await store.is_delivered(key):\n        return\n    await provider.send(job.payload, idempotency_key=key)',
  ],
  [
    9,
    2,
    "discussion",
    "design",
    "Keyboard shortcuts should feel discoverable, not like a secret club",
    "We’re trying an inline shortcut hint beside common actions rather than a separate cheat sheet. What patterns have helped people discover keyboard navigation without adding noise?",
    "Accessibility, CSS, Product",
    "",
  ],
  [
    10,
    7,
    "question",
    "web",
    "How do you decide when a component deserves its own abstraction?",
    "I’m refactoring a settings page. Three fields look similar, but their validation and empty states differ. Do you wait for the behavior to repeat, or extract the shared layout first?",
    "React, TypeScript",
    "",
  ],
  [
    11,
    6,
    "showcase",
    "ai",
    "Traceboard: see where your model pipeline actually spends its time",
    "We needed a simple way to compare retrieval, generation, and tool calls side by side. The timeline started as a debugging view and became the product. Feedback on the first-run dashboard is welcome.",
    "AI, Python, Observability",
    "",
  ],
  [
    12,
    3,
    "discussion",
    "devops",
    "A boring release checklist that has saved us more than once",
    "A small migration rehearsal, a rollback path, and one real request through the new build. What’s on the checklist you actually use — rather than the one nobody reads?",
    "Docker, Testing, Open source",
    "",
  ],
  [
    13,
    4,
    "question",
    "design",
    "How much empty-state guidance is actually helpful?",
    "For a new project with no issues, we’re choosing between a sample task and a short prompt to create the first one. Which approach has worked better for your tools?",
    "Figma, Product, Accessibility",
    "",
  ],
  [
    14,
    5,
    "discussion",
    "web",
    "Cursor pagination: what do you put in the cursor?",
    "I use the creation timestamp plus an ID so equal timestamps have a stable order. Curious how you handle edits, deleted records, and backwards navigation.",
    "PostgreSQL, API design",
    "",
  ],
];
const responses = [
  [
    1,
    2,
    "Keep the confirmed server state separate from your pending patches. On failure, remove only that mutation and replay the remaining patches. A full snapshot rollback is too broad when edits overlap.",
  ],
  [
    1,
    5,
    "Also give each mutation an ID. That makes it easier to reconcile a response with the operation it belongs to, rather than assuming responses arrive in order.",
  ],
  [
    1,
    1,
    "That separation was the missing piece. Replaying the pending patches fixed the overlap case — thanks @mayachen!",
    1,
  ],
  [
    2,
    3,
    "Read the error body defensively. Not every proxy or upstream service returns JSON; preserve the status and a short text fallback so the caller still gets useful context.",
  ],
  [
    2,
    7,
    "I would also accept an AbortSignal from the caller. It keeps cancellation policy out of the helper.",
  ],
  [
    3,
    2,
    "The priority labels are easy to scan. I’d give the selected column a little more separation and keep the card actions available by keyboard.",
  ],
  [
    3,
    1,
    "The compact card layout works well. Could the board remember my filter when I return from an issue?",
  ],
  [
    4,
    5,
    "A clear “I don’t know” path. Being able to inspect the sources improved trust much more than making every answer sound confident.",
  ],
  [
    4,
    7,
    "We added a tiny evaluation set from real support questions. It caught regressions that were invisible in our favorite demo examples.",
  ],
  [
    5,
    5,
    "Liveness should answer whether this process is functioning. Readiness can include dependencies, with timeouts and an intentional failure policy. Restarting the process usually won’t fix a database outage.",
  ],
  [
    6,
    4,
    "The decision list is pleasantly simple. I’d love a way to link a note back to the pull request that motivated it.",
  ],
  [
    7,
    3,
    "I like testing that an unauthorized caller cannot change any privileged state, even through a sequence of otherwise valid operations.",
  ],
  [
    8,
    3,
    "Check what happens if the provider succeeds and the local delivery record fails. The provider’s idempotency key needs a stable lifetime across retries.",
  ],
  [
    9,
    1,
    "We show the shortcut on hover and in the command menu. That keeps the main interface quiet while still giving people a path to discover it.",
  ],
  [
    10,
    2,
    "I’d extract shared layout first and leave validation close to each field. Similar markup doesn’t always mean shared behavior.",
  ],
  [
    11,
    5,
    "The separate retrieval span is useful. It would help to compare the slowest runs with a representative successful run.",
  ],
  [
    12,
    1,
    "One fresh-user journey after deploy. Existing sessions can hide broken onboarding surprisingly well.",
  ],
  [
    13,
    2,
    "A real sample can help, provided it is clearly labeled and easy to remove. I’d avoid making it look like user-created content.",
  ],
  [
    14,
    3,
    "Timestamp plus a unique ID is a good stable order. I keep the cursor opaque and include the filter/sort version so it can’t silently be reused for a different query.",
  ],
];

async function assets() {
  const result = new Map();
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ deviceScaleFactor: 1 });
    async function render(key, width, height, html, transparent = false) {
      await page.setViewportSize({ width, height });
      await page.setContent(
        `<style>*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif;color:#eef0ff}${html.startsWith("<svg") ? "" : "body{background:#0d1224}"}</style>${html}`,
      );
      result.set(key, await page.screenshot({ omitBackground: transparent }));
    }
    for (let i = 0; i < people.length; i++) {
      const [name, , , , , color] = people[i];
      const initials = name
        .split(" ")
        .map((x) => x[0])
        .join("");
      await render(
        `avatar-${i + 1}`,
        160,
        160,
        `<svg width="160" height="160" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="${color}"/><stop offset="1" stop-color="#24263e"/></linearGradient></defs><circle cx="80" cy="80" r="80" fill="url(#g)"/><circle cx="124" cy="28" r="57" fill="white" opacity=".06"/><text x="80" y="96" text-anchor="middle" font-family="Arial" font-size="48" fill="#fff">${initials}</text></svg>`,
        true,
      );
    }
    for (const [key, label, color] of [
      ["web", "Web Collective", "#7585ee"],
      ["builders", "Indie Builders", "#ab85dc"],
      ["ai", "Applied AI Lab", "#68b4b5"],
    ]) {
      await render(
        `banner-${key}`,
        1440,
        300,
        `<div style="height:300px;background:radial-gradient(ellipse at 70% 40%,${color}55,transparent 65%),linear-gradient(120deg,#151a35,#10162a);position:relative;overflow:hidden;padding:70px 80px"><div style="position:absolute;width:650px;height:650px;border:1px solid ${color}55;border-radius:50%;right:80px;top:-200px"></div><div style="position:absolute;width:450px;height:450px;border:1px solid ${color}66;border-radius:50%;right:180px;top:-100px"></div><div style="font-size:13px;letter-spacing:5px;color:${color}">BUILD / REVIEW / SHARE</div><div style="font-size:64px;letter-spacing:-2px;margin-top:18px">${label}</div><span style="position:absolute;right:220px;top:95px;font:70px monospace;color:${color}">{ }</span></div>`,
      );
      await render(
        `logo-${key}`,
        160,
        160,
        `<svg width="160" height="160" xmlns="http://www.w3.org/2000/svg"><g fill="none" stroke="${color}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"><path d="M56 42L18 80l38 38M104 42l38 38-38 38M90 30L70 130"/></g></svg>`,
        true,
      );
    }
    for (const [key, title, accent] of [
      ["orbit", "Orbit", "#a294f1"],
      ["fieldnotes", "Fieldnotes", "#8fcbb6"],
      ["traceboard", "Traceboard", "#81b6df"],
    ]) {
      await render(
        `logo-${key}`,
        160,
        160,
        `<svg width="160" height="160" xmlns="http://www.w3.org/2000/svg"><g fill="none" stroke="${accent}" stroke-width="9"><circle cx="80" cy="80" r="37"/><ellipse cx="80" cy="80" rx="70" ry="25" transform="rotate(-35 80 80)"/><circle cx="126" cy="44" r="9" fill="${accent}" stroke="none"/></g></svg>`,
        true,
      );
      for (let variant = 0; variant < 2; variant++) {
        const columns = variant
          ? ["Backlog", "In progress", "In review"]
          : ["Planned", "In progress", "Shipped"];
        await render(
          `${key}-${variant}`,
          1280,
          760,
          `<div style="display:flex;height:760px;background:#111626"><aside style="width:220px;border-right:1px solid #ffffff10;padding:32px 23px"><strong style="font-size:27px;color:${accent}">${title}<span style="color:white">.</span></strong><p style="font-size:10px;color:#6b7692;margin:12px 0 55px;letter-spacing:2px">YOUR TEAM WORKSPACE</p>${["Overview", "Projects", "My work", "Activity", "Settings"].map((x, i) => `<div style="padding:14px 12px;margin:8px 0;border-radius:8px;background:${i === 1 ? accent + "18" : "transparent"};font-size:13px;color:${i === 1 ? accent : "#8490ac"}">${x}</div>`).join("")}<div style="margin-top:215px;font-size:11px;color:#626f8c">A LITTLE CLARITY, EVERY DAY.</div></aside><main style="padding:42px 38px;flex:1"><div style="font-size:11px;color:#7885a4">Workspace / ${variant ? "Product" : "Engineering"}</div><div style="display:flex;align-items:center;justify-content:space-between;margin-top:25px"><div><h1 style="font-size:34px;letter-spacing:-1px;font-weight:500;margin:0">${key === "orbit" ? (variant ? "The next good thing." : "Make room for good work.") : key === "fieldnotes" ? "Keep the why close." : "A clearer picture of every run."}</h1><p style="color:#8996b1;font-size:12px;margin-top:14px">${key === "orbit" ? "A focused place for your team’s next sprint." : key === "fieldnotes" ? "Decisions, working notes, and the context behind the code." : "Retrieval, generation, and tool calls — in one timeline."}</p></div><button style="border:0;border-radius:8px;background:${accent};color:#15182b;padding:12px 17px;font-weight:bold">+ ${key === "fieldnotes" ? "New note" : "New issue"}</button></div><div style="display:flex;gap:22px;font-size:11px;margin:30px 0;padding-bottom:17px;border-bottom:1px solid #ffffff10;color:#8a98b3"><span style="color:${accent}">Board</span><span>List</span><span>Timeline</span><span style="margin-left:auto">⌘ K &nbsp; Find anything</span></div><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:18px">${columns.map((col, j) => `<section><div style="font-size:11px;color:#919bb6;margin:9px 0 18px"><span style="color:${accent}">●</span> &nbsp;${col} <span style="float:right;opacity:.4">${3 - j}</span></div>${Array.from({ length: 3 - j }, (_, n) => `<article style="padding:20px 17px;background:#1b2134;border:1px solid #ffffff07;border-radius:11px;margin-bottom:14px"><small style="font-size:9px;color:${accent}">${key === "fieldnotes" ? "DECISION" : "ORB"}-${102 + j * 4 + n}</small><h3 style="font-size:14px;line-height:1.7;font-weight:500;margin:11px 0 22px">${["Polish the first-run experience", "Keep filters when navigating back", "Review the keyboard shortcuts", "Document the API decisions", "Ship the smaller, better version"][(j * 2 + n + variant) % 5]}</h3><div style="display:flex;justify-content:space-between;align-items:center"><span style="font-size:9px;color:#96a1ba;padding:5px 8px;background:#ffffff07;border-radius:5px">${["Design", "Frontend", "Backend"][j]}</span><span style="display:grid;place-items:center;border-radius:50%;width:23px;height:23px;font-size:8px;background:${accent}25;color:${accent}">${["AM", "MC", "NP"][j]}</span></div></article>`).join("")}</section>`).join("")}</div></main></div>`,
        );
      }
    }
  } finally {
    await browser.close();
  }
  return result;
}
async function initialize(path) {
  const probe = createServer();
  await new Promise((r) => probe.listen(0, "127.0.0.1", r));
  const port = probe.address().port;
  await new Promise((r) => probe.close(r));
  const child = spawn(process.execPath, ["server.mjs"], {
    env: {
      ...process.env,
      TURSO_DATABASE_URL: "",
      TURSO_AUTH_TOKEN: "",
      UPLOAD_DRIVER: "local",
      DB_DRIVER: "",
      VERCEL: "",
      NODE_ENV: "development",
      DEMO_MODE: "1",
      DB_PATH: path,
      PORT: String(port),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let logs = "";
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(Error("Schema initialization timed out: " + logs)),
        10000,
      );
      child.stdout.on("data", (b) => {
        logs += b;
        if (logs.includes("Devdevian is ready")) {
          clearTimeout(timer);
          resolve();
        }
      });
      child.stderr.on("data", (b) => (logs += b));
      child.once("exit", (code) => {
        clearTimeout(timer);
        reject(Error("Schema initialization failed " + code + ": " + logs));
      });
    });
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      const closed = new Promise((r) => child.once("exit", r));
      child.kill("SIGTERM");
      await closed;
    }
  }
}
function seed(path, graphics) {
  const db = new DatabaseSync(path);
  // Higher IDs put the curated recent questions before older project announcements.
  const featuredId = (id) => (id >= 1 && id <= 14 ? 215 - id : id);
  const put = (table, values) => {
    values = { ...values };
    if (table === "posts") values.id = featuredId(values.id);
    if (values.post_id) values.post_id = featuredId(values.post_id);
    if (table === "memberships" && values.kind === "post")
      values.item = String(featuredId(Number(values.item)));
    const keys = Object.keys(values);
    return Number(
      db
        .prepare(
          `INSERT INTO ${table}(${keys.join(",")}) VALUES(${keys.map(() => "?").join(",")})`,
        )
        .run(...Object.values(values)).lastInsertRowid,
    );
  };
  const date = (minutesAgo) =>
    new Date(Date.now() - minutesAgo * 60000).toISOString();
  const detail = (kind, id, data) =>
    put("entity_details", {
      kind,
      entity_id: String(id),
      data: JSON.stringify(data),
    });
  const file = (key, owner = 1, post = null) => {
    const id = randomUUID(),
      bytes = graphics.get(key);
    if (!bytes) throw Error("Missing graphic " + key);
    writeFileSync("data/uploads/" + id, bytes);
    put("uploads", {
      id,
      user_id: owner,
      post_id: post,
      name: key + ".png",
      mime: "image/png",
      size: bytes.length,
    });
    return id;
  };
  db.exec("BEGIN");
  try {
    people.forEach(
      ([name, username, email, role, stack, color, location, bio], i) => {
        const salt = randomBytes(16).toString("hex");
        put("users", {
          id: i + 1,
          email,
          password: salt + ":" + scryptSync(password, salt, 64).toString("hex"),
          name,
          username,
          role,
          stack,
          location,
          bio,
          email_verified: 1,
          username_locked: 1,
        });
        detail("user", i + 1, {
          avatar: file(`avatar-${i + 1}`, i + 1),
          banner: file(`banner-${["web", "builders", "ai"][i % 3]}`, i + 1),
          links: [
            {
              label: "Current project",
              url: "https://example.com/?builder=" + username,
            },
          ],
        });
      },
    );
    for (const [id, owner_id, name, description, key, topics, members] of [
      [
        "web-collective",
        1,
        "Web Collective",
        "A thoughtful corner for frontend, backend, and everything between. Share the work, review the details, and help each other ship.",
        "web",
        ["web", "design"],
        [1, 2, 3, 4, 5, 7],
      ],
      [
        "indie-builders",
        4,
        "Indie Builders",
        "Small teams, weekend experiments, and the long road from an idea to something people use.",
        "builders",
        ["indie", "design"],
        [1, 2, 4, 6, 7],
      ],
      [
        "applied-ai",
        6,
        "Applied AI Lab",
        "Useful model-powered features, practical evaluations, and lessons from shipping AI into real workflows.",
        "ai",
        ["ai", "devops"],
        [1, 3, 5, 6],
      ],
    ]) {
      put("private_communities", {
        id,
        owner_id,
        name,
        description,
        created: date(60 * 24 * 15),
      });
      detail("community", id, {
        logo: file("logo-" + key, owner_id),
        banner: file("banner-" + key, owner_id),
        topics,
      });
      members.forEach((user_id) =>
        put("memberships", { user_id, kind: "group", item: id }),
      );
      put("validators", { community_id: id, user_id: 3 });
      if (!members.includes(3))
        db.prepare("DELETE FROM validators WHERE community_id=?").run(id);
    }
    posts.forEach(([id, user_id, kind, topic, title, body, stack, code], i) => {
      put("posts", {
        id,
        user_id,
        kind,
        topic,
        title,
        body,
        stack,
        code,
        review_focus:
          kind === "review"
            ? "Failure boundaries, clarity, and useful errors."
            : "",
        created: date(30 + i * 100),
      });
      for (let u = 1; u <= 8; u++)
        if (u !== user_id && (u + id) % 3 !== 0)
          put("votes", { user_id: u, post_id: id });
      if ([3, 6, 11].includes(id))
        file(
          id === 3 ? "orbit-0" : id === 6 ? "fieldnotes-0" : "traceboard-0",
          user_id,
          id,
        );
    });
    responses.forEach(([post_id, user_id, body, parent]) =>
      put("replies", {
        user_id,
        post_id,
        body,
        parent_id: parent || null,
        created: date(15 + post_id * 2),
      }),
    );
    db.prepare(
      "UPDATE posts SET status='resolved',accepted_reply_id=1,resolved_at=? WHERE id=214",
    ).run(date(10));
    for (const [id, uid, title, body, kind, topic] of [
      [
        21,
        1,
        "Weekly build log: small wins, useful lessons",
        "This week we made optimistic updates resilient to overlapping edits. What is one small improvement you shipped? Share the detail you’re happiest with.",
        "discussion",
        "web",
      ],
      [
        22,
        2,
        "Review circle: bring one component, leave with one idea",
        "Our next review session focuses on accessible forms. Bring a small snippet and a specific question — we’ll take turns giving thoughtful feedback.",
        "discussion",
        "design",
      ],
      [
        23,
        4,
        "A few early sketches for the next Orbit board",
        "I’m exploring a quieter board layout with clearer grouping and fewer persistent controls. I’d love a second opinion on the information hierarchy.",
        "showcase",
        "design",
      ],
      [
        24,
        3,
        "A practical checklist for the next release",
        "Migrations rehearsed, rollback documented, and a fresh-user journey checked. What else belongs on our small-team release checklist?",
        "question",
        "devops",
      ],
    ]) {
      put("posts", {
        id,
        user_id: uid,
        title,
        body,
        kind,
        topic,
        stack: "React, TypeScript",
        community_id: "web-collective",
        created: date(60 + (id - 21) * 90),
      });
      put("replies", {
        user_id: uid === 2 ? 1 : 2,
        post_id: id,
        body:
          id === 21
            ? "We added visible focus states to every board action. A small change that made keyboard navigation much easier."
            : "Happy to take a look. A focused example and a little context make the review much more useful.",
        created: date(20),
      });
    }
    for (const [id, owner, name, key, topic, description, tagline] of [
      [
        1,
        1,
        "Orbit",
        "orbit",
        "web",
        "A lightweight issue tracker for small teams. Clear priorities, keyboard-first navigation, and a focused place for the work that comes next.",
        "Less project management. More making progress.",
      ],
      [
        2,
        7,
        "Fieldnotes",
        "fieldnotes",
        "indie",
        "A small workspace for architectural decisions and working notes. Keep the reasoning behind a change close to the people and code it affects.",
        "Keep the why next to the work.",
      ],
      [
        3,
        6,
        "Traceboard",
        "traceboard",
        "ai",
        "A visual timeline for model-powered workflows. Compare retrieval, generation, and tool calls without losing the context of the complete run.",
        "A clearer picture of every run.",
      ],
    ]) {
      const post_id = 30 + id;
      put("posts", {
        id: post_id,
        user_id: owner,
        title: `${name}: looking for feedback on the first-run experience`,
        body: `${description}\n\nWe’re refining the first-run experience. What feels clear, and where would a little more guidance help?`,
        kind: "showcase",
        topic,
        stack: "React, TypeScript",
        created: date(24 * 60 + id * 30),
      });
      put("projects", {
        id,
        user_id: owner,
        post_id,
        name,
        description,
        url: "https://example.com/?demo=" + key,
        repo: "",
        topic,
        stack:
          id === 3 ? "Python, AI, TypeScript" : "React, TypeScript, PostgreSQL",
        stage: "Beta",
        help: "Try the first-run experience. We’d love specific feedback on navigation, empty states, and what you would expect to happen next.",
        created: date(24 * 60 + id * 30),
      });
      detail("project", id, {
        logo: file("logo-" + key, owner),
        screenshots: [file(key + "-0", owner), file(key + "-1", owner)],
        tagline,
        audience:
          "Developers and small teams who want a little more clarity in their daily work.",
        problem:
          "Important context gets lost between the task, the conversation, and the next handoff.",
        team: [
          { user_id: owner, role: "Co-founder · Engineering" },
          { user_id: 4, role: "Product design" },
          { user_id: 2, role: "Frontend & Accessibility" },
        ],
        links: [
          { label: "Live demo", url: "https://example.com/?demo=" + key },
          { label: "Product notes", url: "https://example.com/?notes=" + key },
        ],
      });
      put("replies", {
        user_id: 2,
        post_id,
        body: "The first view is easy to understand. A short sample workspace would help people see the intended flow before creating their own content.",
        created: date(250),
      });
      put("project_updates", {
        project_id: id,
        user_id: owner,
        title: "A clearer first step",
        body: "We’ve simplified the empty state and added a keyboard-friendly path through the main workflow. Thanks for the thoughtful feedback.",
        created: date(300),
      });
    }
    for (const [id, owner, title, topic, key] of [
      [1, 2, "Frontend review room: accessible forms", "web", "web"],
      [2, 1, "Build in public: the small-team edition", "indie", "builders"],
      [3, 6, "From AI demo to a useful product", "ai", "ai"],
      [4, 3, "Shipping small changes with confidence", "devops", "web"],
    ]) {
      const start = new Date();
      start.setUTCDate(start.getUTCDate() + id + 2);
      start.setUTCHours(16, 0, 0, 0);
      put("events", {
        id,
        user_id: owner,
        title,
        description:
          "A relaxed, practical session with fellow developers. Bring a focused question, share your experience, and leave with something useful to try.",
        topic,
        start_at: start.toISOString(),
        end_at: new Date(+start + 90 * 60000).toISOString(),
        timezone: "Europe/Kyiv",
        url: "https://example.com/?meeting=" + id,
        created: date(900),
      });
      detail("event", id, { banner: file("banner-" + key, owner), links: [] });
      for (const user_id of [1, 2, 3, 5, 6].filter((u) => (u + id) % 4 !== 0))
        put("memberships", { user_id, kind: "event", item: String(id) });
    }
    for (const item of ["1", "2", "3", "31"])
      put("memberships", { user_id: 1, kind: "post", item });
    // Keep the notification badge quiet for clean captures; history is still populated.
    put("notifications", {
      recipient_id: 1,
      actor_id: 2,
      post_id: 1,
      reply_id: 1,
      type: "reply",
      event_key: "screenshot-reply",
      created: date(10),
      read_at: date(5),
    });
    db.exec("COMMIT");
    if (db.prepare("PRAGMA quick_check").get().quick_check !== "ok")
      throw Error("Database integrity check failed");
    console.log(
      path +
        ": " +
        db.prepare("SELECT COUNT(*) n FROM users").get().n +
        " profiles, " +
        db.prepare("SELECT COUNT(*) n FROM posts").get().n +
        " conversations, 3 projects, 4 events",
    );
  } catch (error) {
    if (db.isTransaction) db.exec("ROLLBACK");
    throw error;
  } finally {
    db.close();
  }
}
// Render first: a browser/asset failure must not remove the existing workspace.
console.log("Rendering fictional screenshot assets…");
const graphics = await assets();
const backup =
  "backups/before-screenshot-reset-" +
  new Date().toISOString().replace(/[:.]/g, "-");
mkdirSync(backup, { recursive: true });
if (existsSync("data")) renameSync("data", backup + "/data");
mkdirSync("data/uploads", { recursive: true });
try {
  for (const path of ["data/arc.sqlite", "data/acceptance.sqlite"]) {
    await initialize(path);
    seed(path, graphics);
  }
} catch (error) {
  // Preserve the failed attempt for inspection, and automatically restore old data.
  renameSync("data", backup + "/failed-attempt");
  if (existsSync(backup + "/data")) renameSync(backup + "/data", "data");
  throw error;
}
console.log("Previous databases and uploads preserved at " + backup + "/data");
console.log("Screenshot login: author@devdevian.test / " + password);
console.log(
  "All fixture identities, products and participation are fictional.",
);
