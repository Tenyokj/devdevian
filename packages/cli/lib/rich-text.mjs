import { clean } from "./client.mjs";
import { wrap } from "./tui-model.mjs";
import { colors as c } from "./theme.mjs";

// Small, predictable terminal renderer. HTML and terminal hyperlinks are never executed.
export function syntaxSpans(text) {
  const pattern =
    /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`[^`]*`|\/\/.*$|#.*$|\b(?:async|await|function|return|const|let|var|if|else|throw|new|class|import|from|export|def|None|True|False|true|false|null|try|catch|for|while)\b|\b\d+(?:\.\d+)?\b)/g;
  const parts = [];
  let start = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > start)
      parts.push({ text: text.slice(start, match.index) });
    const word = match[0];
    parts.push({
      text: word,
      color: /^(\/\/|#)/.test(word)
        ? c.muted
        : /^["'`]/.test(word)
          ? c.green
          : /^\d/.test(word)
            ? c.blue
            : c.purple,
    });
    start = match.index + word.length;
  }
  if (start < text.length) parts.push({ text: text.slice(start) });
  return parts;
}
export function markdownRows(value, width) {
  let fence = null,
    number = 0;
  const rows = [];
  for (const raw of clean(value).replace(/\t/g, "  ").split("\n")) {
    const marker = raw.match(/^\s*(`{3,}|~{3,})(.*)$/);
    if (
      marker &&
      (!fence ||
        (marker[1][0] === fence[0] &&
          marker[1].length >= fence.length &&
          !marker[2].trim()))
    ) {
      if (fence) {
        fence = null;
        rows.push({ text: "", color: c.muted });
      } else {
        fence = marker[1];
        number = 0;
        rows.push({
          text:
            "CODE SNIPPET" + (marker[2].trim() ? " · " + marker[2].trim() : ""),
          color: c.blue,
          bold: true,
        });
      }
      continue;
    }
    if (fence) {
      const prefix = String(++number).padStart(4) + "  ";
      for (const [i, line] of wrap(raw, Math.max(1, width - 6)).entries()) {
        const text = (i ? "      " : prefix) + line;
        rows.push({ text, spans: syntaxSpans(text) });
      }
      continue;
    }
    const heading = /^#{1,6}\s+/.test(raw),
      quote = /^>\s?/.test(raw);
    const text = raw
      .replace(/^#{1,6}\s+/, "")
      .replace(/^>\s?/, "│ ")
      .replace(/^\s*[-*+]\s+/, "• ")
      .replace(/\[([^\]\n]+)\]\(([^)\n]+)\)/g, "$1 <$2>");
    for (const line of wrap(text, width)) {
      const parts = [];
      let start = 0;
      for (const match of line.matchAll(/\*\*([^*]+)\*\*|`([^`]+)`/g)) {
        if (match.index > start)
          parts.push({ text: line.slice(start, match.index) });
        parts.push({
          text: match[1] || match[2],
          bold: !!match[1],
          color: match[2] ? c.blue : undefined,
        });
        start = match.index + match[0].length;
      }
      parts.push({ text: line.slice(start) });
      rows.push({
        text: parts.map((p) => p.text).join(""),
        spans: parts,
        bold: heading,
        color: heading ? c.purple : quote ? c.muted : c.text,
      });
    }
  }
  return rows;
}
