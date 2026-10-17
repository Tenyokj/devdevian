import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";

test("developer interface smoke test in a simulated DOM", async () => {
  const dom = new JSDOM(
    '<!doctype html><html><body><div id="root"></div></body></html>',
    { url: "http://localhost/#feed" },
  );
  const originals = new Map();
  for (const [key, value] of Object.entries({
    window: dom.window,
    document: dom.window.document,
    location: dom.window.location,
    navigator: dom.window.navigator,
    FormData: dom.window.FormData,
    HTMLElement: dom.window.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, {
      value,
      configurable: true,
      writable: true,
    });
  }
  dom.window.localStorage.setItem("devdevian-theme", "dark");
  dom.window.scrollTo = () => {};
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  let currentUser = null;
  const requests = [];
  const originalFetch = globalThis.fetch;
  const communities = [
    {
      id: "space-web",
      name: "Web development team",
      is_member: true,
      is_owner: true,
      owner_id: 3,
      owner_name: "UI Builder",
      short: "Web",
      description: "Build for the web.",
      color: "violet",
      symbol: "</>",
      topics: "React · TypeScript",
      posts: 0,
      members: 0,
    },
  ];
  let eventFixtures = [];
  const testEvent = {
    id: 31,
    user_id: 3,
    organizer_name: "UI Builder",
    title: "A live review session",
    description: "A friendly session to review retry strategies together.",
    topic: "web",
    start_at: "2030-01-15T16:00:00.000Z",
    end_at: "2030-01-15T17:00:00.000Z",
    timezone: "Europe/Kyiv",
    url: "https://example.test/meeting",
    revision: 0,
    attendee_count: 0,
  };
  const conversation = {
    id: 17,
    user_id: 3,
    name: "UI Builder",
    role: "Developer",
    title: "How should this retry worker behave?",
    body: "A detailed question about bounded retries and worker timeouts.",
    kind: "question",
    topic: "web",
    stack: "TypeScript",
    status: "open",
    created: "2026-10-16 12:00:00",
    revision: 0,
    reply_count: 0,
    vote_count: 0,
    replies: [],
    project: null,
    updates: [],
  };
  globalThis.fetch = async (path, options = {}) => {
    requests.push([path, options]);
    path = path.split("?")[0];
    let data;
    if (path === "/api/posts/17/lifecycle") {
      const { action } = JSON.parse(options.body);
      conversation.archived_at =
        action === "archive" ? "2026-10-16 15:00:00" : null;
      data = { ok: true };
    } else if (path === "/api/events/31" && options.method === "PATCH") {
      const patch = JSON.parse(options.body);
      Object.assign(testEvent, {
        title: patch.title,
        description: patch.description,
        revision: testEvent.revision + 1,
      });
      data = { id: 31 };
    } else if (path === "/api/events/31/lifecycle") {
      const { action } = JSON.parse(options.body);
      testEvent.cancelled_at =
        action === "cancel" ? "2026-10-16 16:00:00" : null;
      testEvent.revision++;
      data = { ok: true };
    } else if (path === "/api/events") data = eventFixtures;
    else if (path.split("?")[0] === "/api/moderation/reports")
      data = { items: [], log: [] };
    else if (path === "/api/posts/17") {
      if (options.method === "PATCH") {
        const patch = JSON.parse(options.body);
        Object.assign(conversation, patch, {
          revision: conversation.revision + 1,
          updated_at: "2026-10-16 13:00:00",
        });
        data = { id: 17 };
      } else data = conversation;
    } else if (path === "/api/projects/23/updates") {
      const update = JSON.parse(options.body);
      conversation.updates.unshift({
        id: 32,
        ...update,
        created: "2026-10-16 14:00:00",
      });
      data = { id: 32, post_id: 17 };
    } else if (path === "/api/register") {
      const fields = JSON.parse(options.body);
      currentUser = {
        id: 3,
        name: fields.name,
        email: fields.email,
        role: "Developer",
        bio: "",
        stack: "",
        location: "",
        github: "",
        website: "",
        memberships: [],
      };
      data = { user: currentUser };
    } else if (path === "/api/topics")
      data = [{ id: "web", name: "Web development" }];
    else if (path === "/api/posts/17/replies") data = [];
    else if (path === "/api/me") data = { user: currentUser };
    else if (path === "/api/notifications")
      data = { items: [], unread_count: 0 };
    else if (path === "/api/communities") data = communities;
    else if (
      [
        "/api/posts",
        "/api/events",
        "/api/projects",
        "/api/participated",
      ].includes(path)
    )
      data = [];
    else throw new Error("Unexpected request " + path);
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  const vite = await createServer({
    server: { middlewareMode: true, hmr: false, ws: false },
    optimizeDeps: { noDiscovery: true, include: [] },
    appType: "custom",
  });
  let root;
  try {
    await vite.ssrLoadModule("/src/markdown.jsx");
    const { App } = await vite.ssrLoadModule("/src/main.jsx");
    const { createRoot } = await import("react-dom/client");
    root = createRoot(document.getElementById("root"));
    await act(async () => root.render(React.createElement(App)));
    assert.equal(document.documentElement.dataset.theme, "dark");
    assert.equal(
      document.querySelector(".theme-toggle").getAttribute("aria-label"),
      "Switch to light theme",
    );
    await act(async () => document.querySelector(".theme-toggle").click());
    assert.equal(document.documentElement.dataset.theme, "light");
    assert.equal(dom.window.localStorage.getItem("devdevian-theme"), "light");
    assert.equal(
      document.querySelector(".theme-toggle").getAttribute("aria-pressed"),
      "false",
    );
    await act(async () => document.querySelector(".theme-toggle").click());
    await act(async () => root.unmount());
    root = createRoot(document.getElementById("root"));
    await act(async () => root.render(React.createElement(App)));
    assert.equal(document.documentElement.dataset.theme, "dark");
    assert.equal(
      document.querySelector(".theme-toggle").getAttribute("aria-pressed"),
      "true",
    );
    assert.match(document.body.textContent, /A little curiosity/);
    assert.equal(document.querySelectorAll(".post-card").length, 4);
    assert.match(
      document.querySelector(".example-notice").textContent,
      /example conversations/,
    );
    await act(async () =>
      document.querySelector(".intro-actions .primary").click(),
    );
    const modal = document.querySelector('[role="dialog"]');
    assert.ok(modal);
    assert.match(modal.textContent, /Create account/);
    assert.ok(modal.querySelector('input[name="email"]'));
    modal.querySelector('input[name="name"]').value = "UI Builder";
    modal.querySelector('input[name="email"]').value = "ui@example.test";
    modal.querySelector('input[name="password"]').value = "Long-test-password";
    await act(async () =>
      modal
        .querySelector("form")
        .dispatchEvent(
          new dom.window.Event("submit", { bubbles: true, cancelable: true }),
        ),
    );
    assert.equal(document.querySelector('[role="dialog"]'), null);
    assert.ok(requests.some(([path]) => path === "/api/register"));
    assert.match(
      document.querySelector(".account-button").textContent,
      /UI Builder/,
    );
    assert.ok(document.querySelector(".notification-toggle"));
    await act(async () =>
      document.querySelector(".notification-toggle").click(),
    );
    assert.match(
      document.querySelector('[role="dialog"]').textContent,
      /A quiet moment/,
    );
    await act(async () =>
      document.querySelector('[aria-label="Close dialog"]').click(),
    );
    assert.equal(document.querySelector('[role="dialog"]'), null);
    assert.equal(document.documentElement.dataset.theme, "dark");

    await act(async () => {
      dom.window.location.hash = "profile";
      dom.window.dispatchEvent(new dom.window.HashChangeEvent("hashchange"));
    });
    assert.match(
      document.querySelector(".profile-main").textContent,
      /UI Builder/,
    );
    assert.ok(
      [...document.querySelectorAll(".profile-tabs button")].some(
        (b) => b.textContent === "Participated",
      ),
    );
    await act(async () => {
      dom.window.location.hash = "communities";
      dom.window.dispatchEvent(new dom.window.HashChangeEvent("hashchange"));
    });
    assert.match(
      document.querySelector(".community-card").textContent,
      /Web development/,
    );
    assert.equal(document.querySelectorAll(".community-card").length, 1);
    await act(async () => {
      dom.window.location.hash = "post/17";
      dom.window.dispatchEvent(new dom.window.HashChangeEvent("hashchange"));
    });
    const editButton = [
      ...document.querySelectorAll(".detail-actions button"),
    ].find((b) => b.textContent.includes("Edit post"));
    assert.ok(editButton);
    await act(async () => editButton.click());
    let dialog = document.querySelector('[role="dialog"]');
    assert.match(dialog.textContent, /Edit your conversation/i);
    dialog.querySelector('input[name="title"]').value =
      "An improved question about retries";
    await act(async () =>
      dialog
        .querySelector("form")
        .dispatchEvent(
          new dom.window.Event("submit", { bubbles: true, cancelable: true }),
        ),
    );
    assert.equal(document.querySelector('[role="dialog"]'), null);
    assert.equal(
      document.querySelector(".post-detail h1").textContent,
      "An improved question about retries",
    );
    const editRequest = requests.find(
      ([path, opt]) => path === "/api/posts/17" && opt.method === "PATCH",
    );
    assert.equal(JSON.parse(editRequest[1].body).revision, 0);
    conversation.project = { id: 23, user_id: 3, name: "Retry Lab" };
    conversation.kind = "showcase";
    await act(async () => {
      dom.window.location.hash = "post/17/project";
      dom.window.dispatchEvent(new dom.window.HashChangeEvent("hashchange"));
    });
    assert.ok(document.querySelector(".project-timeline"));
    assert.ok(
      ![...document.querySelectorAll(".detail-actions button")].some((b) =>
        b.textContent.includes("Edit post"),
      ),
    );
    await act(async () =>
      document.querySelector(".project-timeline-heading button").click(),
    );
    dialog = document.querySelector('[role="dialog"]');
    dialog.querySelector('input[name="title"]').value =
      "We made retries easier to understand";
    dialog.querySelector('textarea[name="body"]').value =
      "We incorporated the feedback and added an overall deadline.";
    await act(async () =>
      dialog
        .querySelector("form")
        .dispatchEvent(
          new dom.window.Event("submit", { bubbles: true, cancelable: true }),
        ),
    );
    assert.equal(document.querySelector('[role="dialog"]'), null);
    assert.match(
      document.querySelector(".project-update-heading").textContent,
      /We made retries easier/,
    );
    assert.equal(document.documentElement.dataset.theme, "dark");
    await act(async () =>
      [...document.querySelectorAll(".lifecycle-actions button")]
        .find((b) => b.textContent.includes("Archive"))
        .click(),
    );
    dialog = document.querySelector('[role="dialog"]');
    await act(async () =>
      dialog
        .querySelector("form")
        .dispatchEvent(
          new dom.window.Event("submit", { bubbles: true, cancelable: true }),
        ),
    );
    await act(async () => document.querySelector(".reply-dock button").click());
    assert.ok(document.querySelector(".closed-replies"));
    await act(async () =>
      document.querySelector('[aria-label="Close dialog"]').click(),
    );
    assert.equal(document.querySelector("#reply-body"), null);
    await act(async () =>
      [...document.querySelectorAll(".lifecycle-actions button")]
        .find((b) => b.textContent.includes("Restore"))
        .click(),
    );
    dialog = document.querySelector('[role="dialog"]');
    await act(async () =>
      dialog
        .querySelector("form")
        .dispatchEvent(
          new dom.window.Event("submit", { bubbles: true, cancelable: true }),
        ),
    );
    await act(async () => document.querySelector(".reply-dock button").click());
    assert.ok(document.querySelector("#reply-body"));
    await act(async () =>
      document.querySelector('[aria-label="Close dialog"]').click(),
    );
    eventFixtures = [testEvent];
    assert.equal(document.querySelector(".refresh-button"), null);
    await act(async () => {
      dom.window.location.hash = "events";
      dom.window.dispatchEvent(new dom.window.HashChangeEvent("hashchange"));
    });
    await act(async () =>
      [...document.querySelectorAll(".event-management button")]
        .find((b) => b.textContent === "Edit")
        .click(),
    );
    dialog = document.querySelector('[role="dialog"]');
    assert.equal(
      dialog.querySelector('[name="local_start"]').value,
      "2030-01-15T18:00",
    );
    assert.equal(
      dialog.querySelector('[name="timezone"]').value,
      "Europe/Kyiv",
    );
    dialog.querySelector('[name="title"]').value = "Updated review session";
    await act(async () =>
      dialog
        .querySelector("form")
        .dispatchEvent(
          new dom.window.Event("submit", { bubbles: true, cancelable: true }),
        ),
    );
    assert.match(
      document.querySelector(".event-art h2").textContent,
      /Updated review session/,
    );
    await act(async () =>
      [...document.querySelectorAll(".event-management button")]
        .find((b) => b.textContent.includes("Cancel event"))
        .click(),
    );
    dialog = document.querySelector('[role="dialog"]');
    await act(async () => dialog.querySelector(".button.primary").click());
    assert.match(
      document.querySelector(".past-label").textContent,
      /cancelled/,
    );
    assert.equal(document.querySelector(".meeting-link"), null);
    assert.match(
      document.querySelector(".event-management a").getAttribute("href"),
      /calendar$/,
    );
    await act(async () => {
      dom.window.location.hash = "moderation";
      dom.window.dispatchEvent(new dom.window.HashChangeEvent("hashchange"));
    });
    assert.match(
      document.querySelector(".empty-state").textContent,
      /for moderators/,
    );
    assert.ok(
      !requests.some(
        ([path]) => path.split("?")[0] === "/api/moderation/reports",
      ),
    );
    currentUser.platform_role = "moderator";
    await act(async () => {
      dom.window.location.hash = "feed";
      dom.window.dispatchEvent(new dom.window.HashChangeEvent("hashchange"));
    });
    await act(async () => {
      dom.window.location.hash = "moderation";
      dom.window.dispatchEvent(new dom.window.HashChangeEvent("hashchange"));
    });
    assert.equal(document.querySelector(".refresh-button"), null);
    await act(async () => {
      await new Promise(setImmediate);
    });
    assert.match(
      document.querySelector("main").textContent,
      /No reports waiting/,
    );
    assert.ok(document.querySelector('a[href="#moderation/public"]'));
    const { Composer } = await vite.ssrLoadModule("/src/forms.jsx");
    const noop = () => {};
    await act(async () =>
      root.render(
        React.createElement(Composer, {
          communities: [
            { id: "space-web", name: "Private team", is_member: true },
          ],
          topics: [{ id: "web", name: "Web development" }],
          defaultKind: "review",
          close: noop,
          done: noop,
        }),
      ),
    );
    assert.ok(document.querySelector('[name="code"]'));
    assert.ok(document.querySelector('[name="review_focus"]').required);
    assert.equal(
      document.querySelector('[aria-label="Publication audience"]').value,
      "",
    );
    assert.match(
      document.querySelector(".type-explanation").textContent,
      /repository/,
    );
    await act(async () =>
      [...document.querySelectorAll(".type-picker button")]
        .find((b) => b.textContent.includes("Discussion"))
        .click(),
    );
    assert.equal(document.querySelector('[name="review_focus"]'), null);
    assert.match(
      document.querySelector(".type-explanation").textContent,
      /no single accepted answer/,
    );
    await act(async () =>
      [...document.querySelectorAll(".type-picker button")]
        .find((b) => b.textContent.includes("Show & tell"))
        .click(),
    );
    assert.ok(document.querySelector('[name="detail_links"]'));
    assert.ok(document.querySelector('input[type="file"]'));
    const select = document.querySelector(
      '[aria-label="Publication audience"]',
    );
    await act(async () => select.click());
    await act(async () =>
      [...document.querySelectorAll('[role="option"]')]
        .find((b) => b.textContent.includes("Private team"))
        .click(),
    );
    assert.match(
      document.querySelector('[role="dialog"]').textContent,
      /Only approved members can read/,
    );
    const { Attachments, Pagination } =
      await vite.ssrLoadModule("/src/content.jsx");
    await act(async () =>
      root.render(
        React.createElement(Attachments, {
          compact: true,
          files: [
            {
              id: "img",
              url: "/api/uploads/img",
              name: "preview.png",
              mime: "image/png",
              size: 500,
            },
            {
              id: "doc",
              url: "/api/uploads/doc",
              name: "notes.txt",
              mime: "text/plain",
              size: 500,
            },
          ],
        }),
      ),
    );
    assert.equal(
      document.querySelector(".attached-images img").getAttribute("src"),
      "/api/uploads/img",
    );
    assert.ok(
      document.querySelector(".attached-documents a").hasAttribute("download"),
    );
    let next;
    await act(async () =>
      root.render(
        React.createElement(Pagination, {
          meta: { page: 2, pages: 4, total: 40, limit: 10 },
          label: "replies",
          onPage: (p) => (next = p),
        }),
      ),
    );
    await act(async () =>
      document.querySelector('[aria-label="Next replies page"]').click(),
    );
    assert.equal(next, 3);
    assert.equal(
      document.querySelector('[aria-current="page"]').textContent,
      "2",
    );
  } finally {
    if (root) await act(async () => root.unmount());
    await vite.close();
    globalThis.fetch = originalFetch;
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
    dom.window.close();
  }
});

test("Markdown safely renders code and links without executing HTML", async () => {
  const vite = await createServer({
    server: { middlewareMode: true, hmr: false, ws: false },
    optimizeDeps: { noDiscovery: true, include: [] },
    appType: "custom",
  });
  try {
    const { default: MarkdownContent } =
      await vite.ssrLoadModule("/src/markdown.jsx");
    const output = renderToStaticMarkup(
      React.createElement(MarkdownContent, {
        children:
          "## A helpful answer\n\n```ts\nconst retry: number = 3;\n```\n\n[Docs](https://example.test)\n\n<script>alert(1)</script>\n\n[bad](javascript:alert(1))",
      }),
    );
    assert.match(output, /<h2>A helpful answer/);
    assert.match(output, /hljs/);
    assert.match(output, /rel="noopener noreferrer"/);
    assert.ok(!output.includes("<script>"));
    assert.ok(!output.includes('href="javascript:'));
  } finally {
    await vite.close();
  }
});

test("theme surfaces never keep a fixed white background", async () => {
  const { readFileSync } = await import("node:fs");
  const css = readFileSync(
    new URL("../src/style.css", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(
    css,
    /background(?:-color)?\s*:\s*(?:white|#fff(?:fff)?)(?=[;}])/i,
  );
  assert.match(css, /\.post-detail\{[^}]*background:var\(--surface\)/);
  assert.match(css, /:root\[data-theme="dark"\]/);
});
