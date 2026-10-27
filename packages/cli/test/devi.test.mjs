import { test } from "node:test";
import assert from "node:assert/strict";
import stringWidth from "string-width";
import { deviArt, deviLayout } from "../lib/devi.mjs";
import { normalizeAppearance, defaultAppearance } from "../lib/appearance.mjs";

test("Devi is terminal-native, bounded and readable without terminal image support", () => {
  assert.ok(deviArt().some((line) => line.includes("</>")));
  assert.notDeepEqual(deviArt(false, 0), deviArt(false, 4));
  for (const width of [20, 56, 76, 116])
    for (const height of [2, 6, 12, 26]) {
      const rows = deviLayout({
        width,
        height,
        message: "Devi missed you.",
        status: ["Connecting to Devdevian..."],
        footer: ["Ctrl+C exits"],
      });
      assert.ok(rows.length <= height);
      assert.ok(rows.every((row) => stringWidth(row.text) <= width));
      assert.ok(rows.some((row) => row.text.includes("Ctrl+C exits")));
      assert.ok(rows.every((row) => !/[\u0400-\u04ff\x1b]/.test(row.text)));
    }
});

test("small sign-in screens prioritize device code, address and controls over decoration", () => {
  const address = "https://devdevian.vercel.app/app#cli/authorize/AB12-CD34";
  const rows = deviLayout({
    width: 56,
    height: 6,
    message: "Devi saved you a seat.",
    status: [
      "Confirm this code: AB12-CD34",
      address,
      "Waiting for your approval...",
    ],
    footer: ["Enter reopens the browser · Esc cancels"],
  });
  const text = rows.map((row) => row.text).join("\n");
  assert.ok(text.includes("AB12-CD34"));
  assert.ok(text.includes(address));
  assert.ok(text.includes("Esc cancels"));
  assert.ok(!text.includes("</>"));
  const off = deviLayout({
    width: 80,
    height: 20,
    message: "",
    show: false,
    status: ["Connecting to Devdevian..."],
  });
  assert.equal(off.length, 1);
  const empty = deviLayout({
    width: 80,
    height: 20,
    show: false,
    message: "You're all caught up.",
    status: ["Replies appear here."],
  });
  assert.ok(empty.some((row) => row.text.includes("caught up")));
});

test("existing 0.5.0 preferences gain the optional Devi setting without a schema migration", () => {
  const { welcome, ...old } = defaultAppearance;
  assert.equal(normalizeAppearance(old).welcome, "on");
  assert.equal(normalizeAppearance({ ...old, welcome: "off" }).welcome, "off");
  assert.throws(
    () => normalizeAppearance({ welcome: "maybe" }),
    /Invalid welcome/,
  );
});
