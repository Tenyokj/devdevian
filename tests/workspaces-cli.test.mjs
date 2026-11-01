import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { startTestServer } from "./http-fixture.mjs";
import { client } from "../packages/cli/lib/client.mjs";
import {
  revisionBase,
  revisionFiles,
  revisionPlan,
  feedbackAnchor,
} from "../packages/cli/lib/project-workspace.mjs";
test(
  "real browser/CLI continuity preserves original feedback, permissions and conflicts across immutable revisions",
  { timeout: 30000 },
  async () => {
    const f = await startTestServer(),
      browser = f.client(),
      other = f.client(),
      anon = f.client();
    try {
      for (const [api, name] of [
        [browser, "workspace_cli_author"],
        [other, "workspace_cli_reviewer"],
      ])
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
      const project = (
        await browser("/projects", {
          name: "CLI Orbit",
          topic: "web",
          stage: "Prototype",
          description: "A project for real browser and CLI continuity.",
          help: "Review this queue and its retry boundaries.",
        })
      ).data;
      const post = (
        await browser("/posts", {
          kind: "review",
          title: "Review the CLI retry boundary",
          topic: "web",
          body: "Please inspect this retry and its failure behavior.",
          code: "export const retry = () => true;",
          review_focus: "Look at retry boundaries and timeouts.",
        })
      ).data;
      const device = (await anon("/cli/device", { name: "Workspace test" }))
        .data;
      await browser("/cli/authorize", {
        user_code: device.user_code,
        approved: true,
      });
      const token = (
        await anon("/cli/token", { device_code: device.device_code })
      ).data.access_token;
      const api = client(f.base, token);
      const config = join(f.directory, "config");
      await mkdir(config);
      await writeFile(
        join(config, "credentials.json"),
        JSON.stringify({ origin: f.base, token }),
        { mode: 0o600 },
      );
      await writeFile(
        join(f.directory, "retry.ts"),
        "export const retry = () => false;\nexport const limit = 3;",
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
                "--project",
                f.directory,
              ],
              {
                env: { ...process.env, DEVDEVIAN_CONFIG_DIR: config },
                cwd: f.directory,
              },
            )
          ).stdout,
        );
      await cli("workspace", "bind", String(project.id), "--yes");
      await cli("workspace", "link", String(post.id), "--yes");
      assert.equal(
        (await browser(`/projects/${project.id}/work-requests`)).data.items[0]
          .id,
        post.id,
      );
      await cli(
        "workspace",
        "state",
        String(post.id),
        "--state",
        "in_progress",
        "--yes",
      );
      assert.equal((await cli("workspace")).items[0].state, "in_progress");
      const base = await revisionBase(api, post.id);
      const metadata = await api(`/posts/${post.id}/code-reviews`);
      const note = await other(`/posts/${post.id}/code-reviews`, {
        body: "Keep the original retry boundary visible.",
        start_line: 1,
        end_line: 1,
        snippet_hash: metadata.snippet_hash,
        ...feedbackAnchor(base.post, metadata, 1, 1),
      });
      assert.equal(note.status, 201);
      const files = await revisionFiles(f.directory, { file: "retry.ts" });
      const plan = revisionPlan(
        post.id,
        base,
        files,
        "Please review the updated retry limit.",
      );
      const published = await cli(
        "review",
        "revise",
        String(post.id),
        "--file",
        "retry.ts",
        "--focus",
        "Please review the updated retry limit.",
        "--yes",
      );
      assert.equal(published.number, 2);
      await assert.rejects(
        api(plan.url, { method: "POST", body: plan.payload }),
        (e) => e.status === 409,
      );
      const history = await cli("review", "versions", String(post.id));
      assert.equal(history.items.length, 2);
      const original = await cli(
        "review",
        "snapshot",
        String(post.id),
        String(base.baseRevisionId),
      );
      assert.equal(original.code, base.post.code);
      const feedback = (await browser(`/posts/${post.id}/code-reviews`)).data;
      assert.equal(feedback.items[0].outdated, true);
      assert.equal(feedback.items[0].snapshot_id, base.baseRevisionId);
      assert.equal(Boolean(feedback.items[0].resolved), false);
      assert.equal(feedback.summary.earlier, 1);
      const latestRemark = await cli(
        "review",
        "comment",
        String(post.id),
        "--start-line",
        "1",
        "--body",
        "The new limit now has an explicit bound.",
        "--yes",
      );
      const afterComment = await api(
        `/posts/${post.id}/code-reviews?target_id=${latestRemark.id}`,
      );
      assert.equal(
        afterComment.items.find((row) => row.id === latestRemark.id)
          .snapshot_id,
        published.id,
      );
      const community = (
        await browser("/communities", {
          name: "CLI private workspace",
          description:
            "Private review must remain unavailable to other accounts.",
        })
      ).data;
      const privatePost = (
        await browser("/posts", {
          kind: "review",
          topic: "web",
          title: "Hidden CLI revision",
          body: "Do not reveal this code outside the private team.",
          code: "export const secretFixture = true;",
          review_focus: "Check the private fixture boundary.",
          community_id: community.id,
        })
      ).data;
      const hidden = (await browser(`/posts/${privatePost.id}/revisions`)).data;
      assert.equal(
        (
          await other(
            `/posts/${privatePost.id}/revisions/${hidden.current_revision_id}`,
          )
        ).status,
        404,
      );
      await cli("workspace", "unlink", String(post.id), "--yes");
      assert.equal((await api(`/posts/${post.id}`)).id, post.id);
      assert.equal((await cli("workspace")).items.length, 0);
    } finally {
      await f.close();
    }
  },
);
