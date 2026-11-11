import { test } from "node:test";
import assert from "node:assert/strict";
import {
  readExtensionDraft,
  saveExtensionDraft,
  extensionDraftKey,
  requestExtensionResume,
  consumeExtensionResume,
} from "../src/extension-drafts.js";
const store = () => {
  const data = new Map();
  return {
    getItem: (k) => data.get(k) || null,
    setItem: (k, v) => data.set(k, v),
    removeItem: (k) => data.delete(k),
  };
};
test("extension drafts preserve incomplete fields, package and image references by account; never restore consent", () => {
  const storage = store(),
    draft = {
      name: "My extension",
      slug: "my-extension",
      version: "1.0.0",
      description: "Short description here",
      full_description: "## Guide",
      tags: "theme,",
      links: [{ label: "Source", url: "https://" }],
      screenshots: ["owned-screenshot-0000000001"],
    },
    pkg = {
      manifest: {
        schema: 2,
        kind: "extension",
        permissions: [],
        entry: "main.js",
        files: { "main.js": 'document.body.textContent="hello"' },
        styles: { light: "", dark: "" },
      },
      consent: true,
    };
  assert.equal(saveExtensionDraft(storage, 1, draft, pkg), true);
  assert.deepEqual(readExtensionDraft(storage, 1), {
    draft,
    pkg: { manifest: pkg.manifest },
  });
  assert.equal(readExtensionDraft(storage, 2), null);
  requestExtensionResume(1);
  assert.equal(consumeExtensionResume(2), false);
  assert.equal(consumeExtensionResume(1), true);
  assert.equal(consumeExtensionResume(1), false);
  const saved = JSON.parse(storage.getItem(extensionDraftKey(1)));
  saved.savedAt = Date.now() - 31 * 86400000;
  storage.setItem(extensionDraftKey(1), JSON.stringify(saved));
  assert.equal(readExtensionDraft(storage, 1), null);
  assert.equal(
    saveExtensionDraft(
      {
        setItem() {
          throw Error("quota");
        },
      },
      1,
      draft,
      pkg,
    ),
    false,
  );
  assert.equal(
    saveExtensionDraft(storage, 1, { version: "2.0.0" }, null),
    true,
  );
  assert.equal(readExtensionDraft(storage, 1).draft.version, "2.0.0");
  assert.equal(saveExtensionDraft(storage, 1, {}, null), true);
  assert.equal(readExtensionDraft(storage, 1), null);
});
