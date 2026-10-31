import { test } from "node:test";
import assert from "node:assert/strict";
import { workQuery } from "../lib/my-work.mjs";
import { loadPage } from "../lib/tui-data.mjs";
import { deviArt, deviLayout } from "../lib/devi.mjs";
import { themeFor } from "../lib/theme.mjs";

test("My work reads only the selected bounded account-scoped page", async () => {
  const expected = {
    mine: "author=me",
    reviews: "author=me&kind=review",
    saved: "saved=1",
    following: "following=1",
  };
  for (const [tab, filter] of Object.entries(expected)) {
    const calls = [];
    const result = await loadPage(
      async (path) => {
        calls.push(path);
        return { items: [{ id: 7 }], pagination: { page: 2, pages: 3 } };
      },
      { view: "work", tab, page: 2 },
    );
    assert.deepEqual(calls, ["/posts?limit=12&page=2&" + filter]);
    assert.equal(result.items[0].id, 7);
    assert.equal(result.pagination.page, 2);
  }
  assert.throws(() => workQuery("all&author=1"));
  assert.throws(() => workQuery("mine", 0));
});

test("Halloween pumpkin fits bounded layouts, preserves required controls and disappears when hidden or switched off", () => {
  assert.ok(themeFor({ theme: "halloween" }).seasonal);
  assert.equal(
    themeFor({ theme: "halloween" }).blue,
    themeFor({ accent: "orange" }).blue,
  );
  assert.equal(themeFor({ theme: "midnight" }).seasonal, false);
  assert.notDeepEqual(deviArt(false, 0, "pumpkin"), deviArt());
  for (const width of [18, 56, 112])
    for (const height of [5, 12, 25]) {
      const rows = deviLayout({
        width,
        height,
        variant: "pumpkin",
        message: "Pumpkin glow",
        status: ["Connecting"],
        footer: ["Esc cancels"],
      });
      assert.ok(rows.length <= height);
      assert.ok(rows.some((row) => row.text.includes("Esc cancels")));
    }
  const hidden = deviLayout({
    width: 100,
    height: 30,
    variant: "pumpkin",
    show: false,
    message: "",
    status: ["Ready"],
  });
  assert.equal(hidden.map((r) => r.text).join(""), "Ready");
});
