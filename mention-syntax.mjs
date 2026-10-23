// Shared with the renderer so notification detection follows the visible syntax.
export function mentionMatches(text) {
  return [
    ...text.matchAll(
      /(^|[\s([{])@([a-zA-Z][a-zA-Z0-9_]{2,29})(?![\p{L}\p{N}_])/gu,
    ),
  ].map((m) => ({
    start: m.index + m[1].length,
    end: m.index + m[0].length,
    username: m[2],
  }));
}
export function walkMentionText(node, visit) {
  if (
    [
      "code",
      "inlineCode",
      "link",
      "linkReference",
      "html",
      "image",
      "imageReference",
      "definition",
    ].includes(node.type)
  )
    return;
  if (node.type === "text") visit(node);
  else for (const child of node.children || []) walkMentionText(child, visit);
}
