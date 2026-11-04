import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { startTestServer } from "./http-fixture.mjs";
test("script Rooms share tasks and decision history with real browser accounts", async () => {
  const f = await startTestServer();
  try {
    const clients = [];
    for (const name of ["room_cli_owner", "room_cli_peer"]) {
      const api = f.client();
      assert.equal(
        (
          await api("/register", {
            name,
            username: name,
            email: name + "@fixture.test",
            password: "Fixture-password123",
          })
        ).status,
        200,
      );
      const anon = f.client(),
        device = (await anon("/cli/device", { name: "Room test terminal" }))
          .data;
      await api("/cli/authorize", {
        user_code: device.user_code,
        approved: true,
      });
      const token = (
        await anon("/cli/token", { device_code: device.device_code })
      ).data.access_token;
      const dir = join(f.directory, name);
      await mkdir(dir);
      await writeFile(
        join(dir, "credentials.json"),
        JSON.stringify({ origin: f.base, token }),
        { mode: 0o600 },
      );
      const cli = async (...args) =>
        JSON.parse(
          (
            await promisify(execFile)(
              process.execPath,
              [
                process.env.CLI_TEST_BIN ||
                  join(process.cwd(), "packages/cli/bin/devdevian.mjs"),
                ...args,
                "--json",
              ],
              {
                cwd: f.directory,
                env: { ...process.env, DEVDEVIAN_CONFIG_DIR: dir },
              },
            )
          ).stdout,
        );
      clients.push({ api, cli });
    }
    const [owner, peer] = clients;
    const project = (
      await owner.api("/projects", {
        name: "CLI Orbit room",
        description: "A real script and browser room fixture.",
        topic: "web",
        stage: "Prototype",
        help: "Ship a bounded queue.",
      })
    ).data.id;
    const post = (
      await owner.api("/posts", {
        title: "Review the task boundary",
        kind: "question",
        topic: "web",
        body: "Keep this conversation attached to the task.",
      })
    ).data.id;
    await owner.api(
      `/projects/${project}/work-requests/${post}`,
      { state: "open", expected_version: 0 },
      "PUT",
    );
    const room = await peer.cli("room", String(project));
    assert.equal(room.items[0].id, post);
    await peer.cli("room", "claim", String(project), String(post), "--yes");
    await peer.cli(
      "room",
      "state",
      String(project),
      String(post),
      "--state",
      "ready",
      "--yes",
    );
    assert.equal(
      (await owner.api(`/projects/${project}/room/tasks/${post}`)).data.task
        .state,
      "ready",
    );
    await assert.rejects(
      peer.cli(
        "room",
        "decision",
        "pin",
        String(project),
        "--title",
        "No authority",
        "--body",
        "Only the owner pins decisions.",
        "--yes",
      ),
    );
    const pin = await owner.cli(
      "room",
      "decision",
      "pin",
      String(project),
      "--title",
      "Bound retries",
      "--body",
      "Permanent errors stop retries.",
      "--related-post",
      String(post),
      "--yes",
    );
    await owner.cli(
      "room",
      "decision",
      "edit",
      String(project),
      String(pin.id),
      "--title",
      "Bound every retry",
      "--body",
      "Permanent errors and cancellation stop retries.",
      "--yes",
    );
    const history = await peer.cli(
      "room",
      "decision",
      "history",
      String(project),
      String(pin.id),
    );
    assert.equal(history.items.length, 2);
    const result = await peer.cli(
      "contributions",
      "submit",
      String(project),
      String(post),
      "--body",
      "Implemented and tested the bounded queue.",
      "--yes",
    );
    assert.ok(result.id);
    await owner.cli(
      "contributions",
      "changes",
      String(project),
      String(result.id),
      "--body",
      "Add cancellation coverage.",
      "--yes",
    );
    await peer.cli(
      "contributions",
      "submit",
      String(project),
      String(post),
      "--body",
      "Added and verified cancellation coverage.",
      "--yes",
    );
    await owner.cli(
      "contributions",
      "accept",
      String(project),
      String(result.id),
      "--body",
      "Verified both tests. Accepted.",
      "--yes",
    );
    const results = await peer.cli("contributions", String(project));
    assert.equal(results.items[0].state, "accepted");
    const resultHistory = await peer.cli(
      "contributions",
      "history",
      String(project),
      String(result.id),
    );
    assert.equal(resultHistory.items.length, 2);
    const activity = await peer.cli("room", "activity", String(project));
    assert.ok(activity.items.some((e) => e.type === "decision_updated"));
  } finally {
    await f.close();
  }
});
