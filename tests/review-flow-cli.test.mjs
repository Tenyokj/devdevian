import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { startTestServer } from "./http-fixture.mjs";
test("script CLI named requests, queue, acceptance and outcomes share real browser accounts and exact snapshots", async () => {
  const f = await startTestServer();
  try {
    const clients = [];
    for (const name of ["flow_cli_author", "flow_cli_reviewer"]) {
      const browser = f.client();
      assert.equal(
        (
          await browser("/register", {
            name,
            username: name,
            email: name + "@fixture.test",
            password: "Fixture-password123",
          })
        ).status,
        200,
      );
      const anon = f.client(),
        device = (await anon("/cli/device", { name: "Flow fixture terminal" }))
          .data;
      await browser("/cli/authorize", {
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
                join(process.cwd(), "packages/cli/bin/devdevian.mjs"),
                ...args,
                "--json",
              ],
              {
                env: { ...process.env, DEVDEVIAN_CONFIG_DIR: dir },
                cwd: f.directory,
              },
            )
          ).stdout,
        );
      clients.push({ browser, cli });
    }
    const [author, reviewer] = clients;
    const post = (
      await author.browser("/posts", {
        kind: "review",
        topic: "web",
        title: "Review a CLI retry boundary",
        body: "Please inspect this retry and its failure path.",
        code: "export const retry = () => true;",
        review_focus: "Check the failure path and retry limits.",
      })
    ).data;
    const invited = await author.cli(
      "review",
      "invite",
      String(post.id),
      "--username",
      "flow_cli_reviewer",
      "--body",
      "Please review this version.",
      "--yes",
    );
    assert.equal((await reviewer.cli("assigned")).items[0].id, invited.id);
    await assert.rejects(
      author.cli(
        "review",
        "accept",
        String(post.id),
        String(invited.id),
        "--yes",
      ),
    );
    const accepted = await reviewer.cli(
      "review",
      "accept",
      String(post.id),
      String(invited.id),
      "--yes",
    );
    assert.equal(accepted.state, "accepted");
    const outcome = await reviewer.cli(
      "review",
      "outcome",
      String(post.id),
      String(invited.id),
      "--verdict",
      "no_objections",
      "--body",
      "No objections to this exact published revision.",
      "--yes",
    );
    assert.equal(outcome.state, "completed");
    assert.equal(outcome.snapshot_id, invited.snapshot_id);
    assert.equal(
      (await author.cli("review", "requests", String(post.id))).items[0]
        .verdict,
      "no_objections",
    );
    assert.equal(
      (await reviewer.cli("assigned", "--section", "completed")).items.length,
      1,
    );
    assert.equal(
      (await author.browser("/notifications")).data.items.some(
        (n) => n.type === "review_completed",
      ),
      true,
    );
  } finally {
    await f.close();
  }
});
