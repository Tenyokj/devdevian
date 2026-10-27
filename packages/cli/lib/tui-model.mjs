import stringWidth from "string-width";
import wrapAnsi from "wrap-ansi";
import { clean } from "./client.mjs";
const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
export const graphemes = (value) =>
  Array.from(segmenter.segment(value), (part) => part.segment);
export function clip(value, width) {
  const text = clean(value).replace(/\n/g, " ");
  if (width <= 0) return "";
  if (stringWidth(text) <= width) return text;
  let result = "";
  for (const part of graphemes(text)) {
    if (stringWidth(result + part) > width - 1) break;
    result += part;
  }
  return result + "…";
}
export function wrap(value, width) {
  return wrapAnsi(clean(value).replace(/\t/g, "  "), Math.max(1, width), {
    hard: true,
    trim: false,
  }).split("\n");
}
export function editText(
  value,
  cursor,
  input,
  key,
  { multiline = false, max = 15000 } = {},
) {
  const chars = graphemes(value),
    at = Math.max(0, Math.min(cursor, chars.length));
  if (multiline && (key.upArrow || key.downArrow)) {
    const start = chars.slice(0, at).lastIndexOf("\n") + 1,
      column = at - start;
    if (key.upArrow) {
      if (!start) return { value, cursor: 0 };
      const previous = chars.slice(0, start - 1).lastIndexOf("\n") + 1;
      return { value, cursor: Math.min(start - 1, previous + column) };
    }
    const end = chars.indexOf("\n", at);
    if (end < 0) return { value, cursor: chars.length };
    const next = chars.indexOf("\n", end + 1);
    return {
      value,
      cursor: Math.min(next < 0 ? chars.length : next, end + 1 + column),
    };
  }
  if (key.leftArrow) return { value, cursor: Math.max(0, at - 1) };
  if (key.rightArrow) return { value, cursor: Math.min(chars.length, at + 1) };
  if (key.home || (key.ctrl && input === "a")) {
    const previous = chars.slice(0, at).lastIndexOf("\n");
    return { value, cursor: previous + 1 };
  }
  if (key.end || (key.ctrl && input === "e")) {
    const next = chars.indexOf("\n", at);
    return { value, cursor: next < 0 ? chars.length : next };
  }
  if (key.ctrl && input === "u") {
    let start = chars.slice(0, at).lastIndexOf("\n") + 1;
    return {
      value: [...chars.slice(0, start), ...chars.slice(at)].join(""),
      cursor: start,
    };
  }
  if (key.ctrl && input === "k") {
    const end = chars.indexOf("\n", at);
    return {
      value: [...chars.slice(0, at), ...(end < 0 ? [] : chars.slice(end))].join(
        "",
      ),
      cursor: at,
    };
  }
  if (key.backspace) {
    if (!at) return { value, cursor: at };
    return {
      value: [...chars.slice(0, at - 1), ...chars.slice(at)].join(""),
      cursor: at - 1,
    };
  }
  if (key.delete)
    return {
      value: [...chars.slice(0, at), ...chars.slice(at + 1)].join(""),
      cursor: at,
    };
  if (key.ctrl || key.meta || key.escape || key.tab)
    return { value, cursor: at };
  let insertion = key.return
    ? multiline
      ? "\n"
      : ""
    : clean(input).replace(/\r/g, "");
  if (!multiline) insertion = insertion.replace(/\n/g, " ");
  if (!insertion) return { value, cursor: at };
  const remaining = Math.max(0, max - value.length),
    parts = [];
  let length = 0;
  for (const part of graphemes(insertion)) {
    if (length + part.length > remaining) break;
    parts.push(part);
    length += part.length;
  }
  return {
    value: [...chars.slice(0, at), ...parts, ...chars.slice(at)].join(""),
    cursor: at + parts.length,
  };
}
export function cursorLines(value, cursor, width) {
  const parts = graphemes(value),
    lines = wrap(
      parts.slice(0, cursor).join("") + "▏" + parts.slice(cursor).join(""),
      width,
    );
  const marker = lines.findIndex((line) => line.includes("▏"));
  return { lines, line: Math.max(0, marker) };
}
export function parseCommand(text) {
  const [cmd, ...rest] = text.trim().replace(/^\//, "").split(/\s+/);
  const arg = rest.join(" ");
  if (
    [
      "feed",
      "inbox",
      "communities",
      "search",
      "ask",
      "review",
      "help",
      "devices",
      "drafts",
      "appearance",
    ].includes(cmd)
  )
    return { command: cmd, arg };
  if (
    cmd === "open" &&
    /^[1-9]\d*$/.test(arg) &&
    Number.isSafeInteger(Number(arg))
  )
    return { command: cmd, arg: Number(arg) };
  if (["quit", "logout"].includes(cmd)) return { command: cmd };
  throw Error(
    "Use /feed, /inbox, /search words, /open ID, /ask, /review, /communities, /devices, /drafts, /appearance, /help or /quit.",
  );
}
export class PageCache {
  constructor({ max = 40, ttl = 30000 } = {}) {
    this.rows = new Map();
    this.max = max;
    this.ttl = ttl;
  }
  get(key) {
    const row = this.rows.get(key);
    if (!row || Date.now() - row.time > this.ttl) return null;
    this.rows.delete(key);
    this.rows.set(key, row);
    return row.value;
  }
  set(key, value) {
    this.rows.delete(key);
    this.rows.set(key, { value, time: Date.now() });
    while (this.rows.size > this.max)
      this.rows.delete(this.rows.keys().next().value);
  }
  clear() {
    this.rows.clear();
  }
}
