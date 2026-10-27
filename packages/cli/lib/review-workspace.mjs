import React from "react";
import { Box, Text } from "ink";
import { clip, graphemes } from "./tui-model.mjs";
import { syntaxSpans } from "./rich-text.mjs";
import { useTheme } from "./theme.mjs";
const h = React.createElement;
export function codeRange(line, anchor = null) {
  return {
    start: Math.min(line, anchor ?? line) + 1,
    end: Math.max(line, anchor ?? line) + 1,
  };
}
export function reviewExcerpt(post, note) {
  // Never attach an old remark to unrelated lines in the new snippet.
  if (note?.outdated)
    return {
      text: note.quote || "Earlier snippet unavailable",
      first: note.start_line || 1,
      old: true,
    };
  return { text: post?.code || "", first: 1, old: false };
}
export function ReviewWorkspace({
  post,
  note,
  items,
  index,
  width,
  height,
  focus,
  line,
  anchor,
  horizontal = 0,
  rows,
  layout = "auto",
  stride = 4,
}) {
  const c = useTheme();
  const split = width >= 78 && layout !== "stacked",
    codeWidth = split ? Math.floor(width * 0.55) : width;
  const selectedNote = note || items[index];
  const excerpt = reviewExcerpt(post, focus === "code" ? null : selectedNote),
    lines = excerpt.text.split("\n");
  const range = codeRange(line, anchor);
  const target = excerpt.old
    ? 0
    : focus === "code"
      ? line
      : Math.max(0, (selectedNote?.start_line || 1) - 1);
  const header = height >= 4 ? 2 : 1,
    count = Math.max(1, height - header),
    top = Math.max(
      0,
      Math.min(lines.length - count, target - Math.floor(count / 3)),
    );
  const code = h(
    Box,
    { width: codeWidth, height, flexDirection: "column", overflow: "hidden" },
    h(
      Text,
      { color: focus === "code" ? c.blue : c.purple, bold: true },
      clip(
        excerpt.old
          ? "Earlier snippet · saved quote"
          : "Code · W focus · C comment",
        codeWidth,
      ),
    ),
    header === 2
      ? h(
          Text,
          { color: c.muted },
          clip(
            focus === "code"
              ? `Lines ${range.start}–${range.end} · Space select`
              : "Markers: remarks on this page",
            codeWidth,
          ),
        )
      : null,
    ...Array.from({ length: count }, (_, i) => {
      const n = top + i,
        number = excerpt.first + n;
      if (n >= lines.length) return h(Text, { key: i }, " ");
      const marked =
        !excerpt.old &&
        items.some(
          (item) =>
            !item.outdated &&
            !item.deleted_at &&
            number >= item.start_line &&
            number <= item.end_line,
        );
      const highlighted =
        excerpt.old ||
        (focus === "code"
          ? number >= range.start && number <= range.end
          : selectedNote &&
            !selectedNote.outdated &&
            number >= selectedNote.start_line &&
            number <= selectedNote.end_line);
      const text = lines[n];
      const rendered = clip(
        `${marked ? "●" : " "}${String(number).padStart(4)}  ${graphemes(text.replaceAll("\t", "  ")).slice(horizontal).join("")}`,
        codeWidth,
      );
      return h(
        Text,
        {
          key: i,
          backgroundColor: highlighted ? c.selected : undefined,
          color: text.startsWith("+")
            ? c.green
            : text.startsWith("-")
              ? c.red
              : c.text,
        },
        ...(text.startsWith("+") || text.startsWith("-")
          ? [rendered]
          : syntaxSpans(rendered, c).map((span, j) =>
              h(Text, { key: j, color: span.color }, span.text),
            )),
      );
    }),
  );
  const notesWidth = split ? width - codeWidth - 2 : width;
  const visible = Math.max(1, Math.floor((height - 2) / stride)),
    first = Math.max(0, index - visible + 1);
  const notes = h(
    Box,
    { width: notesWidth, height, flexDirection: "column", overflow: "hidden" },
    h(
      Text,
      { color: focus === "notes" ? c.blue : c.purple, bold: true },
      "Discussion · W focus",
    ),
    header === 2
      ? h(
          Text,
          { color: c.muted },
          clip("Enter thread · Space read · X actions", notesWidth),
        )
      : null,
    ...(items.length
      ? rows(notesWidth)
          .slice(first * stride, first * stride + height - header)
          .map((row, i) =>
            h(
              Text,
              {
                key: i,
                color: row.color || c.text,
                bold: row.bold,
                backgroundColor: row.selected ? c.selected : undefined,
              },
              clip(typeof row === "string" ? row : row.text, notesWidth),
            ),
          )
      : [h(Text, { key: "empty", color: c.muted }, "No remarks. C adds one.")]),
  );
  return h(
    Box,
    { height, width, gap: split ? 2 : 0, overflow: "hidden" },
    ...(split ? [code, notes] : [focus === "code" ? code : notes]),
  );
}
