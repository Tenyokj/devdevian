import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm, access } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import stringWidth from "string-width";
import { editorArgs, editExternal } from "../lib/external-editor.mjs";
import { markdownRows } from "../lib/rich-text.mjs";
import { notificationRoute, loadPage } from "../lib/tui-data.mjs";
import { problemMessage } from "../lib/problems.mjs";
import { client } from "../lib/client.mjs";
import { createServer } from "node:http";

test("external editor uses argv, private bounded UTF-8 output, cleanup and no shell", async () => {
  assert.deepEqual(
    editorArgs("\"/a path/editor\" --wait 'two words' $(literal)"),
    ["/a path/editor", "--wait", "two words", "$(literal)"],
  );
  assert.throws(() => editorArgs('"unfinished'), /quote/);
  const directory = await mkdtemp(join(tmpdir(), "devdevian-edit-test-"));
  const file = join(directory, "fake editor.mjs"),
    marker = join(directory, "marker.json");
  const command = `"${process.execPath}" "${file}"`;
  try {
    await writeFile(
      file,
      `import{writeFile,stat}from'node:fs/promises';const p=process.argv.at(-1);await writeFile(${JSON.stringify(marker)},JSON.stringify({path:p,mode:(await stat(p)).mode&511}));await writeFile(p,'A real edited answer.');`,
    );
    assert.equal(
      await editExternal("Original", { command, max: 30 }),
      "A real edited answer.",
    );
    const result = JSON.parse(await readFile(marker, "utf8"));
    if (process.platform !== "win32") assert.equal(result.mode, 0o600);
    await assert.rejects(access(result.path));
    await assert.rejects(
      editExternal("Original", { command, max: 5 }),
      /Original text kept/,
    );
    await writeFile(file, "process.exit(1)");
    await assert.rejects(
      editExternal("Original", { command }),
      /Original text is unchanged|original text is unchanged/,
    );
    await assert.rejects(
      editExternal("Original", { command: "devdevian-missing-editor-test" }),
      /original text is unchanged/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("Markdown is bounded, visible links cannot hide a destination and control codes are stripped", () => {
  const rows = markdownRows(
    '# Heading\n**Important** `inline`\n- list\n> quote\n[Docs](https://example.com/docs)\n```js\nconst value = "safe"; // note\n```\n\x1b[2Jvisible\x1b]8;;https://evil.test\x07label\x1b]8;;\x07',
    44,
  );
  assert.ok(rows.find((row) => row.text === "Heading" && row.bold));
  assert.ok(
    rows.some((row) => row.text.includes("Docs <https://example.com/docs>")),
  );
  assert.ok(rows.some((row) => row.text.includes("• list")));
  assert.ok(
    rows.some((row) =>
      row.spans?.some((span) => span.text === "const" && span.color),
    ),
  );
  assert.ok(
    rows.every(
      (row) => !row.text.includes("\x1b") && stringWidth(row.text) <= 44,
    ),
  );
  assert.ok(!rows.some((row) => row.text.includes("evil.test")));
  const long = markdownRows("```\n" + "界".repeat(70) + "\n```", 20);
  assert.ok(long.every((row) => stringWidth(row.text) <= 20));
});

test("notification targets locate later-page root and nested replies; unavailable targets never open another reply", async () => {
  let path = [{ id: 10, parent_id: null, page: 4 }];
  const calls = [];
  const api = async (url) => {
    calls.push(url);
    return { reply_path: path };
  };
  const root = await notificationRoute(api, { post_id: 42, reply_id: 10 });
  assert.deepEqual(root, {
    view: "post",
    id: 42,
    tab: "replies",
    page: 4,
    targetReply: 10,
  });
  path = [
    { id: 10, parent_id: null, page: 4 },
    { id: 99, parent_id: 10, page: 3 },
  ];
  const nested = await notificationRoute(api, { post_id: 42, reply_id: 99 });
  assert.equal(nested.view, "thread");
  assert.equal(nested.parent.id, 10);
  assert.equal(nested.page, 3);
  assert.ok(calls.includes("/posts/42?reply_id=99"));
  path = [];
  await assert.rejects(notificationRoute(api, { post_id: 42, reply_id: 99 }), {
    status: 404,
  });
  assert.equal(
    (
      await notificationRoute(api, {
        post_id: 42,
        code_review_id: 3,
        feedback_reply_id: 3,
      })
    ).targetReply,
    3,
  );
  let query;
  await loadPage(async (url) => {
    query = url;
    return { replies: [], reply_pagination: {} };
  }, root);
  assert.equal(query, "/posts/42?reply_id=10");
});

test("non-JSON gateway failures preserve HTTP status for actionable errors", async () => {
  const server = createServer((req, res) => {
    res.writeHead(503);
    res.end("A server error occurred");
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  try {
    await assert.rejects(
      client("http://127.0.0.1:" + server.address().port)("/me"),
      (e) =>
        e.status === 503 &&
        problemMessage(e).includes("Server temporarily unavailable"),
    );
    assert.match(
      problemMessage(Object.assign(Error("gone"), { status: 404 })),
      /Esc goes back/,
    );
    assert.match(
      problemMessage(Object.assign(Error("rate"), { status: 429 })),
      /not retried automatically/,
    );
    assert.match(
      problemMessage(Object.assign(Error("expired"), { status: 401 })),
      /draft is kept/,
    );
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
});
