import { test } from "node:test";
import assert from "node:assert/strict";
import { mentionedHandles } from "../mentions.mjs";

test("mention parsing matches visible Markdown text and ignores code, links, HTML and emails", () => {
  const body =
    'Hi @Alice (@BoB), [@linked](https://example.test) and `@inline`.\n\n```js\n@fenced\n```\n\n    @indented\n\nemail@example.test and @ALICE.\n\n<img alt="@htmltag">\n\n![image @image](https://example.test)\n\n[@reference][ref]\n\n[ref]: https://example.test/@destination';
  assert.deepEqual(mentionedHandles(body), ["alice", "bob"]);
  assert.deepEqual(
    mentionedHandles(
      "@ab @a2345678901234567890123456789012345 @partialЯ @okay_name",
    ),
    ["okay_name"],
  );
  assert.equal(
    mentionedHandles(
      Array.from({ length: 40 }, (_, i) => "@member_" + i).join(" "),
    ).length,
    10,
  );
});
