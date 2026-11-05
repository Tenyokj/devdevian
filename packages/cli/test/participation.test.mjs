import { test } from "node:test";
import assert from "node:assert/strict";
import {
  participationPlan,
  participationPayload,
} from "../lib/project-access.mjs";
import { parseCommand } from "../lib/tui-model.mjs";
test("Participation plans preserve the captured policy version and never grant community access", async () => {
  const calls = [];
  const plan = await participationPlan(async (p) => {
    calls.push(p);
    return {
      mode: "approved",
      version: 4,
      can_manage: true,
      members: [{ username: "alice" }],
      capabilities: { project_participation: 1 },
    };
  }, 7);
  assert.deepEqual(calls, ["/projects/7/participation"]);
  assert.equal(plan.values.members, "@alice");
  assert.deepEqual(
    participationPayload(
      "approved",
      "@alice\nbob",
      plan.payload.expected_version,
    ),
    { mode: "approved", members: ["@alice", "bob"], expected_version: 4 },
  );
  assert.match(plan.audience, /does not grant/);
  assert.throws(() => participationPayload("all", "", 4));
  assert.throws(() => participationPayload("approved", "bad/user", 4));
  assert.equal(parseCommand("/participation 7").command, "participation");
});
