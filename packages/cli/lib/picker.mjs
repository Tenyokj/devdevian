import React, { useState, useEffect, useRef } from "react";
import { Box, Text, useInput } from "ink";
import { basename, dirname } from "node:path";
import { clip, editText, graphemes } from "./tui-model.mjs";
import {
  listFiles,
  listChanges,
  readCodeFile,
  readDiff,
  selectLines,
} from "./workspace.mjs";
import { colors } from "./theme.mjs";
const h = React.createElement,
  c = { ...colors, bg: colors.panel };
export function WorkspacePicker({
  root,
  width,
  height,
  initial = "files",
  onSelect,
  onCancel,
}) {
  const [mode, setMode] = useState(initial),
    [folder, setFolder] = useState("."),
    [hidden, setHidden] = useState(false),
    [staged, setStaged] = useState(false),
    [query, setQuery] = useState(""),
    [queryCursor, setQueryCursor] = useState(0),
    [searching, setSearching] = useState(false),
    [items, setItems] = useState([]),
    [index, setIndex] = useState(0),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [selected, setSelected] = useState(null),
    [line, setLine] = useState(0),
    [anchor, setAnchor] = useState(null),
    [hunk, setHunk] = useState(-1),
    [horizontal, setHorizontal] = useState(0);
  const alive = useRef(true),
    selectionController = useRef(null);
  useEffect(
    () => () => {
      alive.current = false;
      selectionController.current?.abort();
    },
    [],
  );
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setItems([]);
    setIndex(0);
    const timer = setTimeout(
      () => {
        const load =
          mode === "files"
            ? listFiles(root, folder, {
                hidden,
                query,
                signal: controller.signal,
              })
            : listChanges(root, { staged, query, signal: controller.signal });
        load
          .then((rows) => {
            if (!controller.signal.aborted) setItems(rows);
          })
          .catch((e) => {
            if (!controller.signal.aborted) setError(e.message);
          })
          .finally(() => {
            if (!controller.signal.aborted) setLoading(false);
          });
      },
      query ? 120 : 0,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [root, folder, hidden, mode, staged, query]);
  const content = selected
      ? selected.kind === "diff"
        ? hunk < 0
          ? selected.patch
          : selected.hunks[hunk].patch
        : selected.code
      : "",
    lines = content.split("\n"),
    panelHeight = Math.max(6, height - 2),
    viewHeight = Math.max(1, panelHeight - 6),
    split = !!selected && width >= 110,
    listWidth = split ? 36 : width,
    previewWidth = split ? width - listWidth - 1 : width;
  function clearSearch() {
    setQuery("");
    setQueryCursor(0);
    setSearching(false);
  }
  async function choose() {
    const item = items[index];
    if (!item || loading) return;
    if (item.directory) {
      setFolder(item.path);
      clearSearch();
      return;
    }
    setLoading(true);
    setError("");
    const controller = new AbortController();
    selectionController.current = controller;
    try {
      const data =
        mode === "files"
          ? await readCodeFile(root, item.path)
          : await readDiff(root, item.path, {
              staged,
              signal: controller.signal,
            });
      if (!alive.current) return;
      setSelected({ ...data, kind: mode === "files" ? "file" : "diff" });
      setLine(0);
      setAnchor(null);
      setHunk(-1);
      setHorizontal(0);
      setSearching(false);
    } catch (e) {
      if (alive.current) setError(e.message);
    } finally {
      if (alive.current) setLoading(false);
    }
  }
  function accept() {
    try {
      if (selected.kind === "file") {
        const start = anchor === null ? null : Math.min(anchor, line) + 1,
          end = anchor === null ? null : Math.max(anchor, line) + 1;
        selectLines(selected.code, start || 1, end || lines.length);
        onSelect({ kind: "file", path: selected.path, start, end });
      } else {
        const part = hunk < 0 ? selected : selected.hunks[hunk];
        selectLines(part.patch);
        onSelect({
          kind: "diff",
          path: selected.path,
          staged: selected.staged,
          hunk: hunk < 0 ? null : hunk,
          hash: part.hash,
        });
      }
    } catch (e) {
      setError(e.message);
    }
  }
  useInput((input, key) => {
    if (key.ctrl && input === "c") {
      onCancel();
      return;
    }
    if (searching) {
      if (key.escape) {
        setSearching(false);
        return;
      }
      if (key.return) {
        setSearching(false);
        return;
      }
      const next = editText(query, queryCursor, input, key, { max: 160 });
      setQuery(next.value);
      setQueryCursor(next.cursor);
      return;
    }
    if (selected) {
      if (key.escape || key.backspace) {
        setSelected(null);
        setError("");
        return;
      }
      if (key.upArrow || key.downArrow || key.pageUp || key.pageDown) {
        const step = key.pageUp || key.pageDown ? viewHeight : 1,
          delta = key.upArrow || key.pageUp ? -step : step;
        setLine((v) => Math.max(0, Math.min(lines.length - 1, v + delta)));
        return;
      }
      if (key.leftArrow || key.rightArrow) {
        setHorizontal((v) => Math.max(0, v + (key.leftArrow ? -8 : 8)));
        return;
      }
      if (input === " " && selected.kind === "file") {
        setAnchor((v) => (v === null ? line : null));
        return;
      }
      if ((input === "[" || input === "]") && selected.kind === "diff") {
        setHunk((v) =>
          Math.max(
            -1,
            Math.min(selected.hunks.length - 1, v + (input === "]" ? 1 : -1)),
          ),
        );
        setLine(0);
        return;
      }
      if (key.return) accept();
      return;
    }
    if (key.escape) {
      onCancel();
      return;
    }
    if (loading) return;
    if (key.upArrow || key.downArrow || key.pageUp || key.pageDown) {
      const step = key.pageUp || key.pageDown ? viewHeight : 1,
        delta = key.upArrow || key.pageUp ? -step : step;
      setIndex((v) => Math.max(0, Math.min(items.length - 1, v + delta)));
      return;
    }
    if (key.return) {
      choose();
      return;
    }
    if (key.leftArrow || key.backspace) {
      setFolder(folder === "." ? "." : dirname(folder));
      clearSearch();
      return;
    }
    if (input === "/") {
      setSearching(true);
      return;
    }
    if (input === "g") {
      setMode((v) => (v === "files" ? "changes" : "files"));
      clearSearch();
      return;
    }
    if (input === "t" && mode === "changes") {
      setStaged((v) => !v);
      clearSearch();
      return;
    }
    if (input === "h" && mode === "files") setHidden((v) => !v);
  });
  function row(text, color = c.text, key, bg) {
    return h(
      Box,
      { key, width: "100%", backgroundColor: bg },
      h(
        Text,
        { color, wrap: "truncate" },
        clip(
          text,
          (selected && (!split || key?.startsWith?.("code"))
            ? previewWidth
            : listWidth) - 4,
        ),
      ),
    );
  }
  const visible = viewHeight,
    first = Math.max(0, index - visible + 1);
  const browser = h(
    Box,
    {
      width: listWidth,
      height: panelHeight,
      key: "browser",
      flexDirection: "column",
      borderStyle: "round",
      borderColor: c.purple,
      paddingX: 1,
      overflow: "hidden",
    },
    row("PROJECT · " + basename(root), c.purple, "title"),
    row(
      mode === "files"
        ? "Files · " + folder
        : "Git changes · " + (staged ? "staged" : "unstaged"),
      c.blue,
      "mode",
    ),
    row(
      searching ? "Find: " + query + "▏" : query ? "Filter: " + query : " ",
      c.muted,
      "query",
    ),
    h(
      Box,
      { height: visible, flexDirection: "column", overflow: "hidden" },
      ...(items.length
        ? items
            .slice(first, first + visible)
            .map((item, i) =>
              row(
                (first + i === index ? "› " : "  ") +
                  (item.directory ? "▸ " : "") +
                  item.name +
                  (mode === "changes"
                    ? `  +${item.added} −${item.removed}`
                    : ""),
                first + i === index ? c.blue : c.text,
                "entry" + i,
                first + i === index ? c.selected : undefined,
              ),
            )
        : [
            row(
              loading ? "Reading project…" : "No matching files or changes.",
              c.muted,
              "empty",
            ),
          ]),
    ),
    row(
      `${Math.min(index + 1, items.length)} / ${items.length}`,
      c.muted,
      "count",
    ),
  );
  const start = Math.max(
      0,
      Math.min(line - Math.floor(viewHeight / 2), lines.length - viewHeight),
    ),
    from = Math.min(anchor ?? line, line),
    to = Math.max(anchor ?? line, line);
  const preview = selected
    ? h(
        Box,
        {
          width: previewWidth,
          height: panelHeight,
          key: "preview",
          flexDirection: "column",
          borderStyle: "round",
          borderColor: c.blue,
          paddingX: 1,
          overflow: "hidden",
        },
        row(selected.path, c.purple, "code-title"),
        row(
          selected.kind === "diff"
            ? (staged ? "Staged" : "Unstaged") +
                " · " +
                (hunk < 0
                  ? "All hunks"
                  : `Hunk ${hunk + 1}/${selected.hunks.length}`)
            : anchor === null
              ? "Whole file · Space selects a range"
              : `Selected lines ${from + 1}–${to + 1}`,
          c.blue,
          "code-mode",
        ),
        row(" ", c.muted, "code-blank"),
        h(
          Box,
          { height: viewHeight, flexDirection: "column", overflow: "hidden" },
          ...lines.slice(start, start + viewHeight).map((text, i) => {
            const n = start + i,
              highlight =
                n === line || (anchor !== null && n >= from && n <= to),
              color =
                selected.kind === "diff"
                  ? text.startsWith("+")
                    ? c.green
                    : text.startsWith("-")
                      ? c.red
                      : c.text
                  : c.text;
            return row(
              (n === line ? "›" : " ") +
                String(n + 1).padStart(4) +
                " " +
                graphemes(text).slice(horizontal).join(""),
              color,
              "code" + i,
              highlight ? c.selected : undefined,
            );
          }),
        ),
        row(
          `${line + 1}/${lines.length} · Enter uses selection`,
          c.muted,
          "code-footer",
        ),
      )
    : null;
  return h(
    Box,
    {
      flexDirection: "column",
      height,
      overflow: "hidden",
      backgroundColor: c.bg,
    },
    h(
      Box,
      { height: height - 2, flexDirection: "row", gap: split ? 1 : 0 },
      selected ? (split ? [browser, preview] : preview) : browser,
    ),
    h(
      Text,
      { color: error ? c.red : c.muted, wrap: "truncate" },
      clip(
        error ||
          (selected
            ? selected.kind === "file"
              ? "↑↓ move · Space start/reset range · Enter use · Esc files"
              : "[ ] all / individual hunks · Enter use · Esc changes"
            : "G files / git diff · T staged / unstaged · H hidden · / filter · Esc cancel"),
        width,
      ),
    ),
  );
}
