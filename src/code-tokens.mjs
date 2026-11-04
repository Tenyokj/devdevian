import { createLowlight } from "lowlight";
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import python from "highlight.js/lib/languages/python";
import json from "highlight.js/lib/languages/json";
import css from "highlight.js/lib/languages/css";
import xml from "highlight.js/lib/languages/xml";
import bash from "highlight.js/lib/languages/bash";
import sql from "highlight.js/lib/languages/sql";
const highlighter = createLowlight({
  javascript,
  typescript,
  python,
  json,
  css,
  xml,
  bash,
  sql,
});
const extensions = {
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  ts: "typescript",
  tsx: "typescript",
  py: "python",
  json: "json",
  css: "css",
  html: "xml",
  svg: "xml",
  xml: "xml",
  sh: "bash",
  bash: "bash",
  sql: "sql",
};
export function codeTokens(code, path = "") {
  // Highlight presentation only. Never alter, execute or re-anchor stored code.
  if (typeof code !== "string") return [[]];
  const plain = () => code.split("\n").map((text) => [{ text, classes: "" }]);
  if (code.length > 25000) return plain();
  let language = extensions[path.split(".").pop()?.toLowerCase()];
  if (!language)
    language = /\b(?:SELECT|CREATE TABLE|FROM)\b/.test(code)
      ? "sql"
      : /^(?:from \w+ import|import \w+|def \w+|class \w+:)/m.test(code)
        ? "python"
        : "javascript";
  try {
    const tree = highlighter.highlight(language, code),
      lines = [[]];
    function visit(node, classes = "") {
      if (node.type === "text")
        node.value.split("\n").forEach((text, i) => {
          if (i) lines.push([]);
          if (text) lines.at(-1).push({ text, classes });
        });
      else {
        const next = [classes, ...(node.properties?.className || [])]
          .filter(Boolean)
          .join(" ");
        for (const child of node.children || []) visit(child, next);
      }
    }
    visit(tree);
    return lines;
  } catch {
    return plain();
  }
}
