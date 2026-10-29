import React from "react";
import { Box, Text } from "ink";
import { useTheme } from "./theme.mjs";
import { clip, graphemes, wrap } from "./tui-model.mjs";
const h = React.createElement;
const row = (text, width, color, key, extra = {}) =>
  h(
    Text,
    { key, color, flexShrink: 0, wrap: "truncate", ...extra },
    clip(text, width),
  );
export function PRFiles({ data, index, width, height }) {
  const c = useTheme(),
    header = height >= 3 ? 1 : 0,
    spacer = height >= 6 ? 1 : 0,
    capacity = Math.max(1, height - header - spacer),
    first = Math.max(0, index - capacity + 1);
  return h(
    Box,
    { width, height, flexDirection: "column", overflow: "hidden" },
    header
      ? row(
          `↑↓ choose · Enter diff · [ ] pages · ${data.pagination.page}/${data.pagination.pages}`,
          width,
          c.muted,
          "header",
        )
      : null,
    spacer ? row(" ", width, c.muted, "space") : null,
    ...data.files
      .slice(first, first + capacity)
      .map((f, i) =>
        row(
          `${first + i === index ? "›" : " "} +${f.additions}/-${f.deletions} · ${f.path} · ${f.status}`,
          width,
          first + i === index ? c.blue : c.text,
          f.path,
          { backgroundColor: first + i === index ? c.selected : undefined },
        ),
      ),
  );
}
export function PRDiff({
  data,
  width,
  height,
  hunk,
  anchor,
  scroll,
  horizontal,
}) {
  const c = useTheme(),
    patch = data.patch;
  if (patch.reason)
    return h(
      Box,
      { width, height, flexDirection: "column", overflow: "hidden" },
      ...wrap(patch.reason + " Esc returns to files; X opens actions.", width)
        .slice(0, height)
        .map((s, i) => row(s, width, c.muted, i)),
    );
  const current = patch.hunks[Math.min(hunk, patch.hunks.length - 1)];
  let old = current.oldStart,
    next = current.newStart;
  const rows = current.lines.slice(1).map((line) => {
    const before = line[0] === " " || line[0] === "-" ? String(old++) : "",
      after = line[0] === " " || line[0] === "+" ? String(next++) : "";
    return { line, prefix: before.padStart(5) + " " + after.padStart(5) + " " };
  });
  const capacity = Math.max(
      0,
      height - 1 - (height >= 5 ? 1 : 0) - (height >= 6 ? 1 : 0),
    ),
    first = Math.min(scroll, Math.max(0, rows.length - capacity)),
    from = Math.min(anchor ?? hunk, hunk) + 1,
    to = Math.max(anchor ?? hunk, hunk) + 1;
  return h(
    Box,
    { width, height, flexDirection: "column", overflow: "hidden" },
    row(
      `Hunk ${hunk + 1}/${patch.hunks.length} · selected ${from}–${to} · C request review`,
      width,
      c.purple,
      "title",
      { bold: true },
    ),
    height >= 5 ? row(current.header, width, c.muted, "header") : null,
    ...rows
      .slice(first, first + capacity)
      .map((r, i) =>
        row(
          r.prefix +
            graphemes(r.line.replaceAll("\t", "  ")).slice(horizontal).join(""),
          width,
          r.line[0] === "+" ? c.green : r.line[0] === "-" ? c.red : c.text,
          i,
        ),
      ),
    height >= 6
      ? row(
          `Old / new file lines · snapshot ${data.pull.commit.slice(0, 7)} · ←→ pan`,
          width,
          c.muted,
          "footer",
        )
      : null,
  );
}
