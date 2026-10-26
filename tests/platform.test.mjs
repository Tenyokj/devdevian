import { startS3Fixture } from "./s3-fixture.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { DatabaseSync } from "node:sqlite";
import { scryptSync } from "node:crypto";

test("Devdevian application scenarios with an isolated database", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "devdevian-test-"));
  const path = join(directory, "test.sqlite");
  const old = new DatabaseSync(path);
  old.exec(
    "CREATE TABLE users(id INTEGER PRIMARY KEY,email TEXT UNIQUE NOT NULL,password TEXT NOT NULL,name TEXT NOT NULL,bio TEXT DEFAULT '',location TEXT DEFAULT '',role TEXT DEFAULT 'Builder'); CREATE TABLE posts(id INTEGER PRIMARY KEY,user_id INTEGER,title TEXT,body TEXT,created TEXT DEFAULT CURRENT_TIMESTAMP)",
  );
  const salt = "test-salt";
  old
    .prepare("INSERT INTO users(email,password,name) VALUES(?,?,?)")
    .run(
      "legacy@example.test",
      salt + ":" + scryptSync("Legacy-test-password", salt, 64).toString("hex"),
      "Existing developer",
    );
  old
    .prepare("INSERT INTO posts(user_id,title,body) VALUES(1,?,?)")
    .run("Existing conversation", "This should survive the migration.");
  old.exec(
    `CREATE TABLE notifications(id INTEGER PRIMARY KEY,recipient_id INTEGER NOT NULL,actor_id INTEGER NOT NULL,post_id INTEGER NOT NULL,reply_id INTEGER,type TEXT NOT NULL,event_key TEXT NOT NULL,created TEXT DEFAULT CURRENT_TIMESTAMP,read_at TEXT,UNIQUE(recipient_id,event_key)); INSERT INTO notifications(recipient_id,actor_id,post_id,type,event_key) VALUES(1,1,1,'reply','legacy-activity');`,
  );
  old.close();
  const probe = createServer();
  await new Promise((r) => probe.listen(0, "127.0.0.1", r));
  const port = probe.address().port;
  await new Promise((r) => probe.close(r));
  const objectStore =
    process.env.TEST_S3 === "1" ? await startS3Fixture() : null;
  const server = spawn(process.execPath, ["server.mjs"], {
    env: {
      ...process.env,
      TURSO_DATABASE_URL: "",
      TURSO_AUTH_TOKEN: "",
      UPLOAD_DRIVER: "local",
      VERCEL: "",
      ...(objectStore?.env || {}),
      NODE_ENV: "test",
      DEMO_MODE: "1",
      AUTH_TEST_UNVERIFIED: "1",
      PORT: String(port),
      DB_PATH: path,
      MODERATOR_EMAILS: "legacy@example.test",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Server did not start: " + output)),
      10000,
    );
    server.stdout.on("data", (chunk) => {
      output += chunk;
      if (output.includes("Devdevian is ready")) {
        clearTimeout(timer);
        resolve();
      }
    });
    server.stderr.on("data", (c) => (output += c));
    server.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error("Server exited " + code + ": " + output));
    });
  });
  const base = `http://127.0.0.1:${port}`;
  const makeClient = () => {
    let cookie = "";
    const request = async (
      path,
      body,
      method = body ? "POST" : "GET",
      headers = {},
    ) => {
      const r = await fetch(base + "/api" + path, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(cookie ? { Cookie: cookie } : {}),
          ...headers,
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const jar = new Map(
        cookie
          .split("; ")
          .filter(Boolean)
          .map((v) => v.split("=")),
      );
      for (const raw of r.headers.getSetCookie()) {
        const [k, v] = raw.split(";")[0].split("=");
        if (v) jar.set(k, v);
        else jar.delete(k);
      }
      cookie = [...jar].map(([k, v]) => k + "=" + v).join("; ");
      let data = await r.json();
      if (data.posts?.items && data.posts.pagination)
        data.posts = Object.assign(data.posts.items, {
          pagination: data.posts.pagination,
        });
      if (data.items && data.pagination && Object.keys(data).length === 2)
        data = Object.assign(data.items, { pagination: data.pagination });
      return { status: r.status, data };
    };
    request.upload = async (name, bytes) => {
      const r = await fetch(base + "/api/uploads", {
        method: "POST",
        headers: {
          Cookie: cookie,
          "Content-Type": "application/octet-stream",
          "X-Filename": encodeURIComponent(name),
        },
        body: bytes,
      });
      return { status: r.status, data: await r.json() };
    };
    request.file = async (id) => {
      const r = await fetch(base + "/api/uploads/" + id, {
        headers: { Cookie: cookie },
      });
      return {
        status: r.status,
        bytes: Buffer.from(await r.arrayBuffer()),
        type: r.headers.get("content-type"),
      };
    };
    return request;
  };
  const anon = makeClient(),
    author = makeClient(),
    other = makeClient(),
    legacy = makeClient();
  let authorId,
    otherId,
    post,
    reply,
    child,
    otherPost,
    event,
    project,
    privateSpace;
  try {
    await t.test(
      "serves the Devdevian build and preserves migrated accounts and posts",
      async () => {
        const r = await fetch(base);
        assert.equal(r.status, 200);
        assert.match(await r.text(), /Devdevian/);
        const old = await legacy("/login", {
          email: "legacy@example.test",
          password: "Legacy-test-password",
        });
        assert.equal(old.status, 200);
        assert.equal(old.data.user.stack, "");
        const posts = await anon("/posts");
        assert.equal(posts.data[0].kind, "discussion");
        assert.equal(posts.data[0].title, "Existing conversation");
        const activity = await legacy("/notifications");
        assert.ok(
          activity.data.items.some(
            (n) => n.id === 1 && n.post_id === 1 && n.event_id === null,
          ),
        );
      },
    );
    await t.test("real accounts and protected writes", async () => {
      assert.equal((await anon("/posts", { title: "hello" })).status, 401);
      let r = await author("/register", {
        name: "Author",
        username: "curious_builder",
        email: "author@example.test",
        password: "A-long-test-password",
      });
      assert.equal(r.status, 200);
      authorId = r.data.user.id;
      assert.ok(!("password" in r.data.user));
      r = await other("/register", {
        name: "Reviewer",
        email: "reviewer@example.test",
        password: "Another-test-password",
      });
      otherId = r.data.user.id;
      assert.equal(r.status, 200);
    });
    await t.test(
      "validates publication type and community, then creates a question",
      async () => {
        const input = {
          title: "How should I implement this?",
          body: "I would appreciate a second opinion on the retry strategy.",
          kind: "question",
          topic: "web",
          stack: "TypeScript, Node.js",
        };
        assert.equal(
          (await author("/posts", { ...input, kind: "not-valid" })).status,
          400,
        );
        assert.equal(
          (await author("/posts", { ...input, topic: "not-valid" })).status,
          400,
        );
        const r = await author("/posts", input);
        assert.equal(r.status, 201);
        post = r.data;
        assert.equal(post.reply_count, 0);
        assert.equal(post.user_id, authorId);
      },
    );
    await t.test(
      "replies, nesting and participation history persist",
      async () => {
        let r = await other(`/posts/${post.id}/replies`, {
          body: "Try exponential backoff with jitter and a bounded timeout.",
        });
        assert.equal(r.status, 201);
        reply = r.data;
        r = await author(`/posts/${post.id}/replies`, {
          body: "Thanks! How would you cap the timeout?",
          parent_id: reply.id,
        });
        assert.equal(r.status, 201);
        child = r.data;
        const detail = await anon("/posts/" + post.id);
        assert.equal(detail.data.reply_count, 2);
        assert.equal(detail.data.replies.length, 1);
        assert.equal(
          (await anon(`/posts/${post.id}/replies?parent_id=${reply.id}`))
            .data[0].parent_id,
          reply.id,
        );
        const participated = await other("/participated");
        assert.equal(participated.data[0].id, post.id);
      },
    );
    await t.test(
      "only the author may accept an answer, and resolved topics remain writable",
      async () => {
        assert.equal(
          (
            await other(
              `/posts/${post.id}/solution`,
              { reply_id: reply.id },
              "PATCH",
            )
          ).status,
          403,
        );
        let r = await author(
          `/posts/${post.id}/solution`,
          { reply_id: reply.id },
          "PATCH",
        );
        assert.equal(r.status, 200);
        assert.equal(r.data.status, "resolved");
        assert.ok(r.data.resolved_at);
        assert.equal(
          (
            await other(`/posts/${post.id}/replies`, {
              body: "One more useful detail: apply a retry budget.",
            })
          ).status,
          201,
        );
        r = await author(
          `/posts/${post.id}/solution`,
          { reply_id: null },
          "PATCH",
        );
        assert.equal(r.data.status, "open");
        assert.equal(r.data.resolved_at, null);
      },
    );
    await t.test("votes toggle per account and bookmarks persist", async () => {
      let r = await other(`/posts/${post.id}/vote`, {}, "POST");
      assert.equal(r.data.vote_count, 1);
      assert.equal(r.data.voted, true);
      r = await other(`/posts/${post.id}/vote`, {}, "POST");
      assert.equal(r.data.vote_count, 0);
      r = await other("/membership", { kind: "post", item: String(post.id) });
      assert.ok(
        r.data.user.memberships.some(
          (m) => m.kind === "post" && m.item === String(post.id),
        ),
      );
    });
    await t.test(
      "project creation creates one canonical feedback thread and validates links",
      async () => {
        const input = {
          name: "Retry Lab",
          description:
            "A small tool to visualize different retry strategies in a background worker.",
          url: "https://example.test/retry",
          repo: "https://github.com/example/retry",
          topic: "devops",
          stack: "TypeScript",
          stage: "Prototype",
          help: "Could you review the first-run experience and the timeout controls?",
        };
        assert.equal(
          (await author("/projects", { ...input, url: "javascript:alert(1)" }))
            .status,
          400,
        );
        let r = await author("/projects", input);
        assert.equal(r.status, 201);
        project = r.data;
        assert.ok(project.post_id);
        const detail = await anon("/posts/" + project.post_id);
        assert.equal(detail.data.kind, "showcase");
        assert.equal(detail.data.topic, "devops");
        assert.match(detail.data.body, /What I need help with/);
        assert.equal((await author("/projects", input)).status, 409);
      },
    );
    await t.test(
      "cross-thread solutions and nested replies are rejected",
      async () => {
        const r = await other(`/posts/${project.post_id}/replies`, {
          body: "I can help with this.",
        });
        assert.equal(r.status, 201);
        assert.equal(
          (
            await author(
              `/posts/${post.id}/solution`,
              { reply_id: r.data.id },
              "PATCH",
            )
          ).status,
          400,
        );
        assert.equal(
          (
            await author(`/posts/${post.id}/replies`, {
              parent_id: r.data.id,
              body: "Wrong thread.",
            })
          ).status,
          400,
        );
      },
    );
    await t.test(
      "events convert organizer timezone to UTC and reject nonexistent DST times",
      async () => {
        const input = {
          title: "Live retry review",
          description:
            "Bring your worker code and let’s work through failure modes together.",
          topic: "devops",
          local_start: "2030-01-15T18:00",
          timezone: "Europe/Kyiv",
          duration: 60,
          url: "https://meet.example.test/private-room",
        };
        assert.equal(
          (await author("/events", { ...input, timezone: "Invalid/Timezone" }))
            .status,
          400,
        );
        assert.equal(
          (
            await author("/events", {
              ...input,
              local_start: "2030-03-10T02:30",
              timezone: "America/New_York",
            })
          ).status,
          400,
        );
        const r = await author("/events", input);
        assert.equal(r.status, 201);
        event = r.data;
        const list = await author("/events");
        assert.equal(list.data[0].start_at, "2030-01-15T16:00:00.000Z");
        assert.equal(list.data[0].end_at, "2030-01-15T17:00:00.000Z");
        assert.equal(list.data[0].organizer_name, "Author");
        assert.ok(list.data[0].url);
        // The same instant is Jan 16 in Tokyo and Jan 15 in Kyiv.
        assert.equal(
          (await anon("/events?date=2030-01-16&timezone=Asia%2FTokyo")).data[0]
            .id,
          event.id,
        );
        assert.equal(
          (await anon("/events?date=2030-01-15&timezone=Asia%2FTokyo")).data
            .length,
          0,
        );
        assert.equal((await anon("/events?date=2030-02-30")).status, 400);
        assert.equal(
          (await anon("/events?date=2030-01-15&timezone=Invalid%2FZone"))
            .status,
          400,
        );
      },
    );
    await t.test(
      "meeting links require attendance or ownership; attendance is unique",
      async () => {
        assert.ok(!("url" in (await anon("/events")).data[0]));
        assert.ok(!("url" in (await other("/events")).data[0]));
        assert.equal(
          (
            await other("/membership", {
              kind: "event",
              item: String(event.id),
            })
          ).status,
          200,
        );
        let list = await other("/events");
        assert.equal(list.data[0].attendee_count, 1);
        assert.equal(
          list.data[0].url,
          "https://meet.example.test/private-room",
        );
        await other("/membership", { kind: "event", item: String(event.id) });
        list = await other("/events");
        assert.equal(list.data[0].attendee_count, 0);
        assert.ok(!("url" in list.data[0]));
      },
    );
    await t.test(
      "community memberships and developer profile are persistent and public profiles omit private data",
      async () => {
        let r = await author("/communities", {
          name: "Private test team",
          description: "An isolated space for a small test team.",
        });
        privateSpace = r.data.id;
        assert.equal(r.status, 201);
        assert.equal(
          (await anon("/communities")).data.find((c) => c.id === privateSpace)
            .members,
          1,
        );
        assert.equal(
          (await author("/membership", { kind: "group", item: "fake" })).status,
          404,
        );
        r = await author(
          "/developer-profile",
          {
            name: "Author Updated",
            bio: "I build useful software.",
            location: "Kyiv",
            role: "Developer",
            stack: "TypeScript, React",
            github: "https://github.com/example",
            website: "https://example.test",
          },
          "PATCH",
        );
        assert.equal(r.status, 200);
        assert.equal(r.data.user.stack, "TypeScript, React");
        const publicUser = await anon("/users/" + authorId);
        for (const key of ["email", "password", "memberships"])
          assert.ok(!(key in publicUser.data));
        assert.equal(publicUser.data.name, "Author Updated");
      },
    );
    await t.test(
      "reports are saved and invalid IDs, origins and payloads are rejected",
      async () => {
        assert.equal(
          (
            await other(`/posts/${post.id}/report`, {
              reason: "Repeated spam links.",
            })
          ).status,
          201,
        );
        assert.equal((await anon("/posts/999999")).status, 404);
        assert.equal(
          (await other("/membership", { kind: "post", item: "999999" })).status,
          404,
        );
        assert.equal(
          (
            await other(
              "/posts",
              {
                title: "Blocked",
                body: "A cross-origin write.",
                kind: "discussion",
                topic: "web",
              },
              "POST",
              { Origin: "https://attacker.test" },
            )
          ).status,
          403,
        );
      },
    );
    await t.test(
      "notifications are private, target authors and reply recipients, and skip self-replies",
      async () => {
        assert.equal((await anon("/notifications")).status, 401);
        const before = await author("/notifications");
        assert.ok(
          before.data.items.some(
            (n) =>
              n.type === "reply" &&
              n.post_id === post.id &&
              n.actor_id === otherId,
          ),
        );
        const mine = before.data.items[0];
        assert.equal(
          (await other(`/notifications/${mine.id}/read`, {}, "PATCH")).status,
          404,
        );
        assert.equal(
          (await author(`/notifications/${mine.id}/read`, {}, "PATCH")).status,
          200,
        );
        await author(`/posts/${post.id}/replies`, {
          body: "Adding context to my own original question.",
        });
        const after = await author("/notifications");
        assert.equal(after.data.items.length, before.data.items.length);
        assert.ok(after.data.items.find((n) => n.id === mine.id).read_at);
        const recipients = await other("/notifications");
        assert.ok(
          recipients.data.items.some(
            (n) => n.type === "reply" && n.reply_id === child.id,
          ),
        );
      },
    );
    await t.test(
      "post editing is author-only and rejects stale revisions without losing replies",
      async () => {
        const original = (await anon("/posts/" + post.id)).data;
        const edit = {
          title: "Updated: reviewing a retry strategy",
          body: "Updated context: the worker needs a bounded retry strategy with exponential backoff.",
          stack: "TypeScript, Workers",
          revision: original.revision,
        };
        assert.equal(
          (await other("/posts/" + post.id, edit, "PATCH")).status,
          403,
        );
        assert.equal(
          (await author("/posts/" + post.id, edit, "PATCH")).status,
          200,
        );
        assert.equal(
          (
            await author(
              "/posts/" + post.id,
              { ...edit, title: "Stale content from another tab" },
              "PATCH",
            )
          ).status,
          409,
        );
        const updated = (await anon("/posts/" + post.id)).data;
        assert.equal(updated.title, edit.title);
        assert.equal(updated.revision, original.revision + 1);
        assert.ok(updated.updated_at);
        assert.equal(updated.replies.length, original.replies.length);
        assert.equal(
          (await author("/posts/" + project.post_id, edit, "PATCH")).status,
          409,
        );
      },
    );
    await t.test(
      "reply editing preserves nesting, protects ownership, and notifies when an accepted answer changes",
      async () => {
        const original = (await anon("/posts/" + post.id)).data.replies.find(
          (r) => r.id === reply.id,
        );
        const edit = {
          body: "Use jitter, an overall deadline, and a maximum retry count.",
          revision: original.revision,
        };
        assert.equal(
          (await author("/replies/" + reply.id, edit, "PATCH")).status,
          403,
        );
        assert.equal(
          (
            await author(
              `/posts/${post.id}/solution`,
              { reply_id: reply.id },
              "PATCH",
            )
          ).status,
          200,
        );
        assert.equal(
          (await other("/replies/" + reply.id, edit, "PATCH")).status,
          200,
        );
        assert.equal(
          (await other("/replies/" + reply.id, edit, "PATCH")).status,
          409,
        );
        const detail = (await anon("/posts/" + post.id)).data;
        assert.equal(detail.accepted_reply_id, reply.id);
        assert.equal(
          detail.replies.find((r) => r.id === reply.id).body,
          edit.body,
        );
        assert.equal(
          (
            await anon(`/posts/${post.id}/replies?parent_id=${reply.id}`)
          ).data.find((r) => r.id === child.id).parent_id,
          reply.id,
        );
        const notifications = await author("/notifications");
        assert.ok(
          notifications.data.items.some(
            (n) => n.type === "solution_edited" && n.reply_id === reply.id,
          ),
        );
        const reviewer = await other("/notifications");
        assert.equal(
          reviewer.data.items.filter(
            (n) => n.type === "solution" && n.reply_id === reply.id,
          ).length,
          1,
        );
        assert.equal(
          (
            await author(`/posts/${post.id}/replies`, {
              body: "Invalid parent request.",
              parent_id: {},
            })
          ).status,
          400,
        );
      },
    );
    await t.test(
      "project updates retain the original feedback thread and notify its readers",
      async () => {
        const before = (await anon("/posts")).data.length;
        const input = {
          title: "We simplified the first-run flow",
          body: "Thanks for the feedback. We removed two steps and added a clearer timeout control.",
        };
        assert.equal(
          (await other(`/projects/${project.id}/updates`, input)).status,
          403,
        );
        const result = await author(`/projects/${project.id}/updates`, input);
        assert.equal(result.status, 201);
        assert.equal(result.data.post_id, project.post_id);
        const detail = (await anon("/posts/" + project.post_id)).data;
        assert.equal(detail.project.id, project.id);
        assert.equal(detail.updates[0].title, input.title);
        assert.equal((await anon("/posts")).data.length, before);
        const n = await other("/notifications");
        assert.ok(
          n.data.items.some(
            (n) => n.type === "project_update" && n.post_id === project.post_id,
          ),
        );
      },
    );
    await t.test(
      "mark-all-read respects the visible boundary and leaves newer notifications unread",
      async () => {
        const before = (await author("/notifications")).data;
        const boundary = before.items[0].id;
        await legacy(`/posts/${post.id}/replies`, {
          body: "A fresh answer arrived while the notification center was open.",
        });
        assert.equal(
          (
            await author(
              "/notifications/read-all",
              { through_id: boundary },
              "PATCH",
            )
          ).status,
          200,
        );
        const after = (await author("/notifications")).data;
        assert.ok(
          after.items.filter((n) => n.id <= boundary).every((n) => n.read_at),
        );
        assert.ok(after.items.some((n) => n.id > boundary && !n.read_at));
        assert.ok(after.unread_count > 0);
        assert.equal(
          (
            await author(
              "/notifications/read-all",
              { through_id: "all" },
              "PATCH",
            )
          ).status,
          400,
        );
      },
    );
    await t.test(
      "author archival is reversible and cannot bypass moderator restrictions",
      async () => {
        assert.equal(
          (await other(`/posts/${post.id}/lifecycle`, { action: "archive" }))
            .status,
          403,
        );
        assert.equal(
          (await author(`/posts/${post.id}/lifecycle`, { action: "archive" }))
            .status,
          200,
        );
        let detail = (await anon("/posts/" + post.id)).data;
        assert.ok(detail.archived_at);
        assert.ok(detail.replies.length > 0);
        assert.equal(
          (
            await other(`/posts/${post.id}/replies`, {
              body: "This should not post.",
            })
          ).status,
          409,
        );
        assert.equal(
          (await author(`/posts/${post.id}/lifecycle`, { action: "restore" }))
            .status,
          200,
        );
        assert.equal(
          (
            await other(`/posts/${post.id}/lifecycle`, {
              action: "lock",
              reason: "No moderator role.",
            })
          ).status,
          403,
        );
      },
    );
    await t.test(
      "moderation queue and decisions are role-protected and auditable",
      async () => {
        assert.equal((await other("/moderation/reports")).status, 403);
        const current = await other(
          "/developer-profile",
          {
            name: "Reviewer",
            role: "moderator",
            bio: "",
            location: "",
            stack: "",
            github: "",
            website: "",
          },
          "PATCH",
        );
        assert.equal(current.data.user.platform_role, "member");
        assert.equal((await other("/moderation/reports")).status, 403);
        const queue = await legacy("/moderation/reports");
        assert.equal(queue.status, 200);
        const report = queue.data.items.find((r) => r.post_id === post.id);
        assert.ok(report);
        assert.equal(
          (
            await legacy(
              `/moderation/reports/${report.id}`,
              {
                status: "resolved",
                note: "Pausing replies while the reported content is reviewed.",
                lock: true,
              },
              "PATCH",
            )
          ).status,
          200,
        );
        assert.equal(
          (
            await legacy(
              `/moderation/reports/${report.id}`,
              { status: "dismissed", note: "A competing review." },
              "PATCH",
            )
          ).status,
          409,
        );
        assert.ok((await anon("/posts/" + post.id)).data.locked_at);
        await author(`/posts/${post.id}/lifecycle`, { action: "restore" });
        assert.equal(
          (
            await other(`/posts/${post.id}/replies`, {
              body: "Still restricted.",
            })
          ).status,
          409,
        );
        assert.equal(
          (await legacy(`/posts/${post.id}/lifecycle`, { action: "unlock" }))
            .status,
          200,
        );
        assert.equal(
          (
            await other(`/posts/${post.id}/replies`, {
              body: "The conversation is open again.",
            })
          ).status,
          201,
        );
        assert.ok(
          (await legacy("/moderation/reports")).data.log.some(
            (l) => l.action === "report_resolved_lock",
          ),
        );
      },
    );
    await t.test(
      "event editing protects ownership and notifies attendees with event links",
      async () => {
        await other("/membership", { kind: "event", item: String(event.id) });
        const current = (await author("/events")).data.find(
          (e) => e.id === event.id,
        );
        const input = {
          title: "Updated live retry review",
          description:
            "Bring your retry worker and discuss robust failure handling together.",
          topic: "devops",
          local_start: "2030-01-16T19:00",
          timezone: "Europe/Kyiv",
          duration: 90,
          url: current.url,
          revision: current.revision,
        };
        assert.equal(
          (await other("/events/" + event.id, input, "PATCH")).status,
          403,
        );
        assert.equal(
          (await author("/events/" + event.id, input, "PATCH")).status,
          200,
        );
        assert.equal(
          (await author("/events/" + event.id, input, "PATCH")).status,
          409,
        );
        const n = (await other("/notifications")).data.items.find(
          (n) => n.type === "event_updated" && n.event_id === event.id,
        );
        assert.ok(n);
        assert.equal(n.post_id, null);
        const changed = (await author("/events")).data.find(
          (e) => e.id === event.id,
        );
        assert.equal(changed.start_at, "2030-01-16T17:00:00.000Z");
      },
    );
    await t.test(
      "event cancellation closes registration and attendee meeting links; restoration is reversible",
      async () => {
        let current = (await author("/events")).data.find(
          (e) => e.id === event.id,
        );
        assert.equal(
          (
            await author(`/events/${event.id}/lifecycle`, {
              action: "cancel",
              revision: current.revision,
            })
          ).status,
          200,
        );
        assert.ok(
          !(
            "url" in
            (await other("/events")).data.find((e) => e.id === event.id)
          ),
        );
        assert.equal(
          (
            await legacy("/membership", {
              kind: "event",
              item: String(event.id),
            })
          ).status,
          409,
        );
        assert.ok(
          (await other("/notifications")).data.items.some(
            (n) => n.type === "event_cancelled" && n.event_id === event.id,
          ),
        );
        current = (await author("/events")).data.find((e) => e.id === event.id);
        assert.equal(
          (
            await author(`/events/${event.id}/lifecycle`, {
              action: "restore",
              revision: current.revision,
            })
          ).status,
          200,
        );
        assert.ok(
          (await other("/events")).data.find((e) => e.id === event.id).url,
        );
      },
    );
    await t.test(
      "calendar export contains UTC dates, revision and no private meeting URL",
      async () => {
        const r = await fetch(base + `/api/events/${event.id}/calendar`);
        assert.equal(r.status, 200);
        assert.match(r.headers.get("content-type"), /text\/calendar/);
        const text = await r.text();
        assert.match(text, /BEGIN:VCALENDAR/);
        assert.match(text, /DTSTART:20300116T170000Z/);
        assert.match(text, /STATUS:CONFIRMED/);
        assert.ok(!text.includes("https://meet.example.test/private-room"));
        assert.ok(
          text.split("\r\n").every((line) => Buffer.byteLength(line) <= 75),
        );
      },
    );
    await t.test(
      "topic tags and private communities are different entities",
      async () => {
        const tags = await anon("/topics");
        assert.ok(tags.data.some((t) => t.id === "web"));
        assert.equal(
          (await other("/membership", { kind: "group", item: privateSpace }))
            .status,
          403,
        );
        assert.equal(
          (
            await other("/posts", {
              title: "Cannot publish here yet",
              body: "A private post from a non-member should be rejected.",
              kind: "discussion",
              topic: "web",
              community_id: privateSpace,
            })
          ).status,
          403,
        );
        assert.equal(
          (await author("/membership", { kind: "group", item: privateSpace }))
            .status,
          409,
        );
      },
    );
    let privatePost, upload;
    await t.test(
      "uploads belong to their uploader and inherit private-post access",
      async () => {
        const png = Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
          "base64",
        );
        upload = await author.upload("preview.png", png);
        assert.equal(upload.status, 201);
        assert.equal(upload.data.mime, "image/png");
        assert.equal((await anon.file(upload.data.id)).status, 404);
        assert.equal((await author.file(upload.data.id)).status, 200);
        assert.equal(
          (
            await other("/posts", {
              title: "Borrowed image attempt",
              body: "This cannot use someone else’s pending attachment.",
              kind: "question",
              topic: "web",
              attachment_ids: [upload.data.id],
            })
          ).status,
          400,
        );
        const created = await author("/posts", {
          title: "Private architecture notes",
          body: "This private discussion must never appear in the shared public feed.",
          kind: "discussion",
          topic: "web",
          community_id: privateSpace,
          attachment_ids: [upload.data.id],
        });
        assert.equal(created.status, 201);
        privatePost = created.data;
        assert.equal(privatePost.attachments[0].id, upload.data.id);
        assert.equal((await anon.file(upload.data.id)).status, 404);
        assert.equal(
          (
            await author.upload(
              "script.svg",
              Buffer.from('<svg onload="alert(1)"></svg>'),
            )
          ).status,
          400,
        );
      },
    );
    await t.test(
      "private contents cannot leak through direct links, searches, profiles, bookmarks or moderator queues",
      async () => {
        assert.ok(
          !(await author("/posts")).data.some((p) => p.id === privatePost.id),
        );
        assert.equal(
          (await other("/posts?community=" + privateSpace)).status,
          403,
        );
        for (const client of [anon, other, legacy]) {
          assert.equal((await client("/posts/" + privatePost.id)).status, 404);
          assert.equal(
            (await client(`/posts/${privatePost.id}/replies`)).status,
            404,
          );
          assert.ok(
            !(await client("/posts?q=Private architecture")).data.some(
              (p) => p.id === privatePost.id,
            ),
          );
          assert.ok(
            !(await client("/users/" + authorId)).data.posts.some(
              (p) => p.id === privatePost.id,
            ),
          );
        }
        assert.equal(
          (
            await other("/membership", {
              kind: "post",
              item: String(privatePost.id),
            })
          ).status,
          404,
        );
        await author(`/posts/${privatePost.id}/report`, {
          reason: "A private report for member moderators only.",
        });
        assert.ok(
          !(await legacy("/moderation/reports")).data.items.some(
            (r) => r.post_id === privatePost.id,
          ),
        );
        assert.equal(
          (
            await legacy(`/posts/${privatePost.id}/lifecycle`, {
              action: "lock",
              reason: "Not a member.",
            })
          ).status,
          404,
        );
      },
    );
    await t.test(
      "only owner approval grants membership; leaving revokes file and notification access",
      async () => {
        assert.equal(
          (await other(`/communities/${privateSpace}/request`, {})).status,
          200,
        );
        const pending = await author(`/communities/${privateSpace}/requests`);
        assert.equal(pending.data.length, 1);
        assert.equal(
          (
            await other(
              `/communities/${privateSpace}/requests/${pending.data[0].id}`,
              { action: "approve" },
              "PATCH",
            )
          ).status,
          403,
        );
        assert.equal(
          (
            await author(
              `/communities/${privateSpace}/requests/${pending.data[0].id}`,
              { action: "approve" },
              "PATCH",
            )
          ).status,
          200,
        );
        assert.equal((await other("/posts/" + privatePost.id)).status, 200);
        assert.equal((await other.file(upload.data.id)).status, 200);
        assert.ok(
          !(await other("/users/" + authorId)).data.posts.some(
            (p) => p.id === privatePost.id,
          ),
        );
        assert.ok(
          (await author("/posts?author=me")).data.some(
            (p) => p.id === privatePost.id,
          ),
        );
        const response = await other(`/posts/${privatePost.id}/replies`, {
          body: "A private architecture review from an approved member.",
        });
        assert.equal(response.status, 201);
        await author(`/posts/${privatePost.id}/replies`, {
          body: "A private reply to your private review.",
          parent_id: response.data.id,
        });
        assert.ok(
          (await other("/notifications")).data.items.some(
            (n) => n.post_id === privatePost.id,
          ),
        );
        assert.equal(
          (await other("/membership", { kind: "group", item: privateSpace }))
            .status,
          200,
        );
        assert.equal((await other("/posts/" + privatePost.id)).status, 404);
        assert.equal((await other.file(upload.data.id)).status, 404);
        assert.ok(
          !(await other("/notifications")).data.items.some(
            (n) => n.post_id === privatePost.id,
          ),
        );
        assert.ok(
          !(await other("/participated")).data.some(
            (p) => p.id === privatePost.id,
          ),
        );
      },
    );
    await t.test(
      "publication types validate distinct content and attachments appear in the public card data",
      async () => {
        const input = {
          title: "Please review this retry function",
          body: "The worker runs in a server-side queue and retries failed requests.",
          kind: "review",
          topic: "web",
        };
        assert.equal((await author("/posts", input)).status, 400);
        const review = await author("/posts", {
          ...input,
          code: "async function retry() { return 1; }",
          review_focus: "Check correctness of retry behavior.",
        });
        assert.equal(review.status, 201);
        assert.match(review.data.code, /function retry/);
        const endpoint = `/posts/${review.data.id}/code-reviews`;
        let feedback = await anon(endpoint);
        assert.equal(feedback.status, 200);
        const hash = feedback.data.snippet_hash;
        const inputFeedback = {
          snippet_hash: hash,
          start_line: 1,
          end_line: 1,
          body: "Handle the rejected promise before returning.",
        };
        assert.equal((await anon(endpoint, inputFeedback)).status, 401);
        assert.equal(
          (await other(endpoint, { ...inputFeedback, end_line: 2 })).status,
          400,
        );
        assert.equal(
          (await other(endpoint, { ...inputFeedback, snippet_hash: "stale" }))
            .status,
          409,
        );
        const added = await other(endpoint, inputFeedback);
        assert.equal(added.status, 201);
        feedback = await author(endpoint);
        const remark = feedback.data.items[0];
        assert.equal(remark.quote, review.data.code);
        assert.equal(remark.outdated, false);
        const action = endpoint + "/" + added.data.id;
        assert.equal(
          (await other(action, { resolved: true, revision: 1 }, "PATCH"))
            .status,
          403,
        );
        assert.equal(
          (await author(action, { resolved: true, revision: 1 }, "PATCH"))
            .status,
          200,
        );
        assert.equal(
          (await author(action, { resolved: false, revision: 1 }, "PATCH"))
            .status,
          409,
        );
        assert.equal(
          (await anon(endpoint + "?status=open")).data.items.length,
          0,
        );
        assert.equal(
          (await anon(endpoint + "?status=resolved")).data.items.length,
          1,
        );
        assert.equal(
          (await author(action, { resolved: false, revision: 2 }, "PATCH"))
            .status,
          200,
        );
        const modified = await author(
          `/posts/${review.data.id}`,
          {
            ...input,
            revision: review.data.revision,
            code: "async function retry() { return 2; }",
            review_focus: "Check correctness of retry behavior.",
          },
          "PATCH",
        );
        assert.equal(modified.status, 200, JSON.stringify(modified.data));
        feedback = await anon(endpoint);
        assert.equal(feedback.data.items[0].outdated, true);
        assert.equal(feedback.data.items[0].quote, review.data.code);
        assert.equal(
          (await anon(endpoint + "?version=current")).data.items.length,
          0,
        );
        assert.equal((await other(endpoint, inputFeedback)).status, 409);
        const currentHash = feedback.data.snippet_hash;
        for (let i = 0; i < 12; i++)
          assert.equal(
            (
              await other(endpoint, {
                ...inputFeedback,
                snippet_hash: currentHash,
                body: "Additional bounded feedback " + i,
              })
            ).status,
            201,
          );
        const secondPage = await anon(endpoint + "?page=2");
        assert.equal(secondPage.data.pagination.total, 13);
        assert.equal(secondPage.data.items.length, 3);
        assert.equal(
          (
            await author(`/posts/${review.data.id}/lifecycle`, {
              action: "archive",
            })
          ).status,
          200,
        );
        assert.equal(
          (
            await other(endpoint, {
              ...inputFeedback,
              snippet_hash: currentHash,
            })
          ).status,
          409,
        );
        assert.equal(
          (
            await author(`/posts/${review.data.id}/lifecycle`, {
              action: "restore",
            })
          ).status,
          200,
        );
        for (let i = 0; i < 2; i++)
          assert.equal(
            (
              await other(endpoint, {
                ...inputFeedback,
                snippet_hash: currentHash,
              })
            ).status,
            201,
          );
        assert.equal(
          (
            await other(endpoint, {
              ...inputFeedback,
              snippet_hash: currentHash,
            })
          ).status,
          429,
        );
        // Removing a snippet must not erase or hide its earlier feedback.
        const removedSnippet = await author(
          `/posts/${review.data.id}`,
          {
            ...input,
            revision: (await author(`/posts/${review.data.id}`)).data.revision,
            code: "",
            repo_url: "https://example.test/repository",
            review_focus: "Check correctness of retry behavior.",
          },
          "PATCH",
        );
        assert.equal(removedSnippet.status, 200);
        assert.equal((await anon(endpoint)).data.pagination.total, 15);

        // A community's snippet and remarks must remain unreadable to outsiders.
        const privateReview = await author("/posts", {
          ...input,
          code: review.data.code,
          review_focus: "Check correctness of retry behavior.",
          community_id: privateSpace,
        });
        assert.equal(
          privateReview.status,
          201,
          JSON.stringify(privateReview.data),
        );
        assert.equal(
          (await anon(`/posts/${privateReview.data.id}/code-reviews`)).status,
          404,
        );

        const showcase = await other("/posts", {
          title: "A small retry visualizer",
          body: "A demonstration of how bounded retries behave under load.",
          kind: "showcase",
          topic: "web",
        });
        assert.equal(showcase.status, 400);
        const publicFile = await other.upload(
          "notes.txt",
          Buffer.from("Useful example notes."),
        );
        assert.equal(publicFile.status, 201);
        const publicPost = await other("/posts", {
          title: "Here is a small working demo",
          body: "I built a tiny tool and would appreciate feedback on the workflow.",
          kind: "showcase",
          topic: "web",
          attachment_ids: [publicFile.data.id],
        });
        assert.equal(publicPost.status, 201);
        assert.equal((await anon.file(publicFile.data.id)).status, 200);
        assert.ok(
          (await anon("/posts")).data.some((p) =>
            p.attachments?.some((f) => f.id === publicFile.data.id),
          ),
        );
      },
    );
    await t.test(
      "feed, root replies and every nested branch are server-paginated with direct-answer paths",
      async () => {
        const db = new DatabaseSync(path);
        const long = Number(
          db
            .prepare(
              "INSERT INTO posts(user_id,title,body,kind,topic) VALUES(?,?,?,'discussion','web')",
            )
            .run(
              authorId,
              "Pagination conversation",
              "A conversation with many independent roots and nested replies.",
            ).lastInsertRowid,
        );
        const roots = [];
        for (let i = 0; i < 55; i++)
          roots.push(
            Number(
              db
                .prepare(
                  "INSERT INTO replies(user_id,post_id,body) VALUES(?,?,?)",
                )
                .run(otherId, long, "Root reply " + i).lastInsertRowid,
            ),
          );
        let target;
        for (let i = 0; i < 25; i++)
          target = Number(
            db
              .prepare(
                "INSERT INTO replies(user_id,post_id,parent_id,body) VALUES(?,?,?,?)",
              )
              .run(authorId, long, roots[0], "Nested reply " + i)
              .lastInsertRowid,
          );
        for (let i = 0; i < 31; i++)
          db.prepare(
            "INSERT INTO posts(user_id,title,body,kind,topic) VALUES(?,?,?,'discussion','web')",
          ).run(
            authorId,
            "Page seed " + i,
            "A bounded feed item with a searchable unique marker.",
          );
        db.close();
        const d = (await anon("/posts/" + long)).data;
        assert.equal(d.replies.length, 10);
        assert.equal(d.reply_count, 80);
        assert.equal(d.reply_pagination.pages, 6);
        const page2 = (await anon(`/posts/${long}/replies?page=2`)).data;
        assert.equal(page2.length, 10);
        assert.ok(page2.every((r) => !d.replies.some((a) => a.id === r.id)));
        const nested = (
          await anon(`/posts/${long}/replies?parent_id=${roots[0]}&page=3`)
        ).data;
        assert.equal(nested.length, 5);
        assert.equal(nested.pagination.pages, 3);
        const linked = (await anon(`/posts/${long}?reply_id=${target}`)).data;
        assert.equal(linked.reply_path[1].page, 3);
        assert.equal(linked.reply_path[1].id, target);
        const feed = (await anon("/posts?page=2&limit=5&q=Page seed")).data;
        assert.equal(feed.length, 5);
        assert.equal(feed.pagination.total, 31);
        assert.equal(feed.pagination.pages, 7);
        assert.ok((await anon("/posts?limit=9999")).data.length <= 30);
        assert.equal(
          (await anon("/posts?q=Page seed&topic=ai")).data.pagination.total,
          0,
        );
      },
    );
    await t.test(
      "directories, profiles, notifications, project updates and moderation histories are bounded too",
      async () => {
        const db = new DatabaseSync(path);
        for (let i = 0; i < 17; i++) {
          db.prepare(
            "INSERT INTO private_communities(id,owner_id,name,description) VALUES(?,?,?,?)",
          ).run(
            "directory-" + i,
            otherId,
            "Directory seed " + i,
            "A private group with public directory metadata.",
          );
          const p = Number(
            db
              .prepare(
                "INSERT INTO posts(user_id,title,body,kind,topic) VALUES(?,?,?,'showcase','web')",
              )
              .run(
                authorId,
                "Project seed " + i,
                "A public project introduction for pagination testing.",
              ).lastInsertRowid,
          );
          db.prepare(
            "INSERT INTO projects(user_id,post_id,name,description,topic,stage,help) VALUES(?,?,?,?,?,?,?)",
          ).run(
            authorId,
            p,
            "Project seed " + i,
            "A bounded project directory sample.",
            "web",
            "Prototype",
            "Review the workflow.",
          );
          db.prepare(
            "INSERT INTO events(user_id,title,description,topic,start_at,end_at,timezone,url) VALUES(?,?,?,?,?,?,?,?)",
          ).run(
            authorId,
            "Calendar seed " + i,
            "A public test meeting for pagination.",
            "web",
            "2030-01-20T10:00:00.000Z",
            "2030-01-20T11:00:00.000Z",
            "UTC",
            "https://example.test/meeting",
          );
          db.prepare(
            "INSERT INTO notifications(recipient_id,actor_id,post_id,type,event_key) VALUES(?,?,?,?,?)",
          ).run(authorId, otherId, post.id, "reply", "pagination-seed-" + i);
          db.prepare(
            "INSERT INTO moderation_log(actor_id,post_id,action,reason) VALUES(?,?,?,?)",
          ).run(1, post.id, "reviewed", "Pagination audit entry.");
          db.prepare(
            "INSERT INTO reports(user_id,post_id,reason) VALUES(?,?,?)",
          ).run(otherId, p, "Pagination test report.");
        }
        for (let i = 0; i < 6; i++)
          db.prepare(
            "INSERT INTO project_updates(project_id,user_id,title,body) VALUES(?,?,?,?)",
          ).run(
            project.id,
            authorId,
            "Update " + i,
            "Progress for paginated project history.",
          );
        db.close();
        for (const path of [
          "/communities?q=Directory seed",
          "/projects?q=Project seed",
          "/events?q=Calendar seed",
        ]) {
          const d = (await anon(path + "&page=2&limit=5")).data;
          assert.equal(d.length, 5);
          assert.equal(d.pagination.page, 2);
          assert.equal(d.pagination.total, 17);
        }
        const profile = (await anon("/users/" + authorId + "?page=2&limit=5"))
          .data;
        assert.equal(profile.posts.length, 5);
        assert.equal(profile.posts.pagination.page, 2);
        const n = (await author("/notifications?page=2&limit=5")).data;
        assert.equal(n.items.length, 5);
        assert.equal(n.pagination.page, 2);
        const updates = (
          await anon("/posts/" + project.post_id + "?updates_page=2")
        ).data;
        assert.equal(updates.updates.length, 2);
        assert.equal(updates.updates_pagination.page, 2);
        const queue = (
          await legacy("/moderation/reports?page=2&limit=5&log_page=2")
        ).data;
        assert.equal(queue.items.length, 5);
        assert.equal(queue.log.length, 5);
        assert.equal(queue.pagination.page, 2);
        assert.equal(queue.log_pagination.page, 2);
      },
    );
    await t.test(
      "custom catalogs normalize duplicates and dynamic topics work in global search",
      async () => {
        const fresh = makeClient();
        await fresh("/register", {
          name: "Catalog builder",
          email: "catalog@example.test",
          password: "Catalog-password123",
        });
        let r = await fresh("/taxonomy/topic", {
          name: "  Quantum   Computing  ",
        });
        assert.equal(r.status, 201);
        const topic = r.data;
        assert.equal(
          (
            await fresh("/taxonomy/topic", {
              name: "Ｑｕａｎｔｕｍ Ｃｏｍｐｕｔｉｎｇ",
            })
          ).status,
          409,
        );
        assert.equal(
          (
            await fresh("/posts", {
              title: "A valid title without a topic",
              body: "A valid message missing its topic selection.",
              kind: "discussion",
            })
          ).status,
          400,
        );
        assert.equal(
          (await fresh("/taxonomy/topic", { name: "quantum computing" }))
            .status,
          409,
        );
        assert.equal(
          (await anon("/taxonomy/topic", { name: "Anonymous topic" })).status,
          401,
        );
        const created = await fresh("/posts", {
          title: "Quantum search sentinel",
          body: "A public question with a newly created topic.",
          kind: "discussion",
          topic: topic.id,
          stack: "Rust",
        });
        assert.equal(created.status, 201);
        const list = await anon("/posts?topic=" + topic.id);
        assert.ok(list.data.every((p) => p.topic === topic.id));
        const catalog = await anon("/taxonomy/topic?q=quantum");
        assert.equal(catalog.data[0].post_count, 1);
        const result = await anon("/search?q=Quantum&topic=" + topic.id);
        assert.ok(result.data.some((p) => p.id === created.data.id));
        const needle = encodeURIComponent(privatePost.title);
        assert.equal((await anon("/search?q=" + needle)).data.length, 0);
        assert.ok(
          (await author("/search?q=" + needle + "&scope=private")).data.some(
            (p) => p.id === privatePost.id,
          ),
        );
        const tech = await fresh("/taxonomy/technology", {
          name: "My New Tool",
        });
        assert.equal(tech.status, 201);
        const unicodePost = await fresh("/posts", {
          title: "Дискуссия о новых браузерах",
          body: "Обсуждаем интерфейсы и сообщество разработчиков.",
          kind: "discussion",
          topic: topic.id,
        });
        assert.equal(unicodePost.status, 201);
        assert.ok(
          (
            await anon("/search?q=" + encodeURIComponent("БРАУЗЕРАХ дискуссия"))
          ).data.some((p) => p.id === unicodePost.data.id),
        );
        assert.equal(
          (await fresh("/taxonomy/technology", { name: "my new tool" })).status,
          409,
        );
      },
    );
    await t.test(
      "branded media, arbitrary links and teams persist with ownership checks",
      async () => {
        const image = await author.upload(
          "logo.png",
          Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]),
        );
        assert.equal(image.status, 201);
        assert.equal((await anon.file(image.data.id)).status, 404);
        const body = {
          logo: image.data.id,
          screenshots: [image.data.id],
          links: [{ label: "Documentation", url: "https://example.test/docs" }],
          team: [{ user_id: otherId, role: "Chief curiosity officer" }],
        };
        assert.equal(
          (await other("/details/project/" + project.id, body, "PUT")).status,
          403,
        );
        assert.equal(
          (await author("/details/project/" + project.id, body, "PUT")).status,
          200,
        );
        const saved = (
          await anon(
            "/projects?author=" +
              authorId +
              "&q=" +
              encodeURIComponent(project.name),
          )
        ).data.find((p) => p.id === project.id);
        assert.equal(saved.logo, image.data.id);
        assert.equal(saved.team[0].role, "Chief curiosity officer");
        assert.equal(saved.links[0].label, "Documentation");
        assert.equal((await anon.file(image.data.id)).status, 200);
        assert.equal(
          (
            await author(
              "/details/user/" + authorId,
              { avatar: image.data.id },
              "PUT",
            )
          ).status,
          200,
        );
        const hostedEvent = (await anon("/events")).data.find(
          (item) => item.id === event.id,
        );
        assert.equal(hostedEvent.organizer_avatar, image.data.id);

        assert.equal(
          (
            await author(
              "/details/post/" + privatePost.id,
              { logo: image.data.id },
              "PUT",
            )
          ).status,
          400,
        );
        assert.equal(
          (
            await author(
              "/details/user/" + authorId,
              { avatar: upload.data.id },
              "PUT",
            )
          ).status,
          400,
        ); // a private-post attachment cannot become a public avatar
        assert.equal(
          (
            await author(
              "/details/project/" + project.id,
              { links: [{ label: "Unsafe", url: "javascript:alert(1)" }] },
              "PUT",
            )
          ).status,
          400,
        );
      },
    );
    await t.test(
      "validators act only inside their community and lose rights when removed",
      async () => {
        await other("/communities/" + privateSpace + "/request", {});
        let pending = (
          await author("/communities/" + privateSpace + "/requests")
        ).data.find((r) => r.user_id === otherId);
        await author(
          "/communities/" + privateSpace + "/requests/" + pending.id,
          { action: "approve" },
          "PATCH",
        );
        assert.equal(
          (
            await other(
              "/communities/" + privateSpace + "/validators",
              { user_ids: [otherId] },
              "PUT",
            )
          ).status,
          403,
        );
        assert.equal(
          (
            await author(
              "/communities/" + privateSpace + "/validators",
              { user_ids: [otherId] },
              "PUT",
            )
          ).status,
          200,
        );
        assert.equal(
          (await other("/communities/" + privateSpace + "/requests")).status,
          200,
        );
        assert.equal((await other("/me")).data.user.can_moderate, true);
        assert.equal(
          (
            await other("/posts/" + privatePost.id + "/lifecycle", {
              action: "remove",
              reason: "Spam removed by a validator.",
            })
          ).status,
          200,
        );
        assert.ok(
          !(await author("/posts?community=" + privateSpace)).data.some(
            (p) => p.id === privatePost.id,
          ),
        );
        assert.equal((await other("/posts/" + privatePost.id)).status, 200);
        assert.equal(
          (
            await other("/posts/" + post.id + "/lifecycle", {
              action: "remove",
              reason: "Cannot hide a public thread.",
            })
          ).status,
          403,
        );
        assert.equal(
          (
            await other("/posts/" + privatePost.id + "/lifecycle", {
              action: "unremove",
            })
          ).status,
          200,
        );
        const queue = await other("/moderation/reports");
        assert.equal(queue.status, 200);
        assert.ok(queue.data.items.every((r) => r.post_id === privatePost.id));
        const publicReport = (
          await legacy("/moderation/reports?filter=all")
        ).data.items.find((r) => r.post_id === post.id);
        if (publicReport)
          assert.equal(
            (
              await other(
                "/moderation/reports/" + publicReport.id,
                { status: "resolved", note: "Cannot moderate public content." },
                "PATCH",
              )
            ).status,
            403,
          );
        await other("/membership", { kind: "group", item: privateSpace });
        assert.equal((await other("/posts/" + privatePost.id)).status, 404);
        assert.ok(
          !(await other("/moderation/reports")).data.items.some(
            (r) => r.post_id === privatePost.id,
          ),
        );
        assert.ok(
          !(
            await author("/communities/" + privateSpace + "/validators")
          ).data.some((u) => u.id === otherId),
        );
        await author(
          "/communities/" + privateSpace + "/validators",
          { user_ids: [] },
          "PUT",
        );
        assert.equal(
          (await other("/communities/" + privateSpace + "/requests")).status,
          403,
        );
        assert.ok(
          !(await other("/moderation/reports")).data.items.some(
            (r) => r.post_id === privatePost.id,
          ),
        );
      },
    );
    await t.test(
      "saved account switching requires an authenticated device session",
      async () => {
        const browser = makeClient();
        await browser("/login", {
          email: "author@example.test",
          password: "A-long-test-password",
        });
        await browser("/login", {
          email: "reviewer@example.test",
          password: "Another-test-password",
        });
        const accounts = (await browser("/accounts")).data;
        assert.ok(accounts.some((a) => a.id === authorId));
        assert.ok(accounts.some((a) => a.id === otherId));
        assert.equal(
          (await anon("/accounts/switch", { user_id: authorId })).status,
          401,
        );
        assert.equal(
          (await browser("/accounts/switch", { user_id: authorId })).status,
          200,
        );
        assert.equal((await browser("/me")).data.user.id, authorId);
        await browser("/logout", {});
        assert.equal(
          (await browser("/accounts/switch", { user_id: authorId })).status,
          401,
        );
        assert.equal(
          (await browser("/accounts/switch", { user_id: otherId })).status,
          200,
        );
      },
    );
    await t.test(
      "unique handles, profile visibility and account deletion revoke access",
      async () => {
        assert.equal(
          (
            await author(
              "/account/preferences",
              { username: "curious_builder", privacy: "public" },
              "PATCH",
            )
          ).status,
          200,
        );
        assert.equal(
          (
            await other(
              "/account/preferences",
              { username: "CURIOUS_BUILDER", privacy: "public" },
              "PATCH",
            )
          ).status,
          409,
        );
        assert.equal(
          (await anon("/handles/curious_builder")).data.id,
          authorId,
        );
        assert.equal(
          (
            await author(
              "/account/preferences",
              { username: "changed_handle" },
              "PATCH",
            )
          ).status,
          409,
        );
        assert.equal(
          (
            await author(
              "/developer-profile",
              {
                username: "changed_handle",
                name: "Author Updated",
                bio: "",
                role: "",
                location: "",
              },
              "PATCH",
            )
          ).status,
          409,
        );
        assert.equal(
          (await author("/me")).data.user.username,
          "curious_builder",
        );
        const disposable = makeClient();
        const signup = await disposable("/register", {
          name: "Disposable",
          username: "private_builder",
          email: "remove@example.test",
          password: "Remove-password123",
        });
        const id = signup.data.user.id;
        await disposable(
          "/account/preferences",
          { username: "private_builder", privacy: "hidden" },
          "PATCH",
        );
        assert.equal((await anon("/users/" + id)).status, 404);
        assert.ok(
          !(await anon("/people?q=private_builder")).data.some(
            (p) => p.id === id,
          ),
        );
        assert.equal(
          (await disposable("/account", { confirm: "wrong" }, "DELETE")).status,
          400,
        );
        assert.equal(
          (
            await disposable(
              "/account",
              { confirm: "private_builder" },
              "DELETE",
            )
          ).status,
          200,
        );
        assert.equal((await disposable("/me")).data.user, null);
        assert.equal(
          (
            await disposable("/login", {
              email: "remove@example.test",
              password: "Remove-password123",
            })
          ).status,
          401,
        );
      },
    );
    await t.test(
      "subscriptions notify followers without leaking private community activity",
      async () => {
        const follower = makeClient(),
          publisher = makeClient();
        const registered = await follower("/register", {
          name: "Follower",
          username: "topic_follower",
          email: "follower@example.test",
          password: "Following-password123",
        });
        await publisher("/register", {
          name: "Publisher",
          username: "topic_publisher",
          email: "publisher@example.test",
          password: "Publishing-password123",
        });
        const followingId = registered.data.user.id;
        assert.equal((await anon("/subscriptions/topic/web")).status, 401);
        assert.equal(
          (
            await follower(
              "/subscriptions/topic/missing",
              { following: true },
              "PUT",
            )
          ).status,
          404,
        );
        assert.equal(
          (
            await follower(
              "/subscriptions/topic/web",
              { following: "true" },
              "PUT",
            )
          ).status,
          400,
        );
        assert.equal(
          (
            await follower(
              "/subscriptions/topic/web",
              { following: true },
              "PUT",
            )
          ).status,
          200,
        );
        await follower("/subscriptions/topic/web", { following: true }, "PUT");
        const publicPost = (
          await publisher("/posts", {
            title: "Topic subscription question",
            body: "Can we make subscription delivery safe and predictable?",
            kind: "question",
            topic: "web",
          })
        ).data;
        assert.ok(publicPost.id);
        assert.equal(
          (await follower("/notifications")).data.items.filter(
            (n) => n.post_id === publicPost.id && n.type === "topic_post",
          ).length,
          1,
        );
        await follower(
          "/subscriptions/post/" + publicPost.id,
          { following: true },
          "PUT",
        );
        const replyResult = await publisher(
          "/posts/" + publicPost.id + "/replies",
          { body: "A reply to the topic question from its author." },
        );
        assert.equal(replyResult.status, 201);
        assert.equal(
          (await follower("/notifications")).data.items.filter(
            (n) => n.reply_id === replyResult.data.id,
          ).length,
          1,
        );
        // Having replies alone must not remove an unresolved question from Needs help.
        assert.ok(
          (await anon("/posts?sort=help")).data.some(
            (p) => p.id === publicPost.id,
          ),
        );
        await publisher(
          "/posts/" + publicPost.id + "/solution",
          { reply_id: replyResult.data.id },
          "PATCH",
        );
        assert.ok(
          !(await anon("/posts?sort=help")).data.some(
            (p) => p.id === publicPost.id,
          ),
        );
        await publisher(
          "/posts/" + publicPost.id + "/solution",
          { reply_id: null },
          "PATCH",
        );
        assert.ok(
          (await anon("/posts?sort=help")).data.some(
            (p) => p.id === publicPost.id,
          ),
        );
        await publisher(
          "/subscriptions/post/" + publicPost.id,
          { following: true },
          "PUT",
        );
        const ownReply = await follower(
          "/posts/" + publicPost.id + "/replies",
          { body: "Following does not send a notification to myself." },
        );
        assert.ok(
          !(await follower("/notifications")).data.items.some(
            (n) => n.reply_id === ownReply.data.id,
          ),
        );
        assert.equal(
          (await publisher("/notifications")).data.items.filter(
            (n) => n.reply_id === ownReply.data.id,
          ).length,
          1,
        );
        const space = (
          await publisher("/communities", {
            name: "Subscription privacy test",
            description:
              "Private team discussions must stay inside this community.",
          })
        ).data;
        assert.ok(space.id);
        const privatePost = (
          await publisher("/posts", {
            title: "Private topic subscription discussion",
            body: "This private conversation must never enter topic alerts.",
            kind: "discussion",
            topic: "web",
            community_id: space.id,
          })
        ).data;
        assert.ok(privatePost.id);
        assert.ok(
          !(await follower("/notifications")).data.items.some(
            (n) => n.post_id === privatePost.id,
          ),
        );
        assert.equal(
          (
            await follower(
              "/subscriptions/post/" + privatePost.id,
              { following: true },
              "PUT",
            )
          ).status,
          404,
        );
        // Simulate a formerly approved member who followed before losing access.
        const fixture = new DatabaseSync(path);
        fixture
          .prepare(
            "INSERT INTO subscriptions(user_id,kind,item) VALUES(?,'post',?)",
          )
          .run(followingId, String(privatePost.id));
        fixture.close();
        await publisher("/posts/" + privatePost.id + "/replies", {
          body: "This reply is visible only to current approved members.",
        });
        assert.ok(
          !(await follower("/notifications")).data.items.some(
            (n) => n.post_id === privatePost.id,
          ),
        );
        assert.equal(
          (
            await follower(
              "/subscriptions/post/" + privatePost.id,
              { following: false },
              "PUT",
            )
          ).status,
          200,
        );
        await follower(
          "/account/preferences",
          { preferences: { notify_subscriptions: false } },
          "PATCH",
        );
        const before = (await follower("/notifications")).data.latest_id;
        await publisher("/posts/" + publicPost.id + "/replies", {
          body: "This followed discussion reply should be suppressed in settings.",
        });
        assert.equal((await follower("/notifications")).data.latest_id, before);
        await follower(
          "/account/preferences",
          { preferences: { notify_subscriptions: true } },
          "PATCH",
        );
        await follower(
          "/subscriptions/post/" + publicPost.id,
          { following: false },
          "PUT",
        );
        assert.equal(
          (await follower("/subscriptions/post/" + publicPost.id)).data
            .following,
          false,
        );
        await follower("/subscriptions/topic/web", { following: false }, "PUT");
        assert.equal(
          (await follower("/subscriptions/topic/web")).data.following,
          false,
        );
        const capped = new DatabaseSync(path);
        const seedFollow = capped.prepare(
          "INSERT INTO subscriptions(user_id,kind,item) VALUES(?,'topic',?)",
        );
        for (let i = 0; i < 500; i++)
          seedFollow.run(followingId, "previous-topic-" + i);
        capped.close();
        assert.equal(
          (
            await follower(
              "/subscriptions/topic/web",
              { following: true },
              "PUT",
            )
          ).status,
          429,
        );
        assert.equal(
          (
            await follower(
              "/subscriptions/topic/previous-topic-0",
              { following: false },
              "PUT",
            )
          ).status,
          200,
        );
        assert.equal(
          (
            await follower(
              "/subscriptions/topic/web",
              { following: true },
              "PUT",
            )
          ).status,
          200,
        );
        await follower("/subscriptions/topic/web", { following: false }, "PUT");
        const nextPost = await publisher("/posts", {
          title: "No more topic alerts",
          body: "Unfollowing stops new topic activity without deleting history.",
          kind: "discussion",
          topic: "web",
        });
        assert.ok(
          !(await follower("/notifications")).data.items.some(
            (n) => n.post_id === nextPost.data.id,
          ),
        );
      },
    );
    await t.test(
      "Following and subscription management retain access checks, filters and pagination",
      async () => {
        const fan = makeClient();
        const fanId = (
          await fan("/register", {
            name: "Following tester",
            username: "following_tester",
            email: "following-list@example.test",
            password: "Following-password123",
          })
        ).data.user.id;
        assert.equal((await anon("/subscriptions")).status, 401);
        assert.equal((await anon("/posts?following=1")).status, 401);
        const fixture = new DatabaseSync(path);
        const add = fixture.prepare(
          "INSERT INTO posts(user_id,title,body,kind,topic,community_id) VALUES(?,?,?,'discussion',?,?)",
        );
        const publicIds = [];
        for (let i = 0; i < 15; i++)
          publicIds.push(
            Number(
              add.run(
                authorId,
                "Following list marker " + i,
                "Readable conversation for following list tests.",
                "web",
                null,
              ).lastInsertRowid,
            ),
          );
        const secret = Number(
          add.run(
            authorId,
            "Invisible private title marker",
            "Private details never leave this community.",
            "web",
            privateSpace,
          ).lastInsertRowid,
        );
        fixture
          .prepare(
            "INSERT INTO subscriptions VALUES(?,'post',?,CURRENT_TIMESTAMP)",
          )
          .run(fanId, String(secret));
        fixture.close();
        await fan("/subscriptions/topic/web", { following: true }, "PUT");
        await fan(
          "/subscriptions/post/" + publicIds[0],
          { following: true },
          "PUT",
        );
        const feed = (
          await fan(
            "/posts?following=1&q=Following%20list%20marker&limit=5&page=2",
          )
        ).data;
        assert.equal(feed.pagination.total, 15); // topic + direct follow are one row, not duplicate cards.
        assert.equal(feed.length, 5);
        assert.equal(
          (await other("/posts?following=1&q=Following%20list%20marker")).data
            .length,
          0,
        );
        const topicFilter = (
          await fan("/posts?following=1&topic=ai&q=Following%20list%20marker")
        ).data;
        assert.equal(topicFilter.length, 0);
        const managed = (await fan("/subscriptions?kind=post")).data;
        assert.equal(managed.pagination.total, 2);
        assert.ok(
          !JSON.stringify(managed).includes("Invisible private title marker"),
        );
        assert.ok(
          managed.find((s) => s.item === String(secret)).available === 0,
        );
        assert.equal((await fan("/subscriptions?q=Invisible")).data.length, 0);
        const approval = new DatabaseSync(path);
        approval
          .prepare("INSERT INTO memberships VALUES(?,'group',?)")
          .run(fanId, privateSpace);
        assert.ok(
          (await fan("/posts?following=1&q=Invisible")).data.some(
            (p) => p.id === secret,
          ),
        );
        assert.ok(
          (await fan("/subscriptions?kind=post")).data.some(
            (s) => s.item === String(secret) && s.available,
          ),
        );
        approval
          .prepare(
            "DELETE FROM memberships WHERE user_id=? AND kind='group' AND item=?",
          )
          .run(fanId, privateSpace);
        approval.close();
        assert.equal(
          (await fan("/posts?following=1&q=Invisible")).data.length,
          0,
        );
        assert.ok(
          !(await other("/subscriptions")).data.some(
            (s) => s.item === String(secret),
          ),
        );

        assert.equal((await fan("/subscriptions?kind=topic")).data.length, 1);
        assert.equal(
          (
            await fan(
              "/subscriptions/post/" + secret,
              { following: false },
              "PUT",
            )
          ).status,
          200,
        );
        await fan("/subscriptions/topic/web", { following: false }, "PUT");
        const direct = (
          await fan("/posts?following=1&q=Following%20list%20marker")
        ).data;
        assert.deepEqual(
          direct.map((p) => p.id),
          [publicIds[0]],
        );
        await fan(
          "/subscriptions/post/" + publicIds[0],
          { following: false },
          "PUT",
        );
        assert.equal((await fan("/posts?following=1")).data.length, 0);
        // Inaccessible subscriptions remain removable across paginated management pages.
        const many = new DatabaseSync(path);
        for (let i = 0; i < 25; i++)
          many
            .prepare(
              "INSERT INTO subscriptions VALUES(?,'post',?,CURRENT_TIMESTAMP)",
            )
            .run(fanId, String(900000 + i));
        many.close();
        const page2 = (await fan("/subscriptions?page=2&limit=12")).data;
        assert.equal(page2.length, 12);
        assert.equal(page2.pagination.pages, 3);
      },
    );
    await t.test(
      "mentions notify once, skip inaccessible targets and respect preferences and edits",
      async () => {
        const writer = makeClient(),
          tagged = makeClient(),
          outsider = makeClient();
        const writerId = (
          await writer("/register", {
            name: "Mention writer",
            username: "mention_writer",
            email: "mention-writer@example.test",
            password: "Mention-password123",
          })
        ).data.user.id;
        const taggedId = (
          await tagged("/register", {
            name: "Mention target",
            username: "mention_target",
            email: "mention-target@example.test",
            password: "Mention-password123",
          })
        ).data.user.id;
        const outsiderId = (
          await outsider("/register", {
            name: "Mention outsider",
            username: "mention_outsider",
            email: "mention-outsider@example.test",
            password: "Mention-password123",
          })
        ).data.user.id;
        await tagged("/subscriptions/topic/ai", { following: true }, "PUT");
        const first = (
          await writer("/posts", {
            title: "Mentions and subscriptions together",
            body: "Hello @mention_target and @mention_target, can you review this?",
            kind: "discussion",
            topic: "ai",
          })
        ).data;
        assert.ok(first.id);
        let notices = (await tagged("/notifications")).data.items.filter(
          (n) => n.post_id === first.id,
        );
        assert.equal(notices.length, 1);
        assert.equal(notices[0].type, "mention");
        await tagged(
          "/subscriptions/post/" + first.id,
          { following: true },
          "PUT",
        );
        const reply = (
          await writer("/posts/" + first.id + "/replies", {
            body: "(@MENTION_TARGET), here is the follow-up. @mention_target",
          })
        ).data;
        notices = (await tagged("/notifications")).data.items.filter(
          (n) => n.reply_id === reply.id,
        );
        assert.equal(notices.length, 1);
        assert.equal(notices[0].type, "mention");
        await writer(
          "/replies/" + reply.id,
          {
            body: "Editing @mention_target a second time should not ping them again.",
            revision: 0,
          },
          "PATCH",
        );
        assert.equal(
          (await tagged("/notifications")).data.items.filter(
            (n) => n.reply_id === reply.id,
          ).length,
          1,
        );
        await writer(
          "/replies/" + reply.id,
          { body: "A new @mention_outsider joins this reply.", revision: 1 },
          "PATCH",
        );
        assert.equal(
          (await outsider("/notifications")).data.items.filter(
            (n) => n.reply_id === reply.id,
          ).length,
          1,
        );
        await writer(
          "/replies/" + reply.id,
          {
            body: "Removing mentions before adding @mention_target again.",
            revision: 2,
          },
          "PATCH",
        );
        assert.equal(
          (await tagged("/notifications")).data.items.filter(
            (n) => n.reply_id === reply.id,
          ).length,
          1,
        );
        const before = (await outsider("/notifications")).data.latest_id;
        await writer("/posts/" + first.id + "/replies", {
          body: "Code only: `@mention_outsider` and [@mention_outsider](https://example.test).",
        });
        assert.equal((await outsider("/notifications")).data.latest_id, before);
        await outsider(
          "/account/preferences",
          { preferences: { notify_mentions: false } },
          "PATCH",
        );
        await writer("/posts/" + first.id + "/replies", {
          body: "Notifications for @mention_outsider are disabled.",
        });
        assert.equal((await outsider("/notifications")).data.latest_id, before);
        await outsider(
          "/account/preferences",
          { preferences: { notify_mentions: true } },
          "PATCH",
        );
        const community = (
          await writer("/communities", {
            name: "Mention access test",
            description:
              "Only approved community members receive private mentions.",
          })
        ).data;
        const db = new DatabaseSync(path);
        db.prepare("INSERT INTO memberships VALUES(?,'group',?)").run(
          taggedId,
          community.id,
        );
        db.close();
        const privatePost = (
          await writer("/posts", {
            title: "A private mention conversation",
            body: "Hello @mention_target and @mention_outsider, this stays private.",
            kind: "discussion",
            topic: "ai",
            community_id: community.id,
          })
        ).data;
        assert.ok(
          (await tagged("/notifications")).data.items.some(
            (n) => n.post_id === privatePost.id && n.type === "mention",
          ),
        );
        assert.ok(
          !(await outsider("/notifications")).data.items.some(
            (n) => n.post_id === privatePost.id,
          ),
        );
        const remove = new DatabaseSync(path);
        remove
          .prepare(
            "DELETE FROM memberships WHERE user_id=? AND kind='group' AND item=?",
          )
          .run(taggedId, community.id);
        remove.close();
        assert.ok(
          !(await tagged("/notifications")).data.items.some(
            (n) => n.post_id === privatePost.id,
          ),
        );
        const editedPost = await writer(
          "/posts/" + first.id,
          {
            title: first.title,
            body: "A new post mention for @mention_outsider.",
            revision: 0,
          },
          "PATCH",
        );
        assert.equal(editedPost.status, 200);
        assert.equal(
          (await outsider("/notifications")).data.items.filter(
            (n) =>
              n.post_id === first.id &&
              n.reply_id === null &&
              n.type === "mention",
          ).length,
          1,
        );
        await writer(
          "/posts/" + first.id,
          {
            title: first.title,
            body: "Removing this mention temporarily.",
            revision: 1,
          },
          "PATCH",
        );
        await writer(
          "/posts/" + first.id,
          {
            title: first.title,
            body: "Re-adding @mention_outsider does not notify twice.",
            revision: 2,
          },
          "PATCH",
        );
        assert.equal(
          (await outsider("/notifications")).data.items.filter(
            (n) =>
              n.post_id === first.id &&
              n.reply_id === null &&
              n.type === "mention",
          ).length,
          1,
        );
        const me = (await writer("/notifications")).data;
        await writer("/posts/" + first.id + "/replies", {
          body: "A self mention @mention_writer should stay quiet.",
        });
        assert.equal(
          (await writer("/notifications")).data.latest_id,
          me.latest_id,
        );
        assert.equal(
          (await anon("/posts/" + first.id + "?reply_id=99999999")).data
            .reply_target_missing,
          true,
        );
        assert.equal(
          (await anon("/posts/" + first.id + "?reply_id=bad")).status,
          400,
        );
      },
    );
    await t.test(
      "notification preferences persist and suppress only selected future notifications",
      async () => {
        const sender = makeClient();
        await sender("/register", {
          name: "Notification sender",
          email: "notify-sender@example.test",
          password: "Notifications-password123",
        });
        const fixture = new DatabaseSync(path);
        const thread = Number(
          fixture
            .prepare(
              "INSERT INTO posts(user_id,title,body,kind,topic) VALUES(?,?,?,'discussion','web')",
            )
            .run(
              authorId,
              "Notification preference fixture",
              "A clean conversation for notification settings.",
            ).lastInsertRowid,
        );
        fixture.close();
        const before = (await author("/notifications")).data.latest_id || 0;
        let r = await author(
          "/account/preferences",
          {
            preferences: {
              notifications_enabled: false,
              compact_feed: true,
              reduce_motion: true,
            },
          },
          "PATCH",
        );
        assert.equal(r.status, 200);
        const me = (await author("/me")).data.user;
        assert.equal(me.preferences.notifications_enabled, false);
        assert.equal(me.preferences.compact_feed, true);
        assert.equal(
          (
            await author(
              "/account/preferences",
              { preferences: { notify_replies: "no" } },
              "PATCH",
            )
          ).status,
          400,
        );
        await sender("/posts/" + thread + "/replies", {
          body: "A reply while delivery is disabled.",
        });
        assert.equal(
          (await author("/notifications")).data.latest_id || 0,
          before,
        );
        await author(
          "/account/preferences",
          {
            preferences: { notifications_enabled: true, notify_replies: false },
          },
          "PATCH",
        );
        await sender("/posts/" + thread + "/replies", {
          body: "A reply with only reply notifications disabled.",
        });
        assert.equal(
          (await author("/notifications")).data.latest_id || 0,
          before,
        );
        await author(
          "/account/preferences",
          { preferences: { notify_replies: true } },
          "PATCH",
        );
        assert.equal(
          (
            await sender("/posts/" + thread + "/replies", {
              body: "A reply after re-enabling notification delivery.",
            })
          ).status,
          201,
        );
        assert.ok((await author("/notifications")).data.latest_id > before);
      },
    );
    await t.test(
      "reminders contain attended events only and platform moderators cannot handle community-only reports",
      async () => {
        const list = (await other("/events?attending=1&status=upcoming")).data;
        assert.ok(list.some((e) => e.id === event.id));
        assert.equal((await anon("/events?attending=1")).data.length, 0);
        assert.equal((await author("/events?attending=1")).data.length, 0); // organizing does not imply attending
        const publicQueue = await legacy("/moderation/reports?scope=public");
        assert.equal(publicQueue.status, 200);
        assert.ok(publicQueue.data.items.every((r) => !r.community_id));
        assert.equal(
          (await author("/moderation/reports?scope=public")).status,
          403,
        );
        // Joining a community does not assign its reports to a platform moderator.
        await legacy("/communities/" + privateSpace + "/request", {});
        const pending = (
          await author("/communities/" + privateSpace + "/requests")
        ).data.find((r) => r.user_id === 1);
        await author(
          "/communities/" + privateSpace + "/requests/" + pending.id,
          { action: "approve" },
          "PATCH",
        );
        const privateReport = (
          await author("/moderation/reports?scope=communities")
        ).data.items.find((r) => r.post_id === privatePost.id);
        assert.ok(privateReport);
        assert.ok(
          !(await legacy("/moderation/reports")).data.items.some(
            (r) => r.id === privateReport.id,
          ),
        );
        assert.equal(
          (
            await legacy(
              "/moderation/reports/" + privateReport.id,
              {
                status: "resolved",
                note: "Not assigned to the platform team.",
              },
              "PATCH",
            )
          ).status,
          403,
        );
        const result = await author(
          "/moderation/reports/" + privateReport.id,
          {
            status: "resolved",
            note: "Removed spam from our community.",
            remove: true,
          },
          "PATCH",
        );
        assert.equal(result.status, 200);
        assert.equal(result.data.action, "hidden");
        assert.ok((await author("/posts/" + privatePost.id)).data.removed_at);
      },
    );
    await t.test(
      "initial OAuth username can be chosen exactly once",
      async () => {
        const initial = makeClient();
        const signup = await initial("/register", {
          name: "New OAuth identity",
          email: "initial@example.test",
          password: "Initial-password123",
        });
        const id = signup.data.user.id;
        const db = new DatabaseSync(path);
        db.prepare("UPDATE users SET username_locked=0 WHERE id=?").run(id);
        db.close();
        assert.equal(
          (
            await initial("/posts", {
              title: "Before onboarding",
              body: "Cannot publish before a permanent username is chosen.",
              kind: "discussion",
              topic: "web",
            })
          ).status,
          409,
        );
        assert.equal(
          (
            await initial("/account/username", {
              username: "permanent_identity",
            })
          ).status,
          200,
        );
        assert.equal(
          (await initial("/account/username", { username: "new_identity" }))
            .status,
          409,
        );
        assert.equal(
          (await initial("/me")).data.user.username,
          "permanent_identity",
        );
      },
    );
    await t.test(
      "logout and repeat login retain profile and activity",
      async () => {
        await author("/logout", {}, "POST");
        assert.equal((await author("/me")).data.user, null);
        assert.equal(
          (
            await author("/login", {
              email: "author@example.test",
              password: "incorrect",
            })
          ).status,
          401,
        );
        const r = await author("/login", {
          email: "author@example.test",
          password: "A-long-test-password",
        });
        assert.equal(r.status, 200);
        assert.equal(r.data.user.name, "Author Updated");
        assert.ok(
          r.data.user.memberships.some(
            (m) => m.kind === "group" && m.item === privateSpace,
          ),
        );
      },
    );
  } finally {
    server.kill("SIGTERM");
    await new Promise((r) => server.once("exit", r));
    rmSync(directory, { recursive: true, force: true });
    await objectStore?.close();
  }
});
