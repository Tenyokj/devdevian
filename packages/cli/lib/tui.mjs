import React, { useState, useEffect, useMemo, useRef } from "react";
import { render, Box, Text, useApp, useInput, useWindowSize } from "ink";
import { randomBytes } from "node:crypto";
import { homedir, hostname } from "node:os";
import { workspaceRoot, reviewSource } from "./workspace.mjs";
import { DeviPanel } from "./devi.mjs";
import { WorkspacePicker } from "./picker.mjs";
import { DraftStore, draftIdentity } from "./drafts.mjs";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import {
  client,
  loadConfig,
  saveConfig,
  removeConfig,
  originOf,
  clean,
} from "./client.mjs";
import {
  graphemes,
  clip,
  wrap,
  editText,
  cursorLines,
  parseCommand,
  PageCache,
} from "./tui-model.mjs";
import {
  navigation,
  loadPage,
  contentLines,
  assertSnippet,
  notificationRoute,
} from "./tui-data.mjs";
import { basename } from "node:path";
import { themeFor, ThemeContext, useTheme } from "./theme.mjs";
import {
  appearanceFields,
  defaultAppearance,
  loadAppearance,
  saveAppearance,
  normalizeAppearance,
  appearanceFlags,
} from "./appearance.mjs";
import { liveLoop, anchoredIndex } from "./live.mjs";
import { fieldGuidance, stepControls } from "./form-guidance.mjs";
import { paletteItems } from "./palette.mjs";
import {
  formSteps,
  stepAt,
  readingMatches,
  nextReadingMatch,
  ReadingMemory,
} from "./workflow.mjs";
import { contextActions } from "./context-actions.mjs";
import { editExternal } from "./external-editor.mjs";
import { markdownRows } from "./rich-text.mjs";
import { problemMessage } from "./problems.mjs";
import { ReviewWorkspace, codeRange } from "./review-workspace.mjs";
import {
  catalogFields,
  initialCatalog,
  catalogDocument,
  prepareCatalog,
  publishCatalog,
  saveCalendar,
  validateFilter,
  localTime,
  viewerZone,
  webURL,
} from "./catalog.mjs";
const h = React.createElement;
const itemsOf = (value) => (Array.isArray(value) ? value : value?.items || []);
const stamp = (value) => {
  const date = new Date(
    typeof value === "number"
      ? value
      : String(value || "").replace(" ", "T") +
        (/Z$|[+-]\d\d:\d\d$/.test(value || "") ? "" : "Z"),
  );
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      });
};
const labelOf = (route) =>
  navigation.find((item) => item[0] === route.view)?.[1] ||
  {
    post: "Conversation",
    community: "Community",
    feedback: "Code feedback",
    thread: "Reply thread",
    project: "Project",
    event: "Event",
  }[route.view] ||
  "Workspace";
function openBrowser(url) {
  const [command, args] =
    process.platform === "darwin"
      ? ["open", [url]]
      : process.platform === "win32"
        ? ["rundll32", ["url.dll,FileProtocolHandler", url]]
        : ["xdg-open", [url]];
  const child = spawn(command, args, {
    stdio: "ignore",
    detached: true,
    shell: false,
  });
  child.on("error", () => {});
  child.unref();
}
function fieldsFor(form) {
  if (["catalog", "catalogFilter", "calendar"].includes(form.kind)) {
    const fields = catalogFields(form),
      steps = formSteps(form, fields);
    return steps.length
      ? steps.flatMap((step) => step.indexes.map((i) => fields[i]))
      : fields;
  }
  if (form.kind === "appearance") return appearanceFields;
  if (form.kind === "publication")
    return [
      {
        key: "kind",
        label: "Publication type",
        options: [
          ["discussion", "Discussion"],
          ["question", "Question"],
          ["review", "Code review"],
          ["showcase", "Show & tell"],
        ],
      },
      { key: "title", label: "Title", min: 5, max: 160 },
      { key: "topic", label: "Topic", options: form.topics },
      { key: "community_id", label: "Audience", options: form.audiences },
      ...(form.values.kind === "review"
        ? [
            {
              key: "file",
              label: form.source?.kind === "diff" ? "Git diff" : "Code file",
              min: 1,
              max: 1500,
              hint: "Ctrl+O file explorer · Ctrl+G Git diff · Enter browses an empty field.",
            },
            ...(form.source?.kind === "diff"
              ? []
              : [
                  {
                    key: "lines",
                    label: "File lines (optional)",
                    max: 30,
                    hint: "START:END; published snippet line numbers start at 1.",
                  },
                ]),
            {
              key: "review_focus",
              label: "Review focus",
              min: 10,
              max: 1500,
              multiline: true,
            },
          ]
        : []),
      ...(form.values.kind === "showcase"
        ? [{ key: "demo_url", label: "Demo URL", min: 8, max: 1000 }]
        : []),
      {
        key: "body",
        label: form.values.kind === "review" ? "Context" : "Message",
        min: 10,
        max: 15000,
        multiline: true,
      },
    ];
  if (form.kind === "open")
    return [
      {
        key: "id",
        label: "Conversation ID",
        min: 1,
        max: 16,
        hint: "Find the ID next to a conversation in the feed.",
      },
    ];
  if (form.kind === "community")
    return [
      { key: "name", label: "Community name", min: 3, max: 80 },
      {
        key: "description",
        label: "Description",
        min: 10,
        max: 1500,
        multiline: true,
      },
    ];
  if (form.kind === "line")
    return [
      { key: "start_line", label: "From snippet line", min: 1, max: 8 },
      { key: "end_line", label: "To snippet line", min: 1, max: 8 },
      {
        key: "body",
        label: "What would you change?",
        min: 2,
        max: 5000,
        multiline: true,
      },
    ];
  if (form.kind === "report")
    return [
      {
        key: "reason",
        label: "Reason for reporting",
        min: 5,
        max: 1000,
        multiline: true,
      },
    ];
  return [
    {
      key: "body",
      label: form.kind === "edit" ? "Edit your text" : "Your reply",
      min: 2,
      max: form.feedback ? 5000 : 10000,
      multiline: true,
    },
  ];
}
function TextLine({ text, width, color, bold = false }) {
  const colors = useTheme();
  return h(
    Text,
    { color: color || colors.text, bold, wrap: "truncate" },
    clip(text, width),
  );
}
function FrameRows({ rows, width, height, offset = 0 }) {
  const colors = useTheme();
  return h(
    Box,
    { flexDirection: "column", height, overflow: "hidden" },
    ...rows.slice(offset, offset + height).map((row, i) =>
      row.spans
        ? h(
            Text,
            {
              key: i,
              color: row.color || colors.text,
              bold: row.bold,
              wrap: "truncate",
            },
            ...row.spans.map((span, n) =>
              h(
                Text,
                { key: n, color: span.color, bold: span.bold || row.bold },
                span.text,
              ),
            ),
          )
        : h(TextLine, {
            key: i,
            text: typeof row === "string" ? row : row.text,
            width,
            color: row.color || colors.text,
            bold: row.bold || false,
          }),
    ),
  );
}
function InputText({ value, cursor, width, height = 1 }) {
  const colors = useTheme();
  const result = cursorLines(value, cursor, width),
    start = Math.max(0, result.line - height + 1);
  return h(
    Box,
    { flexDirection: "column", height, overflow: "hidden" },
    ...result.lines.slice(start, start + height).map((line, index) => {
      const [before, ...rest] = line.split("▏");
      return h(
        Text,
        { key: index, color: colors.text, wrap: "truncate" },
        before,
        rest.length ? h(Text, { color: colors.purple, bold: true }, "▏") : null,
        rest.join("▏"),
      );
    }),
  );
}
function FormView({ form, active, cursor, width, height, navFocus }) {
  const colors = useTheme();
  const fields = fieldsFor(form),
    rows = [];
  const steps = formSteps(form, fields),
    stepIndex = stepAt(steps, active, fields.length),
    step = steps[stepIndex];
  const guidance = fieldGuidance(navFocus ? null : fields[active], {
    wizard: !!step,
    project: form.kind === "catalog" && form.entity === "project",
  });
  const helpRows =
      form.kind === "appearance" ? 0 : height >= 8 ? 2 : height >= 5 ? 1 : 0,
    navRows = step && height >= 3 ? 1 : 0;
  const editorHeight = Math.max(1, height - helpRows - navRows);
  let selectedLine = rows.length;
  fields.forEach((field, index) => {
    if (step && !step.indexes.includes(index)) return;
    if (index === active) selectedLine = rows.length;
    rows.push({
      text: (index === active && !navFocus ? "› " : "  ") + field.label,
      color: index === active && !navFocus ? colors.purple : colors.muted,
      bold: index === active && !navFocus,
    });
    if (field.options) {
      const option = field.options.find(
        (item) => String(item[0]) === String(form.values[field.key] || ""),
      );
      rows.push({
        text:
          "  ‹ " + (option?.[1] || form.values[field.key] || "Choose") + " ›",
        color: index === active && !navFocus ? colors.blue : colors.text,
      });
    } else {
      const value = form.values[field.key] || "";
      const text =
        index === active && !navFocus
          ? cursorLines(value, cursor, width - 3).lines
          : wrap(value || "…", width - 3);
      const caretLine =
        index === active
          ? Math.max(
              0,
              text.findIndex((line) => line.includes("▏")),
            )
          : 0;
      const visible = field.multiline
          ? Math.min(
              index === active
                ? Math.max(1, Math.min(12, editorHeight - 2))
                : 3,
              Math.max(2, text.length),
            )
          : 1,
        start = index === active ? Math.max(0, caretLine - visible + 1) : 0;
      rows.push(
        ...text.slice(start, start + visible).map((line) => ({
          text: "  " + line,
          color: index === active && !navFocus ? colors.text : colors.muted,
        })),
      );
    }
    rows.push("");
  });
  if (active === fields.length) selectedLine = rows.length;
  if (!step)
    rows.push({
      text:
        (active === fields.length ? "› " : "  ") +
        (form.kind === "appearance"
          ? "Save appearance  [Ctrl+S]"
          : form.kind === "catalogFilter"
            ? "Apply filters  [Ctrl+S]"
            : form.kind === "calendar"
              ? "Export calendar  [Ctrl+S]"
              : "Preview publication  [Ctrl+S]"),
      color: colors.blue,
      bold: true,
    });
  const offset = Math.max(
    0,
    Math.min(
      selectedLine - (editorHeight >= 4 ? 1 : 0),
      rows.length - editorHeight,
    ),
  );
  return h(
    Box,
    { flexDirection: "column", height, overflow: "hidden" },
    h(FrameRows, { rows, width, height: editorHeight, offset }),
    helpRows === 2
      ? h(TextLine, {
          text:
            guidance.detail ||
            (form.kind === "catalogFilter"
              ? "Ctrl+S applies these filters."
              : form.kind === "calendar"
                ? "Ctrl+S exports a new calendar file."
                : "Ctrl+S opens a preview; publishing requires separate confirmation."),
          width,
          color: colors.muted,
        })
      : null,
    helpRows
      ? h(TextLine, { text: guidance.keys, width, color: colors.muted })
      : null,
    navRows
      ? h(
          Text,
          { wrap: "truncate" },
          ...stepControls(steps, stepIndex).map((control) =>
            h(
              Text,
              {
                key: control.id,
                color: !control.enabled
                  ? colors.muted
                  : navFocus === control.id
                    ? colors.blue
                    : colors.purple,
                bold: navFocus === control.id,
                dimColor: !control.enabled,
                backgroundColor:
                  navFocus === control.id ? colors.selected : undefined,
              },
              ` ${navFocus === control.id ? "›" : " "}[ ${control.label} ] `,
            ),
          ),
        )
      : null,
  );
}
function listRows(route, data, index, width, colors, density = "comfortable") {
  const items = data.items || [];
  return items.flatMap((item, i) => {
    let title = item.title || item.name || "",
      meta = "",
      body = "";
    if (route.view === "projects") {
      title = item.name;
      meta = `${item.stage} · #${item.topic} · ${item.founder_name}`;
      body = item.tagline || item.description;
    } else if (route.view === "events") {
      title = (item.cancelled_at ? "[Cancelled] " : "") + item.title;
      meta = `${stamp(item.start_at)} · ${item.organizer_name}`;
      body = item.description;
    } else if (route.view === "drafts") {
      title = item.form.values.title || item.form.title;
      meta = "Local draft · " + stamp(item.savedAt);
      body =
        item.form.values.body ||
        item.form.values.description ||
        item.form.values.file ||
        "";
    } else if (route.view === "inbox") {
      title =
        item.actor_name +
        " · " +
        ({
          feedback_reply: "code feedback",
          feedback_resolved: "resolved your feedback",
          feedback_reopened: "reopened your feedback",
          reply: "new reply",
          mention: "mentioned you",
        }[item.type] || item.type.replaceAll("_", " "));
      meta = item.post_title || "Event update";
      body = stamp(item.created) + (item.read_at ? "" : " · unread");
    } else if (route.view === "communities") {
      meta =
        (item.is_member ? "Member" : "Private community") +
        " · " +
        item.members +
        " members";
      body = item.description;
    } else if (route.view === "devices") {
      meta = "Connected " + stamp(item.created);
      body = "Expires " + stamp(item.expires);
    } else if (route.view === "post" && route.tab === "feedback") {
      title = `Lines ${item.start_line}–${item.end_line} · ${item.resolved ? "resolved" : "open"}${item.outdated ? " · earlier snippet" : ""}`;
      meta = item.name;
      body = item.deleted_at ? "[deleted feedback]" : item.body;
    } else if (
      route.view === "feedback" ||
      route.view === "thread" ||
      (route.view === "post" && route.tab === "replies")
    ) {
      title =
        item.name +
        (item.entryType === "note"
          ? " · original remark"
          : item.entryType === "parent"
            ? " · parent reply"
            : " · reply #" + item.id) +
        (data.post?.accepted_reply_id === item.id
          ? " · accepted solution"
          : "");
      meta =
        stamp(item.created) +
        ((item.edited_at || item.updated_at) && !item.deleted_at
          ? " · edited"
          : "");
      body = item.deleted_at ? "[deleted — discussion preserved]" : item.body;
    } else {
      meta = [
        item.community_name || item.kind || item.type,
        item.topic ? "#" + item.topic : "",
        item.name || "",
      ]
        .filter(Boolean)
        .join(" · ");
      body = item.excerpt || item.body || "";
    }
    const selected = i === index;
    return [
      {
        text: (selected ? "▸ " : "  ") + clip(title, width - 3),
        color: selected ? colors.blue : colors.text,
        bold: selected,
        selected,
      },
      { text: "  " + clip(meta, width - 3), color: colors.muted, selected },
      {
        text: "  " + clip(body || " ", width - 3),
        color: selected ? colors.text : colors.muted,
        selected,
      },
      ...(density === "compact"
        ? []
        : [
            {
              text: "  " + "─".repeat(Math.max(0, width - 4)),
              color: colors.line,
            },
          ]),
    ];
  });
}
function documentRows(route, data, width, colors) {
  if (route.view === "project" || route.view === "event")
    return markdownRows(catalogDocument(route, data), width, colors);
  if (route.view !== "post" || (route.tab && route.tab !== "overview"))
    return contentLines(route, data).flatMap((line) => wrap(line, width));
  const post = data?.post;
  if (!post) return [];
  const rows = markdownRows(post.body || "", width, colors);
  if (post.review_focus)
    rows.push(
      { text: "" },
      { text: "REVIEW FOCUS", color: colors.purple, bold: true },
      ...markdownRows(post.review_focus, width, colors),
    );
  if (post.code) {
    // Pick a fence longer than any backtick run in the snippet.
    const fence = "`".repeat(
      Math.max(
        3,
        ...(post.code.match(/`+/g) || []).map((run) => run.length + 1),
      ),
    );
    rows.push(
      { text: "" },
      ...markdownRows(fence + "\n" + post.code + "\n" + fence, width, colors),
    );
  }
  if (post.links?.length)
    rows.push(
      { text: "LINKS", bold: true },
      ...post.links.flatMap((link) =>
        wrap(link.label + " · " + link.url, width),
      ),
    );
  if (post.archived_at || post.locked_at)
    rows.push({
      text: "Replies are paused for this conversation.",
      color: colors.muted,
    });
  return rows;
}
function AppearanceView({ form, active, cursor, width, height }) {
  const c = useTheme(),
    wide = width >= 100;
  return h(
    Box,
    { height, overflow: "hidden", gap: wide ? 2 : 0 },
    h(
      Box,
      { width: wide ? width - 36 : width, flexDirection: "column" },
      h(FormView, {
        form,
        active,
        cursor,
        width: wide ? width - 36 : width,
        height,
      }),
    ),
    wide
      ? h(
          Box,
          {
            width: 34,
            height,
            borderStyle: c.frame,
            borderColor: c.line,
            paddingX: 1,
            flexDirection: "column",
            overflow: "hidden",
          },
          h(Text, { color: c.purple, bold: true }, "LIVE PREVIEW"),
          h(Text, { color: c.muted }, "Only this terminal changes."),
          h(Text, null, " "),
          h(
            Text,
            { color: c.text, bold: true },
            "A good conversation starts here",
          ),
          h(
            Text,
            { color: c.blue, backgroundColor: c.selected },
            "▸ Your selected conversation",
          ),
          h(Text, { color: c.muted }, "Ada · code review · just now"),
          h(Text, { color: c.green }, "+ ship with confidence"),
          h(Text, { color: c.red }, "− leave the guesswork behind"),
          h(Text, null, " "),
          h(Text, { color: c.purple }, "← → change · Tab next"),
          h(Text, { color: c.text }, "Ctrl+S save · Esc cancel"),
          h(Text, { color: c.muted }, "0 restores the default preview"),
        )
      : null,
  );
}
function App({ initialConfig, flags, root, initialAppearance }) {
  const { exit, suspendTerminal } = useApp(),
    { columns, rows } = useWindowSize();
  const [appearance, setAppearance] = useState(initialAppearance.settings);
  const [config, setConfig] = useState(initialConfig),
    [phase, setPhase] = useState(
      initialConfig && !flags.initialLogin ? "checking" : "auth",
    ),
    [user, setUser] = useState(null),
    [device, setDevice] = useState(null),
    [authVersion, setAuthVersion] = useState(0),
    [booting, setBooting] = useState(true);
  const [route, setRoute] = useState({ view: "feed", page: 1 }),
    [data, setData] = useState(null),
    [loading, setLoading] = useState(false),
    [refresh, setRefresh] = useState(0),
    [index, setIndex] = useState(0),
    [scroll, setScroll] = useState(0);
  const [focus, setFocus] = useState("content"),
    [navIndex, setNavIndex] = useState(1),
    [command, setCommand] = useState(""),
    [commandCursor, setCommandCursor] = useState(0),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(initialAppearance.warning || "");
  const [form, setForm] = useState(null),
    [field, setField] = useState(0),
    [formNav, setFormNav] = useState(null),
    [cursor, setCursor] = useState(0),
    [preview, setPreview] = useState(null),
    [dialog, setDialog] = useState(null),
    [yes, setYes] = useState(false),
    [pending, setPending] = useState(false),
    [tick, setTick] = useState(0),
    [reading, setReading] = useState(null),
    [picker, setPicker] = useState(null),
    [draftSaved, setDraftSaved] = useState(false),
    [actionIndex, setActionIndex] = useState(null),
    [palette, setPalette] = useState(null),
    [readerFind, setReaderFind] = useState({
      query: "",
      cursor: 0,
      editing: false,
    }),
    [reviewFocus, setReviewFocus] = useState("notes"),
    [reviewLine, setReviewLine] = useState(0),
    [reviewAnchor, setReviewAnchor] = useState(null),
    [reviewHorizontal, setReviewHorizontal] = useState(0),
    [live, setLive] = useState(!flags["no-live"]),
    [unread, setUnread] = useState(0),
    [liveStatus, setLiveStatus] = useState("");
  const readingMemory = useRef(new ReadingMemory()),
    readingReturn = useRef(0);
  const activity = useRef(Date.now()),
    liveView = useRef(null),
    notificationGeneration = useRef(0);
  const cache = useRef(new PageCache()),
    history = useRef([]),
    restoreSelection = useRef(null),
    seenSnippet = useRef(null),
    busy = useRef(false),
    alive = useRef(true),
    authController = useRef(null),
    draftQueue = useRef(Promise.resolve()),
    draftTimer = useRef(null),
    draftGeneration = useRef(0);
  const drafts = useMemo(
    () =>
      config && user
        ? new DraftStore({ origin: config.origin, userId: user.id, root })
        : null,
    [config?.origin, user?.id, root],
  );
  const api = useMemo(
    () => (config ? client(config.origin, config.token) : null),
    [config?.origin, config?.token],
  );
  const effectiveAppearance =
    form?.kind === "appearance" ? normalizeAppearance(form.values) : appearance;
  const colors = useMemo(
      () => themeFor(effectiveAppearance),
      [effectiveAppearance],
    ),
    stride = effectiveAppearance.density === "compact" ? 3 : 4;
  const width = Math.max(1, columns),
    height = Math.max(1, rows - 1),
    compact = width < 90 || effectiveAppearance.sidebar === "hidden",
    sidebar = compact ? 0 : 25,
    bodyHeight = Math.max(1, height - 9),
    contentWidth = Math.max(1, width - sidebar - 6),
    contentHeight = Math.max(1, bodyHeight - 6);
  const key = JSON.stringify(route),
    current = data?.key === key ? data : null;
  const selected = current?.items?.[index];
  const reviewing =
    !!current?.post?.code &&
    (route.view === "feedback" ||
      (route.view === "post" && route.tab === "feedback"));
  const actions = contextActions({
    route,
    data: current,
    selected,
    user,
    live,
  });
  liveView.current = {
    route,
    key,
    current,
    index,
    blocked: !!(
      form ||
      preview ||
      picker ||
      dialog ||
      reading ||
      actionIndex !== null ||
      palette ||
      loading ||
      pending ||
      focus === "prompt"
    ),
  };
  useEffect(() => {
    if (phase !== "ready" || !api || !live) return;
    return liveLoop(
      async (signal) => {
        const generation = notificationGeneration.current;
        const count = await api("/notifications?limit=1", { signal });
        if (signal.aborted || generation !== notificationGeneration.current)
          return;
        setUnread(count.unread_count || 0);
        const before = liveView.current;
        if (
          before.blocked ||
          !["inbox", "post", "feedback", "thread"].includes(before.route.view)
        ) {
          setLiveStatus("");
          return;
        }
        const next = await loadPage(api, before.route, signal);
        const after = liveView.current;
        if (
          signal.aborted ||
          after.key !== before.key ||
          after.current !== before.current ||
          after.blocked
        )
          return;
        cache.current.set(before.key, next);
        setIndex(
          anchoredIndex(after.current?.items, next.items || [], after.index),
        );
        setData({ ...next, key: before.key });
        setLiveStatus("");
      },
      {
        activity: () => activity.current,
        onError: (e) => {
          setLiveStatus(
            e.status === 401 || e.status === 403
              ? "Live updates paused: sign in again. Local draft preserved."
              : "Live updates delayed · automatic retry",
          );
          if (e.status === 401 || e.status === 403) setLive(false);
        },
      },
    );
  }, [api, phase, live]);
  useEffect(() => {
    if (current?.unread_count !== undefined) setUnread(current.unread_count);
  }, [current]);
  useEffect(() => {
    const post = current?.post;
    if (!post?.code) return;
    if (
      seenSnippet.current?.id === post.id &&
      seenSnippet.current.code !== post.code
    ) {
      setReviewLine(0);
      setReviewAnchor(null);
      setReviewHorizontal(0);
    } else
      setReviewLine((line) => Math.min(line, post.code.split("\n").length - 1));
    seenSnippet.current = { id: post.id, code: post.code };
  }, [current?.post?.id, current?.post?.code]);
  const resetAccount = () => {
    cache.current.clear();
    history.current = [];
    readingMemory.current.clear();
    setPalette(null);
    setReaderFind({ query: "", cursor: 0, editing: false });
    setData(null);
    setForm(null);
    setPicker(null);
    setPreview(null);
    setDevice(null);
    setUser(null);
    setBooting(true);
    setReading(null);
    setActionIndex(null);
    setUnread(0);
    setLiveStatus("");
    notificationGeneration.current++;
    setRoute({ view: "feed", page: 1 });
    setError("");
  };
  function fail(e) {
    if (!alive.current) return;
    if (e.status === 401 && form) {
      setLive(false);
      setError(problemMessage(e));
    } else if (e.status === 401) {
      resetAccount();
      setPhase("auth");
      setConfig(null);
      setError(
        "Your session expired or was revoked. Press Enter to reconnect.",
      );
    } else setError(problemMessage(e));
  }
  function navigate(next, { replace = false } = {}) {
    setBooting(false);
    if (!replace)
      history.current.push({
        route,
        label: current?.title || labelOf(route),
        index,
        scroll,
        selectedId: selected?.id,
        entryType: selected?.entryType,
        reviewFocus,
        reviewLine,
        reviewAnchor,
        reviewHorizontal,
      });
    restoreSelection.current = {
      key: JSON.stringify(next),
      selectedId: next.targetReply,
      entryType:
        next.view === "feedback" && next.targetReply
          ? "feedbackReply"
          : undefined,
      index: 0,
    };
    if (history.current.length > 30) history.current.shift();
    setReading(null);
    setReviewLine(0);
    setReviewAnchor(null);
    setReviewHorizontal(0);
    if (next.view === "feedback") setReviewFocus("notes");
    setRoute(next);
    setIndex(0);
    setScroll(0);
    setFocus("content");
    setError("");
    setNotice("");
  }
  function back() {
    const previous = history.current.pop();
    if (previous) {
      restoreSelection.current = {
        ...previous,
        key: JSON.stringify(previous.route),
      };
      setReading(null);
      setReviewFocus(previous.reviewFocus);
      setReviewLine(previous.reviewLine);
      setReviewAnchor(previous.reviewAnchor);
      setReviewHorizontal(previous.reviewHorizontal);
      setRoute(previous.route);
      setIndex(previous.index);
      setScroll(previous.scroll);
      setFocus("content");
      setError("");
    } else setFocus("nav");
  }
  function readerKey(item) {
    const kind =
      item.entryType === "feedbackReply"
        ? "feedbackReply"
        : item.entryType === "note" ||
            route.view === "feedback" ||
            route.tab === "feedback"
          ? "feedback"
          : "reply";
    return `${config?.origin}:${user?.id}:${current?.post?.id}:${kind}:${item.id}:${item.revision || ""}`;
  }
  const readerRows = useMemo(
    () =>
      reading
        ? markdownRows(
            reading.deleted_at
              ? "[deleted — discussion preserved]"
              : reading.body || "",
            contentWidth,
            colors,
          )
        : [],
    [reading, contentWidth, colors],
  );
  const readerHeight = Math.max(1, contentHeight - 2);
  const readerHits = readingMatches(readerRows, readerFind.query);
  useEffect(() => {
    if (reading)
      readingMemory.current.save(
        readerKey(reading),
        Math.min(scroll, Math.max(0, readerRows.length - readerHeight)),
        readerRows,
      );
  }, [reading, scroll, readerRows, readerHeight]);
  function readItem(item) {
    if (!reading) readingReturn.current = scroll;
    const lines = markdownRows(
      item.deleted_at ? "[deleted — discussion preserved]" : item.body || "",
      contentWidth,
      colors,
    );
    setScroll(
      readingMemory.current.restore(readerKey(item), lines, readerHeight),
    );
    setReaderFind({ query: "", cursor: 0, editing: false });
    setReading(item);
  }
  function closeReading() {
    setReading(null);
    setScroll(readingReturn.current);
    setReaderFind({ query: "", cursor: 0, editing: false });
  }
  function moveStep(direction) {
    setFormNav(null);
    const fields = fieldsFor(form),
      steps = formSteps(form, fields),
      currentStep = stepAt(steps, field, fields.length);
    const next = currentStep + direction;
    if (direction > 0)
      for (const i of steps[currentStep]?.indexes || []) {
        const f = fields[i],
          value = form.values[f.key] || "";
        if (f.min && value.trim().length < f.min) {
          setField(i);
          setCursor(graphemes(value).length);
          setError(f.label + " needs at least " + f.min + " characters.");
          return;
        }
      }
    if (next >= steps.length) {
      prepare();
      return;
    }
    if (next < 0) return;
    setField(steps[next].indexes[0]);
    setCursor(
      graphemes(form.values[fields[steps[next].indexes[0]].key] || "").length,
    );
    setError("");
  }
  const activeSteps = form ? formSteps(form, fieldsFor(form)) : [],
    activeStep = form ? stepAt(activeSteps, field, fieldsFor(form).length) : 0;
  const quickItems = palette
    ? paletteItems({
        query: palette.query,
        actions,
        history: history.current,
        route,
      })
    : [];
  function chooseQuick(item) {
    if (!item) return;
    setPalette(null);
    if (item.route) {
      navigate(item.route);
      return;
    }
    if (item.id.startsWith("action:")) {
      runAction(item.id.slice(7));
      return;
    }
    if (item.id.startsWith("nav:")) {
      chooseNav(Number(item.id.slice(4)));
      return;
    }
    if (item.id.startsWith("create:")) {
      const kind = item.id.slice(7);
      if (["project", "event"].includes(kind)) composeCatalog(kind);
      else composePublication(kind);
      return;
    }
    if (item.id === "command") {
      runCommand(item.command);
      return;
    }
    if (item.id === "search")
      navigate({ view: "search", query: item.query, page: 1 });
  }
  async function task(work) {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError("");
    try {
      return await work();
    } catch (e) {
      fail(e);
    } finally {
      busy.current = false;
      if (alive.current) setPending(false);
    }
  }
  function invalidate(message) {
    cache.current.clear();
    setRefresh((n) => n + 1);
    if (message) setNotice(message);
  }
  function queueDraft(work) {
    const result = draftQueue.current.catch(() => {}).then(work);
    draftQueue.current = result;
    return result;
  }
  async function forgetDraft(value) {
    clearTimeout(draftTimer.current);
    cache.current.clear();
    if (drafts && value)
      await queueDraft(() => drafts.remove(draftIdentity(value)));
  }
  async function restoreDraft(item) {
    if (
      item.form.kind === "catalog" &&
      item.form.catalogProgress?.completedId
    ) {
      navigate({
        view: item.form.entity,
        id: item.form.catalogProgress.completedId,
        page: 1,
      });
      setNotice(
        "This draft was already published. Opened the existing publication.",
      );
      return;
    }
    await task(async () => {
      const saved = await drafts.read(item.id),
        next = { ...saved.form, draftId: item.id };
      if (next.kind === "publication") {
        const [topics, communities] = await Promise.all([
          api("/topics"),
          api("/communities?joined=1&limit=50"),
        ]);
        next.topics = itemsOf(topics).map((t) => [t.id, t.name]);
        next.audiences = [
          ["", "Public feed · everyone"],
          ...itemsOf(communities).map((c) => [c.id, "Private · " + c.name]),
        ];
        if (
          next.values.community_id &&
          !next.audiences.some(
            (c) => String(c[0]) === String(next.values.community_id),
          )
        ) {
          let space;
          try {
            space = await api(
              "/communities/" + encodeURIComponent(next.values.community_id),
            );
          } catch (e) {
            if (![403, 404].includes(e.status)) throw e;
          }
          if (space?.is_member)
            next.audiences.push([space.id, "Private · " + space.name]);
          else {
            next.unavailableAudience = next.values.community_id;
            next.audiences.push([
              next.values.community_id,
              "Unavailable private audience · choose another",
            ]);
          }
        }
      }
      if (next.kind === "catalog")
        next.topics = itemsOf(await api("/topics")).map((t) => [t.id, t.name]);
      openForm(next);
      setNotice(
        "Restored local draft. Check the code selection before publishing.",
      );
    });
  }
  useEffect(() => {
    const generation = ++draftGeneration.current;
    if (!drafts || !form) return;
    setDraftSaved(false);
    draftTimer.current = setTimeout(() => {
      queueDraft(() => drafts.save(form))
        .then((id) => {
          if (id && alive.current && generation === draftGeneration.current)
            setDraftSaved(true);
        })
        .catch((e) => {
          if (alive.current)
            setError("Could not save local draft: " + clean(e.message));
        });
    }, 450);
    return () => clearTimeout(draftTimer.current);
  }, [drafts, form]);
  function askConfirm(title, description, action) {
    setYes(false);
    setDialog({ title, description, action });
  }
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      authController.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (
      effectiveAppearance.motion === "reduced" ||
      (!loading && !pending && phase !== "pending")
    )
      return;
    const timer = setInterval(() => setTick((v) => (v + 1) % 4), 180);
    return () => clearInterval(timer);
  }, [loading, pending, phase, effectiveAppearance.motion]);
  useEffect(() => {
    if (phase !== "checking" || !api) return;
    const controller = new AbortController();
    api("/me", { signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;
        if (!result.user) {
          setPhase("auth");
          return;
        }
        setUser(result.user);
        setPhase("ready");
      })
      .catch((e) => {
        if (!controller.signal.aborted) fail(e);
      });
    return () => controller.abort();
  }, [phase, api, authVersion]);
  useEffect(() => {
    if (phase !== "ready" || !api || form || route.view === "help") return;
    let active = true;
    const controller = new AbortController(),
      cached = cache.current.get(key);
    setData(cached ? { ...cached, key } : null);
    setLoading(!cached);
    if (cached && restoreSelection.current?.key === key) {
      const saved = restoreSelection.current;
      const found = cached.items?.findIndex(
        (item) =>
          item.id === saved.selectedId &&
          (saved.entryType === undefined || item.entryType === saved.entryType),
      );
      setIndex(
        found >= 0
          ? found
          : Math.min(
              saved.index || 0,
              Math.max(0, (cached.items?.length || 0) - 1),
            ),
      );
      restoreSelection.current = null;
    }
    setError("");
    if (!cached)
      (route.view === "drafts"
        ? drafts.list().then((items) => ({
            items,
            title: "Local drafts",
            subtitle:
              "Private to this account and project · Enter restore · D delete",
          }))
        : loadPage(api, route, controller.signal)
      )
        .then((result) => {
          if (!active) return;
          cache.current.set(key, result);
          setData({ ...result, key });
          const saved = restoreSelection.current;
          if (saved?.key === key) {
            const found = result.items?.findIndex(
              (item) =>
                item.id === saved.selectedId &&
                (saved.entryType === undefined ||
                  item.entryType === saved.entryType),
            );
            setIndex(
              found >= 0
                ? found
                : Math.min(
                    saved.index || 0,
                    Math.max(0, (result.items?.length || 0) - 1),
                  ),
            );
            restoreSelection.current = null;
          } else
            setIndex((i) =>
              Math.min(i, Math.max(0, (result.items?.length || 0) - 1)),
            );
        })
        .catch((e) => {
          if (active) fail(e);
        })
        .finally(() => {
          if (active) {
            setLoading(false);
            setBooting(false);
          }
        });
    return () => {
      active = false;
      controller.abort();
    };
  }, [phase, api, key, refresh, !!form]);
  useEffect(() => {
    if (phase !== "pending" || !device) return;
    const controller = new AbortController();
    authController.current = controller;
    (async () => {
      try {
        const anon = client(device.origin);
        const until = Date.now() + 600000;
        while (Date.now() < until && !controller.signal.aborted) {
          await delay(5000, null, { signal: controller.signal });
          const result = await anon("/cli/token", {
            method: "POST",
            body: { device_code: device.device_code },
            signal: controller.signal,
          });
          if (result.pending) continue;
          const saved = {
            origin: device.origin,
            token: result.access_token,
            expires_at: result.expires_at,
          };
          await saveConfig(saved);
          if (controller.signal.aborted) return;
          resetAccount();
          setConfig(saved);
          setBooting(true);
          setPhase("checking");
          setNotice("Terminal connected.");
          return;
        }
        if (!controller.signal.aborted)
          throw Error(
            "Connection request expired. Press Enter to start again.",
          );
      } catch (e) {
        if (!controller.signal.aborted) {
          setError(clean(e.message));
          setPhase("auth");
          setDevice(null);
        }
      }
    })();
    return () => controller.abort();
  }, [phase, device, authVersion]);
  async function connect() {
    await task(async () => {
      resetAccount();
      const origin = originOf(
        flags.host || initialConfig?.origin || "https://devdevian.vercel.app",
      );
      const result = await client(origin)("/cli/device", {
        method: "POST",
        body: { name: flags.name || "Devdevian TUI · " + hostname() },
      });
      if (new URL(result.verification_uri).origin !== origin)
        throw Error("Unexpected sign-in address.");
      setDevice({ ...result, origin });
      setPhase("pending");
      setAuthVersion((v) => v + 1);
      if (!flags["no-open"]) openBrowser(result.verification_uri);
    });
  }
  async function chooseNav(i) {
    const name = navigation[i]?.[0];
    setNavIndex(i);
    if (name === "appearance") return openAppearance();
    if (name === "ask" || name === "review")
      return composePublication(name === "review" ? "review" : "question");
    if (name === "open")
      return openForm({
        kind: "open",
        title: "Open a conversation",
        values: { id: "" },
      });
    navigate({ view: name, page: 1 });
    if (name === "search") {
      setFocus("prompt");
      setCommand("");
      setCommandCursor(0);
    }
  }
  async function composeCatalog(entity, editing = false) {
    await task(async () => {
      const row = editing ? await api(`/${entity}s/${route.id}`) : {};
      if (editing && row.user_id !== user.id)
        throw Error("Only the owner can edit this publication.");
      const topics = itemsOf(await api("/topics")).map((t) => [t.id, t.name]);
      const values = initialCatalog(entity, row);
      if (!topics.some(([id]) => id === values.topic))
        values.topic = topics[0]?.[0] || "web";
      openForm({
        kind: "catalog",
        entity,
        entityId: row.id,
        revision: row.revision,
        existing: row,
        title: (editing ? "Edit your " : "Create a ") + entity,
        topics,
        values,
      });
    });
  }
  async function catalogFilter() {
    await task(async () => {
      const entity = route.view === "projects" ? "project" : "event";
      const topics = itemsOf(await api("/topics")).map((t) => [t.id, t.name]);
      openForm({
        kind: "catalogFilter",
        entity,
        title: "Filter " + route.view,
        topics,
        values: {
          query: route.query || "",
          topic: route.topic || "",
          stage: route.stage || "",
          author: route.author || "",
          status: route.status || "",
          date: route.date || "",
          timezone: route.timezone || viewerZone(),
          mine: route.mine || "",
          order: route.order || (entity === "project" ? "newest" : "earliest"),
        },
      });
    });
  }
  function catalogAction(id) {
    const row = current?.project || current?.event;
    if (!row) return;
    if (id === "edit") {
      composeCatalog(route.view, true);
      return;
    }
    if (id === "conversation") {
      navigate({ view: "post", id: row.post_id, tab: "overview", page: 1 });
      return;
    }
    if (id === "calendar") {
      openForm({
        kind: "calendar",
        eventId: row.id,
        title: "Export calendar",
        values: { path: `devdevian-event-${row.id}.ics` },
      });
      return;
    }
    if (id === "attend") {
      const attending = !row.viewer_attending;
      askConfirm(
        attending ? "Attend this event?" : "Leave this event?",
        row.title,
        () =>
          task(async () => {
            await api(`/events/${row.id}/attendance`, {
              method: "PUT",
              body: { attending },
            });
            invalidate(
              attending
                ? "You're attending. Your browser account sees the same update."
                : "You left the event.",
            );
          }),
      );
      return;
    }
    if (id === "lifecycle") {
      if (row.user_id !== user.id) {
        setError("Only the organizer can manage this event.");
        return;
      }
      const action = row.cancelled_at ? "restore" : "cancel";
      askConfirm(
        action === "cancel" ? "Cancel your event?" : "Restore your event?",
        "Attendees will receive the event update.",
        () =>
          task(async () => {
            await api(`/events/${row.id}/lifecycle`, {
              method: "POST",
              body: { action, revision: row.revision },
            });
            invalidate("Event updated.");
          }),
      );
      return;
    }
    const target =
      id === "website"
        ? row.url
        : id === "source"
          ? row.repo
          : id === "meeting"
            ? row.url
            : config.origin +
              (route.view === "project"
                ? "/app#post/" + row.post_id
                : "/app#events/" + row.id);
    try {
      openBrowser(webURL(target));
      setNotice("Opened in your browser.");
    } catch (error) {
      setError(error.message);
    }
  }
  function openAppearance() {
    openForm({
      kind: "appearance",
      title: "Appearance",
      values: { ...appearance },
    });
    setNotice(
      "Live preview · ← → change · Ctrl+S save · Esc cancel · 0 defaults",
    );
  }
  function openForm(next) {
    setFormNav(null);
    setNotice("");
    setBooting(false);
    setForm({
      ...next,
      draftId: next.draftId || randomBytes(32).toString("hex"),
    });
    setDraftSaved(false);
    setField(0);
    setCursor(graphemes(next.values[fieldsFor(next)[0].key] || "").length);
    setPreview(null);
    setFocus("form");
    setError("");
  }
  async function composePublication(kind = "discussion") {
    await task(async () => {
      const [topics, communities] = await Promise.all([
        api("/topics"),
        api("/communities?joined=1&limit=30"),
      ]);
      const audiences = [
        ["", "Public feed · everyone"],
        ...itemsOf(communities).map((item) => [
          item.id,
          "Private · " + item.name,
        ]),
      ];
      const audience =
        route.view === "community" && current?.community?.is_member
          ? route.id
          : "";
      openForm({
        kind: "publication",
        title:
          kind === "review" ? "Request a code review" : "Start a conversation",
        topics: itemsOf(topics).map((item) => [item.id, item.name]),
        audiences,
        values: {
          kind,
          title: "",
          topic: itemsOf(topics).some((item) => item.id === "web")
            ? "web"
            : itemsOf(topics)[0]?.id || "web",
          community_id: audience,
          body: "",
          file: "",
          lines: "",
          review_focus: "",
          demo_url: "",
        },
      });
    });
  }
  function reply() {
    const p = current?.post;
    if (!p) return;
    if (p.archived_at || p.locked_at) {
      setError("Replies are paused for this conversation.");
      return;
    }
    const feedback = route.view === "feedback",
      thread = route.view === "thread";
    openForm({
      kind: "reply",
      title: feedback
        ? "Reply to code feedback"
        : thread
          ? "Reply in this thread"
          : "Add your perspective",
      feedback,
      audience: p.community_id ? "Private community" : "Public feed",
      postId: p.id,
      url: feedback
        ? `/posts/${p.id}/code-reviews/${route.id}/replies`
        : `/posts/${p.id}/replies`,
      parentId: thread ? route.parent.id : null,
      values: { body: "" },
    });
  }
  async function externalEdit() {
    const descriptor = fieldsFor(form)[field];
    if (!descriptor?.multiline) {
      setNotice("Ctrl+E opens the editor for a multiline text field.");
      return;
    }
    const original = form;
    await task(async () => {
      clearTimeout(draftTimer.current);
      await queueDraft(() => drafts.save(original));
      let value;
      await suspendTerminal(async () => {
        value = await editExternal(original.values[descriptor.key] || "", {
          max: descriptor.max,
        });
      });
      const updated = {
        ...original,
        values: { ...original.values, [descriptor.key]: value },
      };
      setForm(updated);
      setCursor(graphemes(value).length);
      await queueDraft(() => drafts.save(updated));
      setDraftSaved(true);
      setNotice("Text returned from editor. Preview before publishing.");
    });
  }
  async function reconnect() {
    await task(async () => {
      clearTimeout(draftTimer.current);
      draftGeneration.current++;
      if (form && drafts) await queueDraft(() => drafts.save(form));
      resetAccount();
      setConfig(null);
      setPhase("auth");
      setNotice(
        "Draft saved locally. Enter reconnects; restore it from Local drafts after signing in.",
      );
    });
  }
  async function lineFeedback() {
    const p = current?.post;
    if (!p?.code) {
      setError("This review needs a published code snippet.");
      return;
    }
    if (p.archived_at || p.locked_at) {
      setError("Replies are paused.");
      return;
    }
    const note = route.view === "feedback" ? current.note : selected;
    const range = reviewing
      ? reviewFocus === "notes" && note?.start_line
        ? { start: note.start_line, end: note.end_line }
        : codeRange(reviewLine, reviewAnchor)
      : { start: 1, end: 1 };
    if (reviewing && reviewFocus === "notes" && note?.outdated) {
      setError(
        "This remark belongs to an earlier snippet. W switches to current code before adding a new remark.",
      );
      return;
    }
    if (range.end - range.start >= 50) {
      setError("Select at most 50 code lines for a remark.");
      return;
    }
    await task(async () => {
      const notes = await api(`/posts/${p.id}/code-reviews`);
      assertSnippet(p.code, notes.snippet_hash);
      openForm({
        kind: "line",
        title: "Comment on code lines",
        feedback: true,
        audience: p.community_id ? "Private community" : "Public feed",
        postId: p.id,
        snippetHash: notes.snippet_hash,
        lineCount: p.code.split("\n").length,
        values: {
          start_line: String(range.start),
          end_line: String(range.end),
          body: "",
        },
      });
    });
  }
  async function prepare() {
    if (!form) return;
    setFormNav(null);
    if (form.kind === "catalogFilter") {
      await task(async () => {
        const values = validateFilter(form.values);
        setForm(null);
        navigate({ view: form.entity + "s", ...values, page: 1 });
      });
      return;
    }
    if (form.kind === "calendar") {
      await task(async () => {
        const path = await saveCalendar(
          api,
          root,
          form.eventId,
          form.values.path,
        );
        setForm(null);
        setFocus("content");
        setNotice("Calendar saved: " + clean(path));
      });
      return;
    }
    if (form.kind === "appearance") {
      await task(async () => {
        const saved = await saveAppearance(form.values);
        setAppearance(saved);
        setForm(null);
        setFocus("content");
        setNotice(
          "Appearance saved locally. Your account and other devices are unchanged.",
        );
      });
      return;
    }
    await task(async () => {
      if (
        form.unavailableAudience &&
        String(form.values.community_id) === String(form.unavailableAudience)
      )
        throw Error(
          "Choose an available audience explicitly before publishing this draft.",
        );
      const fields = fieldsFor(form);
      for (let i = 0; i < fields.length; i++) {
        const f = fields[i],
          value = form.values[f.key] || "";
        if (f.min && value.trim().length < f.min) {
          setField(i);
          setCursor(graphemes(value).length);
          throw Error(f.label + " needs at least " + f.min + " characters.");
        }
      }
      if (form.kind === "open") {
        const id = Number(form.values.id);
        if (!Number.isSafeInteger(id) || id < 1)
          throw Error("Enter a positive conversation ID.");
        setForm(null);
        navigate({ view: "post", id, tab: "overview", page: 1 });
        return;
      }
      if (form.kind === "catalog") {
        if (form.catalogProgress?.uncertain)
          throw Error(
            "Publication outcome is unknown. Check your projects/events before creating another copy. Keep this draft for reference.",
          );
        const plan = await prepareCatalog(api, root, form);
        setPreview({
          catalog: plan,
          payload: plan.payload,
          title: form.title,
          method: form.entityId ? "PATCH" : "POST",
          url: `/${form.entity}s`,
        });
        setScroll(0);
        setYes(false);
        return;
      }
      let payload,
        method = "POST",
        url,
        title = form.title;
      if (form.kind === "publication") {
        payload = {
          kind: form.values.kind,
          title: form.values.title.trim(),
          topic: form.values.topic,
          community_id: form.values.community_id || null,
          body: form.values.body,
        };
        url = "/posts";
        if (payload.kind === "review") {
          let source = form.source;
          if (source?.kind !== "diff") {
            source = {
              kind: "file",
              path: form.values.file.replace(/^~(?=\/)/, homedir()),
            };
            if (form.values.lines) {
              const match = form.values.lines.match(/^([1-9]\d*):([1-9]\d*)$/);
              if (!match) throw Error("Use START:END for file lines.");
              source.start = Number(match[1]);
              source.end = Number(match[2]);
            }
          }
          const chosen = await reviewSource(root, source);
          payload.code = chosen.code;
          if (chosen.kind === "diff") {
            payload.body +=
              "\n\nReview source: " +
              clean(chosen.label).replace(/\n/g, " ") +
              "\nReview line numbers refer to the published patch, including its headers.";
            if (payload.body.length > 15000)
              throw Error(
                "Shorten the context to leave room for the Git diff source label.",
              );
          }
          payload.review_focus = form.values.review_focus;
        }
        if (payload.kind === "showcase")
          payload.demo_url = form.values.demo_url;
      } else if (form.kind === "community") {
        payload = {
          name: form.values.name,
          description: form.values.description,
        };
        url = "/communities";
      } else if (form.kind === "reply") {
        payload = {
          body: form.values.body,
          ...(form.parentId ? { parent_id: form.parentId } : {}),
        };
        url = form.url;
      } else if (form.kind === "line") {
        const start = Number(form.values.start_line),
          end = Number(form.values.end_line);
        if (
          !Number.isSafeInteger(start) ||
          !Number.isSafeInteger(end) ||
          start < 1 ||
          end < start ||
          end > form.lineCount ||
          end - start >= 50
        )
          throw Error("Choose up to 50 existing snippet lines.");
        payload = {
          start_line: start,
          end_line: end,
          body: form.values.body,
          snippet_hash: form.snippetHash,
        };
        url = `/posts/${form.postId}/code-reviews`;
      } else if (form.kind === "edit") {
        payload = { body: form.values.body, revision: form.revision };
        url = form.url;
        method = "PATCH";
      } else if (form.kind === "report") {
        payload = { reason: form.values.reason, reply_id: form.replyId || 0 };
        url = form.url;
      }
      setPreview({ payload, method, url, title });
      setScroll(0);
      setYes(false);
      setError("");
    });
  }
  async function publish() {
    if (!preview) return;
    await task(async () => {
      let working = form;
      const response = preview.catalog
        ? await publishCatalog(
            api,
            preview.catalog,
            form.catalogProgress,
            async (progress) => {
              working = { ...working, catalogProgress: progress };
              setForm(working);
              await queueDraft(() => drafts.save(working));
            },
          )
        : await api(preview.url, {
            method: preview.method,
            body: preview.payload,
          });
      cache.current.clear();
      let localWarning = "";
      try {
        await forgetDraft(form);
      } catch {
        localWarning =
          " Published successfully; the local draft could not be removed. Do not publish it again.";
      }
      setPreview(null);
      setForm(null);
      setScroll(0);
      if (preview.catalog)
        navigate({ view: form.entity, id: response.id, page: 1 });
      else if (preview.url === "/posts")
        navigate({ view: "post", id: response.id, tab: "overview", page: 1 });
      else if (preview.url === "/communities")
        navigate({ view: "community", id: response.id, page: 1 });
      else {
        setRefresh((v) => v + 1);
        if (form.kind === "line")
          navigate({
            view: "feedback",
            postId: form.postId,
            id: response.id,
            page: 1,
          });
      }
      setNotice("Saved. Your web account sees the same update." + localWarning);
    });
  }
  async function openSelected() {
    if (route.view === "projects" || route.view === "events") {
      if (selected)
        navigate({ view: route.view.slice(0, -1), id: selected.id, page: 1 });
      return;
    }
    if (route.view === "community" && !current?.community?.is_member) return;
    const item = selected;
    if (!item) return;
    if (route.view === "drafts") {
      await restoreDraft(item);
      return;
    }
    if (route.view === "devices") {
      askConfirm("Revoke this terminal?", item.name, () =>
        task(async () => {
          await api("/cli/sessions/" + encodeURIComponent(item.id), {
            method: "DELETE",
            body: {},
          });
          try {
            await api("/me");
            invalidate("Terminal access revoked.");
          } catch (e) {
            if (e.status === 401) {
              await removeConfig();
              resetAccount();
              setConfig(null);
              setPhase("auth");
            } else throw e;
          }
        }),
      );
      return;
    }
    if (route.view === "communities" || item.type === "community") {
      navigate({ view: "community", id: item.id, page: 1 });
      return;
    }
    if (route.view === "inbox") {
      await task(async () => {
        if (!item.read_at) {
          notificationGeneration.current++;
          await api("/notifications/" + item.id + "/read", {
            method: "PATCH",
            body: {},
          });
          setUnread((v) => Math.max(0, v - 1));
        }
        cache.current.clear();
        if (item.event_id) {
          openBrowser(
            config.origin + "/app#events/" + encodeURIComponent(item.event_id),
          );
          setNotice("Event opened in your browser.");
          return;
        }
        navigate(await notificationRoute(api, item));
      });
      return;
    }
    if (route.view === "post" && route.tab === "feedback") {
      navigate({ view: "feedback", postId: route.id, id: item.id, page: 1 });
      return;
    }
    if (route.view === "thread" && item.entryType === "parent") {
      readItem(item);
      return;
    }
    if (
      (route.view === "post" && route.tab === "replies") ||
      route.view === "thread"
    ) {
      navigate({
        view: "thread",
        postId: current.post.id,
        parent: item,
        page: 1,
      });
      return;
    }
    if (route.view === "feedback") {
      readItem(item);
      return;
    }
    navigate({
      view: "post",
      id: item.post_id || item.id,
      tab: "overview",
      page: 1,
    });
  }
  function editable() {
    if (!selected) return null;
    if (route.view === "feedback")
      return {
        row: selected,
        url:
          `/posts/${route.postId}/code-reviews/${route.id}` +
          (selected.entryType === "feedbackReply"
            ? "/replies/" + selected.id
            : ""),
        feedback: true,
      };
    if (
      route.view === "thread" ||
      (route.view === "post" && route.tab === "replies")
    )
      return { row: selected, url: "/replies/" + selected.id, feedback: false };
    if (route.view === "post" && route.tab === "feedback")
      return {
        row: selected,
        url: `/posts/${route.id}/code-reviews/${selected.id}`,
        feedback: true,
      };
    return null;
  }
  function editSelected() {
    const target = editable();
    if (!target || target.row.user_id !== user.id || target.row.deleted_at) {
      setError("Select your own existing reply or code feedback to edit.");
      return;
    }
    openForm({
      kind: "edit",
      feedback: target.feedback,
      title: "Edit your feedback",
      url: target.url,
      revision: target.row.revision,
      audience: current.post?.community_id
        ? "Private community"
        : "Public feed",
      values: { body: target.row.body },
    });
  }
  function deleteSelected() {
    if (route.view === "drafts" && selected) {
      askConfirm(
        "Delete saved draft?",
        "Only this local draft will be removed.",
        () =>
          task(async () => {
            await queueDraft(() => drafts.remove(selected.id));
            invalidate("Draft deleted.");
          }),
      );
      return;
    }
    const target = editable();
    if (!target || target.row.user_id !== user.id || target.row.deleted_at) {
      setError(
        "Select your own reply or code feedback in the Replies / Code feedback tab to delete.",
      );
      return;
    }
    askConfirm(
      target.feedback ? "Delete your feedback?" : "Delete your reply?",
      "Your text is removed. Other members’ replies are preserved." +
        (!target.feedback && current.post?.accepted_reply_id === target.row.id
          ? " Its accepted-solution mark is cleared."
          : ""),
      () =>
        task(async () => {
          await api(target.url, {
            method: "DELETE",
            body: { revision: target.row.revision },
          });
          setReading(null);
          invalidate(
            target.feedback
              ? "Feedback deleted; the discussion is preserved."
              : "Reply deleted; other members’ replies are preserved.",
          );
        }),
    );
  }
  async function resolveSelected() {
    const post = current?.post,
      note =
        route.view === "feedback"
          ? current.note
          : route.view === "post" && route.tab === "feedback"
            ? selected
            : null;
    if (!post || !note || post.user_id !== user.id || note.deleted_at) {
      setError(
        "Only the publication author can resolve existing line feedback.",
      );
      return;
    }
    await task(async () => {
      await api(`/posts/${post.id}/code-reviews/${note.id}`, {
        method: "PATCH",
        body: { revision: note.revision, resolved: !note.resolved },
      });
      invalidate(note.resolved ? "Feedback reopened." : "Feedback resolved.");
    });
  }
  function acceptSolution() {
    const post = current?.post;
    if (
      !selected ||
      selected.deleted_at ||
      !post ||
      post.user_id !== user.id ||
      !["question", "review"].includes(post.kind) ||
      !(route.view === "thread" || route.tab === "replies")
    )
      return;
    const accepted = post.accepted_reply_id === selected.id;
    askConfirm(
      accepted
        ? "Remove accepted solution?"
        : "Accept this reply as the solution?",
      "This changes the solution shown to everyone in the conversation.",
      () =>
        task(async () => {
          await api(`/posts/${post.id}/solution`, {
            method: "PATCH",
            body: { reply_id: accepted ? null : selected.id },
          });
          invalidate(accepted ? "Solution removed." : "Solution accepted.");
        }),
    );
  }
  function reportSelected() {
    const target = editable();
    if (!target?.feedback || target.row.deleted_at) {
      setError("Select an existing code remark or feedback reply to report.");
      return;
    }
    const noteId = route.view === "feedback" ? route.id : target.row.id;
    openForm({
      kind: "report",
      feedback: true,
      title: "Report selected feedback",
      url: `/posts/${current.post.id}/code-reviews/${noteId}/report`,
      replyId: target.row.entryType === "feedbackReply" ? target.row.id : 0,
      audience: "Assigned moderation team",
      values: { reason: "" },
    });
  }
  function runAction(id) {
    setActionIndex(null);
    if (id?.startsWith("catalog-")) {
      catalogAction(id.slice(8));
      return;
    }
    if (id === "read") {
      if (current?.post) {
        readItem(selected);
      } else openSelected();
    } else if (id === "reply") reply();
    else if (id === "comment") lineFeedback();
    else if (id === "edit") editSelected();
    else if (id === "delete") deleteSelected();
    else if (id === "resolve") resolveSelected();
    else if (id === "solution") acceptSolution();
    else if (id === "report") reportSelected();
    else if (id === "browser")
      openBrowser(config.origin + "/app#post/" + current.post.id);
    else if (id === "sync") invalidate("Updated.");
    else if (id === "live") {
      setLive((v) => !v);
      setLiveStatus("");
    } else if (id === "read-all")
      task(async () => {
        notificationGeneration.current++;
        await api("/notifications/read-all", {
          method: "PATCH",
          body: { through_id: current.latest_id },
        });
        setUnread(0);
        invalidate("Received notifications marked as read.");
      });
  }
  async function runCommand(override) {
    const value = (override ?? command).trim();
    if (!value) return;
    setCommand("");
    setCommandCursor(0);
    setFocus("content");
    try {
      const parsed = value.startsWith("/")
        ? parseCommand(value)
        : { command: "search", arg: value };
      if (parsed.command === "quit") {
        askQuit();
        return;
      }
      if (parsed.command === "logout") {
        askConfirm(
          "Disconnect this terminal?",
          "This revokes its access and removes the saved local token.",
          () =>
            task(async () => {
              await api("/cli/logout", { method: "POST", body: {} });
              await removeConfig();
              resetAccount();
              setConfig(null);
              setPhase("auth");
            }),
        );
        return;
      }
      if (parsed.command === "project" || parsed.command === "event") {
        navigate({ view: parsed.command, id: parsed.arg, page: 1 });
        return;
      }
      if (parsed.command === "actions") {
        setPalette({ query: "", cursor: 0, index: 0 });
        return;
      }
      if (parsed.command === "appearance") {
        openAppearance();
        return;
      }
      if (parsed.command === "open") {
        navigate({ view: "post", id: parsed.arg, tab: "overview", page: 1 });
        return;
      }
      if (parsed.command === "ask" || parsed.command === "review") {
        await composePublication(
          parsed.command === "review" ? "review" : "question",
        );
        return;
      }
      navigate({
        view: parsed.command,
        page: 1,
        ...(["search", "projects", "events"].includes(parsed.command)
          ? { query: parsed.arg }
          : {}),
      });
    } catch (e) {
      setError(e.message);
    }
  }
  function askQuit() {
    if (["appearance", "catalogFilter", "calendar"].includes(form?.kind)) {
      exit();
      return;
    }
    if (form) {
      askConfirm(
        "Leave this draft?",
        "Save this draft locally and exit? Resume it from Local drafts in this project.",
        () =>
          task(async () => {
            clearTimeout(draftTimer.current);
            if (drafts) await queueDraft(() => drafts.save(form));
            exit();
          }),
      );
    } else exit();
  }
  function changeField(next) {
    const fields = fieldsFor(form),
      steps = formSteps(form, fields),
      stepIndex = stepAt(steps, field, fields.length),
      step = steps[stepIndex];
    if (
      step &&
      !formNav &&
      ((next > field && field === step.indexes.at(-1)) ||
        (next < field && field === step.indexes[0]))
    ) {
      setFormNav(next < field && stepIndex > 0 ? "back" : "next");
      return;
    }
    const selected = (next + fields.length + 1) % (fields.length + 1);
    setField(selected);
    setCursor(
      selected < fields.length
        ? graphemes(form.values[fields[selected].key] || "").length
        : 0,
    );
  }
  useInput((input, keyEvent) => {
    activity.current = Date.now();
    if (picker) return;
    if (keyEvent.ctrl && input === "c") {
      if (dialog) {
        exit();
        return;
      }
      askQuit();
      return;
    }
    if (width < 60 || rows < 18) {
      if (input === "q" || keyEvent.escape) exit();
      return;
    }
    if (dialog) {
      if (keyEvent.escape) {
        setDialog(null);
        return;
      }
      if (keyEvent.leftArrow || keyEvent.rightArrow || keyEvent.tab)
        setYes((v) => !v);
      else if (keyEvent.return) {
        const chosen = dialog;
        setDialog(null);
        if (yes) chosen.action();
      }
      return;
    }
    if (phase !== "ready") {
      if (keyEvent.escape && phase === "pending") {
        authController.current?.abort();
        setPhase("auth");
        setDevice(null);
        return;
      }
      if (phase === "checking") {
        if (input === "q") exit();
        else if (error && (keyEvent.return || input === "r" || input === "R")) {
          setError("");
          setAuthVersion((v) => v + 1);
        }
        return;
      }
      if (input === "q") exit();
      else if (keyEvent.return && !busy.current) {
        if (phase === "pending" && device) openBrowser(device.verification_uri);
        else connect();
      }
      return;
    }
    if (busy.current) return;
    if (keyEvent.ctrl && input === "l") {
      reconnect();
      return;
    }
    if (palette) {
      if (keyEvent.escape) {
        setPalette(null);
        return;
      }
      if (keyEvent.upArrow || keyEvent.downArrow) {
        setPalette((old) => ({
          ...old,
          index: Math.max(
            0,
            Math.min(
              quickItems.length - 1,
              old.index + (keyEvent.downArrow ? 1 : -1),
            ),
          ),
        }));
        return;
      }
      if (keyEvent.return) {
        chooseQuick(quickItems[palette.index]);
        return;
      }
      const updated = editText(palette.query, palette.cursor, input, keyEvent, {
        max: 120,
      });
      setPalette({ query: updated.value, cursor: updated.cursor, index: 0 });
      return;
    }
    if (
      keyEvent.ctrl &&
      input === "k" &&
      !form &&
      !preview &&
      focus !== "prompt"
    ) {
      setActionIndex(null);
      setPalette({ query: "", cursor: 0, index: 0 });
      return;
    }
    if (actionIndex !== null) {
      if (keyEvent.escape || input === "x" || input === "X")
        setActionIndex(null);
      else if (keyEvent.upArrow) setActionIndex((v) => Math.max(0, v - 1));
      else if (keyEvent.downArrow)
        setActionIndex((v) => Math.min(actions.length - 1, v + 1));
      else if (keyEvent.return) runAction(actions[actionIndex]?.id);
      return;
    }
    if (reading) {
      const maximum = Math.max(0, readerRows.length - readerHeight);
      if (readerFind.editing) {
        if (keyEvent.escape) {
          setReaderFind((old) => ({ ...old, editing: false }));
          return;
        }
        if (keyEvent.return) {
          setReaderFind((old) => ({ ...old, editing: false }));
          if (readerHits.length)
            setScroll(readerHits.find((n) => n >= scroll) ?? readerHits[0]);
          return;
        }
        const updated = editText(
          readerFind.query,
          readerFind.cursor,
          input,
          keyEvent,
          { max: 120 },
        );
        setReaderFind({
          query: updated.value,
          cursor: updated.cursor,
          editing: true,
        });
        return;
      }
      if (input === "/") {
        setReaderFind((old) => ({ ...old, editing: true }));
        return;
      }
      if ((input === "n" || input === "N") && readerFind.query) {
        setScroll(nextReadingMatch(readerHits, scroll, input === "n" ? 1 : -1));
        return;
      }
      if (keyEvent.escape || keyEvent.return || input === " ") {
        closeReading();
        return;
      }
      if (keyEvent.home) {
        setScroll(0);
        return;
      }
      if (keyEvent.end) {
        setScroll(maximum);
        return;
      }
      if (keyEvent.upArrow || keyEvent.pageUp)
        setScroll((v) => Math.max(0, v - (keyEvent.pageUp ? readerHeight : 1)));
      else if (keyEvent.downArrow || keyEvent.pageDown)
        setScroll((v) =>
          Math.min(maximum, v + (keyEvent.pageDown ? readerHeight : 1)),
        );
      else if (input === "r") {
        closeReading();
        reply();
      } else if (input === "e" || input === "E") {
        closeReading();
        editSelected();
      } else if (input === "d" || input === "D") deleteSelected();
      return;
    }
    if (preview) {
      if (keyEvent.escape) {
        setPreview(null);
        setScroll(0);
        return;
      }
      if (keyEvent.leftArrow || keyEvent.rightArrow || keyEvent.tab)
        setYes((v) => !v);
      else if (keyEvent.return) {
        if (yes) publish();
        else {
          setPreview(null);
          setScroll(0);
        }
      } else if (keyEvent.upArrow) setScroll((v) => Math.max(0, v - 1));
      else if (keyEvent.downArrow) setScroll((v) => v + 1);
      else if (keyEvent.pageDown) setScroll((v) => v + contentHeight);
      else if (keyEvent.pageUp)
        setScroll((v) => Math.max(0, v - contentHeight));
      return;
    }
    if (form) {
      if (
        keyEvent.ctrl &&
        input === "o" &&
        form.kind === "catalog" &&
        !formNav
      ) {
        const active = fieldsFor(form)[field];
        if (["logo", "banner", "screenshots"].includes(active?.key)) {
          setPicker({ mediaKey: active.key });
          return;
        }
      }
      if (
        ["catalogFilter", "calendar"].includes(form.kind) &&
        keyEvent.escape
      ) {
        setForm(null);
        setFocus("content");
        setError("");
        return;
      }
      if (form.kind === "appearance" && keyEvent.escape) {
        setForm(null);
        setFocus("content");
        setNotice("Appearance preview cancelled. Saved preferences kept.");
        return;
      }
      if (form.kind === "appearance" && input === "0") {
        setForm((old) => ({ ...old, values: { ...defaultAppearance } }));
        setNotice("Default preview restored. Ctrl+S saves; Esc cancels.");
        return;
      }
      if (
        keyEvent.ctrl &&
        ["n", "p"].includes(input) &&
        formSteps(form, fieldsFor(form)).length
      ) {
        moveStep(input === "n" ? 1 : -1);
        return;
      }
      if (keyEvent.ctrl && input === "e" && !formNav) {
        externalEdit();
        return;
      }
      if (
        keyEvent.ctrl &&
        ["o", "g"].includes(input) &&
        form.kind === "publication" &&
        !formNav &&
        form.values.kind === "review"
      ) {
        setPicker(input === "g" ? "changes" : "files");
        return;
      }
      if (keyEvent.escape) {
        askConfirm(
          "Discard this draft?",
          "Nothing has been published. Stay to keep editing.",
          () =>
            task(async () => {
              await forgetDraft(form);
              setForm(null);
              setFocus("content");
              setError("");
            }),
        );
        return;
      }
      if (keyEvent.ctrl && input === "s") {
        prepare();
        return;
      }
      if (formNav) {
        const fields = fieldsFor(form),
          steps = formSteps(form, fields),
          i = stepAt(steps, field, fields.length),
          step = steps[i];
        if (keyEvent.return) {
          moveStep(formNav === "back" ? -1 : 1);
          return;
        }
        if (keyEvent.leftArrow || keyEvent.upArrow) {
          setFormNav(i > 0 ? "back" : "next");
          return;
        }
        if (keyEvent.rightArrow || keyEvent.downArrow) {
          setFormNav("next");
          return;
        }
        if (keyEvent.tab) {
          if (keyEvent.shift && formNav === "next" && i > 0) {
            setFormNav("back");
            return;
          }
          if (!keyEvent.shift && formNav === "back") {
            setFormNav("next");
            return;
          }
          const next = keyEvent.shift ? step.indexes.at(-1) : step.indexes[0];
          setFormNav(null);
          setField(next);
          setCursor(graphemes(form.values[fields[next].key] || "").length);
        }
        return;
      }
      if (keyEvent.tab) {
        changeField(field + (keyEvent.shift ? -1 : 1));
        return;
      }
      const fields = fieldsFor(form),
        active = fields[field];
      if (!active) {
        if (keyEvent.return) prepare();
        else if (keyEvent.upArrow) changeField(field - 1);
        return;
      }
      if (active.options) {
        if (
          keyEvent.leftArrow ||
          keyEvent.rightArrow ||
          keyEvent.upArrow ||
          keyEvent.downArrow
        ) {
          const opts = active.options,
            step = keyEvent.leftArrow || keyEvent.upArrow ? -1 : 1;
          setForm((old) => {
            const i = Math.max(
              0,
              opts.findIndex(
                (item) =>
                  String(item[0]) === String(old.values[active.key] || ""),
              ),
            );
            const next = opts[(i + step + opts.length) % opts.length];
            return next
              ? { ...old, values: { ...old.values, [active.key]: next[0] } }
              : old;
          });
        } else if (keyEvent.return) changeField(field + 1);
        return;
      }
      if (keyEvent.return && !active.multiline) {
        if (
          form.kind === "catalog" &&
          ["logo", "banner", "screenshots"].includes(active.key) &&
          !form.values[active.key]
        ) {
          setPicker({ mediaKey: active.key });
          return;
        }
        if (active.key === "file" && !form.values.file) {
          setPicker("files");
          return;
        }
        changeField(field + 1);
        return;
      }
      const updated = editText(
        form.values[active.key] || "",
        cursor,
        input,
        keyEvent,
        { multiline: active.multiline, max: active.max },
      );
      setForm((old) => ({
        ...old,
        ...(active.key === "file" ? { source: null } : {}),
        values: { ...old.values, [active.key]: updated.value },
      }));
      setCursor(updated.cursor);
      return;
    }
    if (focus === "prompt") {
      if (keyEvent.escape) {
        setFocus("content");
        return;
      }
      if (keyEvent.tab) {
        setFocus("nav");
        return;
      }
      if (keyEvent.return) {
        runCommand();
        return;
      }
      const updated = editText(command, commandCursor, input, keyEvent, {
        max: 500,
      });
      setCommand(updated.value);
      setCommandCursor(updated.cursor);
      return;
    }
    if (keyEvent.tab) {
      setFocus(focus === "nav" ? "content" : "prompt");
      return;
    }
    if (input === "/") {
      setFocus("prompt");
      setCommand("");
      setCommandCursor(0);
      return;
    }
    if (keyEvent.escape) {
      back();
      return;
    }
    if (input === "q") {
      askQuit();
      return;
    }
    if (focus === "nav") {
      if (keyEvent.upArrow)
        setNavIndex((v) => (v + navigation.length - 1) % navigation.length);
      else if (keyEvent.downArrow)
        setNavIndex((v) => (v + 1) % navigation.length);
      else if (keyEvent.return) chooseNav(navIndex);
      else if (keyEvent.rightArrow) setFocus("content");
      return;
    }
    if (input === ",") {
      openAppearance();
      return;
    }
    if (input === "x" || input === "X" || input === "?") {
      setActionIndex(0);
      return;
    }
    if ((input === "v" || input === "V") && current?.post?.code) {
      navigate({ view: "post", id: current.post.id, tab: "feedback", page: 1 });
      return;
    }
    if (reviewing && (input === "w" || input === "W")) {
      setReviewFocus((v) => (v === "code" ? "notes" : "code"));
      return;
    }
    if (
      (input === "f" || input === "F") &&
      ["projects", "events"].includes(route.view)
    ) {
      catalogFilter();
      return;
    }
    if (input === "j" && route.view === "event") {
      catalogAction("attend");
      return;
    }
    if (
      reviewing &&
      (input === "f" || input === "F") &&
      route.view === "post"
    ) {
      const filters = [undefined, "open", "resolved"];
      navigate(
        {
          ...route,
          status: filters[(filters.indexOf(route.status) + 1) % filters.length],
          page: 1,
        },
        { replace: true },
      );
      return;
    }
    if (reviewing && reviewFocus === "code") {
      if (
        keyEvent.upArrow ||
        keyEvent.downArrow ||
        keyEvent.pageUp ||
        keyEvent.pageDown
      ) {
        const delta =
          (keyEvent.upArrow || keyEvent.pageUp ? -1 : 1) *
          (keyEvent.pageUp || keyEvent.pageDown
            ? Math.max(1, contentHeight - 2)
            : 1);
        setReviewLine((v) =>
          Math.max(
            0,
            Math.min(current.post.code.split("\n").length - 1, v + delta),
          ),
        );
        return;
      }
      if (keyEvent.leftArrow || keyEvent.rightArrow) {
        setReviewHorizontal((v) =>
          Math.max(0, v + (keyEvent.leftArrow ? -8 : 8)),
        );
        return;
      }
      if (input === " ") {
        setReviewAnchor((v) => (v === null ? reviewLine : null));
        return;
      }
      if (keyEvent.return) {
        const i = current.items.findIndex(
          (n) =>
            !n.outdated &&
            !n.deleted_at &&
            reviewLine + 1 >= n.start_line &&
            reviewLine + 1 <= n.end_line,
        );
        if (i >= 0) {
          setIndex(i);
          setReviewFocus("notes");
        } else
          setNotice("No remark on this line on the current page. C adds one.");
        return;
      }
    }
    const prose =
      route.view === "help" ||
      (route.view === "post" && (!route.tab || route.tab === "overview")) ||
      (route.view === "community" && !current?.community?.is_member) ||
      ["project", "event"].includes(route.view);
    if (
      keyEvent.upArrow ||
      keyEvent.downArrow ||
      keyEvent.pageUp ||
      keyEvent.pageDown
    ) {
      const step =
          keyEvent.pageUp || keyEvent.pageDown
            ? Math.max(1, Math.floor(contentHeight / stride))
            : 1,
        delta = keyEvent.upArrow || keyEvent.pageUp ? -step : step;
      if (prose) {
        const maximum = Math.max(
          0,
          documentRows(route, current || {}, contentWidth, colors).length -
            contentHeight,
        );
        const amount =
          keyEvent.pageUp || keyEvent.pageDown
            ? Math.sign(delta) * contentHeight
            : delta;
        setScroll((v) => Math.max(0, Math.min(maximum, v + amount)));
      } else
        setIndex((v) =>
          Math.max(0, Math.min((current?.items?.length || 1) - 1, v + delta)),
        );
      return;
    }
    if ((keyEvent.leftArrow || keyEvent.rightArrow) && route.view === "post") {
      const tabs =
          current?.post?.kind === "review"
            ? ["overview", "replies", "feedback"]
            : ["overview", "replies"],
        pos = tabs.indexOf(route.tab || "overview"),
        next =
          tabs[
            (pos + (keyEvent.rightArrow ? 1 : tabs.length - 1)) % tabs.length
          ];
      navigate({ ...route, tab: next, page: 1 }, { replace: true });
      return;
    }
    if (
      input === " " &&
      selected &&
      ["post", "thread", "feedback"].includes(route.view)
    ) {
      readItem(selected);
      return;
    }
    if (keyEvent.return) {
      openSelected();
      return;
    }
    if (input === "]" || input === "[") {
      const meta = current?.pagination;
      if (meta) {
        const next = meta.page + (input === "]" ? 1 : -1);
        if (next >= 1 && next <= meta.pages)
          navigate(
            { ...route, page: next, targetReply: null },
            { replace: true },
          );
      }
      return;
    }
    if (input === "a") {
      composePublication("question");
      return;
    }
    if (input === "n") {
      if (["projects", "events"].includes(route.view)) {
        composeCatalog(route.view.slice(0, -1));
        return;
      }
      if (route.view === "communities")
        openForm({
          kind: "community",
          title: "Create a private community",
          values: { name: "", description: "" },
        });
      else composePublication("discussion");
      return;
    }
    if (input === "r") {
      if (["post", "feedback", "thread"].includes(route.view)) reply();
      else invalidate("Updated.");
      return;
    }
    if (input === "R") {
      invalidate("Updated.");
      return;
    }
    if (input === "c" || input === "C") {
      lineFeedback();
      return;
    }
    if (input === "s" || input === "S") {
      if (route.view === "thread" || route.tab === "replies") acceptSolution();
      else resolveSelected();
      return;
    }
    if (input === "e" || input === "E") {
      if (["project", "event"].includes(route.view)) {
        composeCatalog(route.view, true);
        return;
      }
      editSelected();
      return;
    }
    if (input === "d" || input === "D") {
      deleteSelected();
      return;
    }
    if (input === "o" && current?.post) {
      openBrowser(config.origin + "/app#post/" + current.post.id);
      setNotice("Opened in your browser.");
      return;
    }
    if (
      input === "j" &&
      route.view === "community" &&
      !current?.community?.is_member &&
      !current?.community?.requested
    ) {
      task(async () => {
        await api("/communities/" + encodeURIComponent(route.id) + "/request", {
          method: "POST",
          body: {},
        });
        invalidate("Access requested.");
      });
      return;
    }
    if (input === "!" && ["feedback", "post"].includes(route.view)) {
      reportSelected();
    }
  });
  const compactFieldHelp =
    form && !formNav && form.kind !== "appearance" && contentHeight < 8
      ? fieldGuidance(fieldsFor(form)[field], {
          wizard: !!activeSteps.length,
          project: form.kind === "catalog" && form.entity === "project",
        }).detail
      : "";
  const status =
    error ||
    compactFieldHelp ||
    liveStatus ||
    notice ||
    (pending
      ? "Saving…"
      : loading
        ? "Loading…"
        : "Ctrl+K quick actions · Shared account · same permissions");
  const spin =
    effectiveAppearance.motion === "reduced" ? "·" : ["◐", "◓", "◑", "◒"][tick];
  let center;
  if (width < 60 || rows < 18)
    center = h(
      Box,
      { flexDirection: "column", padding: 1 },
      h(Text, { color: colors.purple }, "DEVDEVIAN"),
      h(Text, null, "Enlarge this terminal to at least 60 × 18."),
      h(Text, null, "Q or Ctrl+C exits."),
    );
  else if (picker)
    center = h(WorkspacePicker, {
      root,
      width,
      height: bodyHeight,
      initial: picker.mediaKey ? "files" : picker,
      media: !!picker.mediaKey,
      onCancel: () => setPicker(null),
      onSelect: (source) => {
        if (picker.mediaKey) {
          const key = picker.mediaKey;
          setForm((old) => ({
            ...old,
            values: {
              ...old.values,
              [key]:
                key === "screenshots"
                  ? [
                      old.values[key] === "-" ? "" : old.values[key],
                      source.path,
                    ]
                      .filter(Boolean)
                      .join("\n")
                  : source.path,
            },
          }));
          setPicker(null);
          setNotice(
            "Image selected locally. It is uploaded only after confirmation.",
          );
          return;
        }
        setForm((old) => ({
          ...old,
          source,
          values: {
            ...old.values,
            file: source.path,
            lines:
              source.kind === "file" && source.start
                ? source.start + ":" + source.end
                : "",
          },
        }));
        setPicker(null);
        setNotice(
          source.kind === "diff"
            ? "Git changes selected. Preview before publishing."
            : "File selected. Preview before publishing.",
        );
      },
    });
  else if (phase !== "ready") {
    const statusLines =
      phase === "pending" && device
        ? [
            "Confirm this code: " + device.user_code,
            device.verification_uri,
            "Waiting for your approval...",
          ]
        : phase === "checking"
          ? error
            ? ["Connection could not be completed.", error]
            : ["Connecting to Devdevian..."]
          : [
              "Sign in with your existing Devdevian account.",
              "Google, GitHub and email sign-in stay on the website.",
            ];
    const footer =
      phase === "pending"
        ? ["Enter reopens the browser · Esc cancels"]
        : phase === "checking"
          ? [error ? "R or Enter retries · Ctrl+C exits" : "Ctrl+C exits"]
          : [
              "Enter connects this terminal through your browser.",
              "Q or Ctrl+C exits.",
            ];
    center = h(
      Box,
      {
        borderStyle: colors.frame,
        borderColor: colors.purple,
        flexDirection: "column",
        paddingX: 1,
        height: bodyHeight,
        overflow: "hidden",
      },
      h(DeviPanel, {
        width: Math.max(1, width - 4),
        height: Math.max(1, bodyHeight - 2),
        message:
          effectiveAppearance.welcome === "off"
            ? ""
            : phase === "checking"
              ? "Devi missed you."
              : "Devi saved you a seat.",
        status: statusLines,
        footer,
        show: effectiveAppearance.welcome === "on",
        animate: phase !== "auth" && !error,
        motion: effectiveAppearance.motion,
      }),
    );
  } else if (
    booting &&
    !current &&
    effectiveAppearance.welcome === "on" &&
    !error &&
    !dialog &&
    !form &&
    !picker
  ) {
    center = h(
      Box,
      {
        borderStyle: colors.frame,
        borderColor: colors.purple,
        paddingX: 1,
        height: bodyHeight,
        overflow: "hidden",
      },
      h(DeviPanel, {
        width: Math.max(1, width - 4),
        height: Math.max(1, bodyHeight - 2),
        message: "Devi missed you.",
        status: ["Loading your " + labelOf(route).toLowerCase() + "..."],
        footer: ["Ctrl+C exits"],
        motion: effectiveAppearance.motion,
        animate: true,
      }),
    );
  } else if (palette) {
    const count = Math.max(1, bodyHeight - 5),
      first = Math.max(0, palette.index - count + 1);
    center = h(
      Box,
      {
        borderStyle: colors.frame,
        borderColor: colors.purple,
        backgroundColor: colors.panel,
        flexDirection: "column",
        paddingX: 1,
        height: bodyHeight,
        overflow: "hidden",
      },
      h(TextLine, {
        text: "QUICK ACTIONS · type to filter",
        width: width - 6,
        color: colors.purple,
        bold: true,
      }),
      h(InputText, {
        value: palette.query,
        cursor: palette.cursor,
        width: width - 6,
      }),
      h(
        Box,
        { flexDirection: "column", height: count, overflow: "hidden" },
        ...quickItems.slice(first, first + count).map((item, i) =>
          h(
            Text,
            {
              key: item.id,
              wrap: "truncate",
              color: first + i === palette.index ? colors.blue : colors.text,
              backgroundColor:
                first + i === palette.index ? colors.selected : undefined,
            },
            clip(
              (first + i === palette.index ? "› " : "  ") +
                item.label +
                " · " +
                item.group,
              width - 6,
            ),
          ),
        ),
      ),
      h(TextLine, {
        text: "↑↓ choose · Enter open · Esc return · No action runs while typing",
        width: width - 6,
        color: colors.muted,
      }),
    );
  } else if (dialog) {
    center = h(
      Box,
      {
        borderStyle: colors.frame,
        borderColor: colors.purple,
        flexDirection: "column",
        paddingX: 2,
        paddingY: 1,
        height: bodyHeight,
        overflow: "hidden",
      },
      h(Text, { bold: true, color: colors.text }, dialog.title),
      h(Text, null, " "),
      h(Text, { color: colors.muted, wrap: "wrap" }, dialog.description),
      h(Text, null, " "),
      h(
        Text,
        null,
        h(
          Text,
          { color: !yes ? colors.blue : colors.muted, bold: !yes },
          "  Stay / cancel  ",
        ),
        h(
          Text,
          { color: yes ? colors.purple : colors.muted, bold: yes },
          "  Confirm  ",
        ),
      ),
      h(
        Text,
        { color: colors.muted },
        "← → choose · Enter confirm · Esc cancel",
      ),
    );
  } else {
    let body;
    if (reading) {
      const position = Math.min(
        scroll,
        Math.max(0, readerRows.length - readerHeight),
      );
      const matches = new Set(readerHits);
      body = h(
        Box,
        { flexDirection: "column", height: contentHeight, overflow: "hidden" },
        readerFind.editing
          ? h(InputText, {
              value: readerFind.query,
              cursor: readerFind.cursor,
              width: contentWidth,
            })
          : h(TextLine, {
              text: readerFind.query
                ? `Find: ${readerFind.query} · ${readerHits.length} matching lines · n next / N previous`
                : `Reply #${reading.id} · ${stamp(reading.created)} · / find in text`,
              width: contentWidth,
              color: colors.muted,
            }),
        h(FrameRows, {
          rows: readerRows.map((row, i) =>
            matches.has(i) ? { ...row, bold: true, color: colors.blue } : row,
          ),
          width: contentWidth,
          height: readerHeight,
          offset: position,
        }),
        h(TextLine, {
          text: `Lines ${Math.min(position + 1, readerRows.length)}–${Math.min(position + readerHeight, readerRows.length)} of ${readerRows.length} · Home / End · Esc returns`,
          width: contentWidth,
          color: colors.muted,
        }),
      );
    } else if (preview) {
      const payload = preview.payload,
        audience =
          form.audience ||
          (payload.community_id
            ? form.audiences?.find(
                (item) => item[0] === payload.community_id,
              )?.[1] || "Private community"
            : "Public feed · everyone");
      const raw = [
        "AUDIENCE · " + audience,
        "",
        ...(payload.title || payload.name
          ? [payload.title || payload.name, ""]
          : []),
        payload.body || payload.reason || payload.description || "",
        ...(preview.catalog
          ? [
              "",
              ...Object.entries(payload)
                .filter(([key]) => !["description", "details"].includes(key))
                .map(([key, value]) => `${key}: ${value}`),
              "",
              "DETAILS",
              JSON.stringify(payload.details, null, 2),
              "",
              "IMAGES TO UPLOAD",
              ...(preview.catalog.files.length
                ? preview.catalog.files.map(
                    (file) =>
                      `${file.path} · ${file.mime} · ${file.size} bytes`,
                  )
                : ["No new images"]),
            ]
          : []),
        ...(payload.code ? ["", "CODE TO PUBLISH", payload.code] : []),
        ...(payload.review_focus
          ? ["", "REVIEW FOCUS", payload.review_focus]
          : []),
      ];
      const lines = raw.flatMap((line) => wrap(line, contentWidth));
      body = h(
        Box,
        { flexDirection: "column" },
        h(FrameRows, {
          rows: lines,
          width: contentWidth,
          height: Math.max(1, contentHeight - 2),
          offset: Math.min(
            scroll,
            Math.max(0, lines.length - contentHeight + 2),
          ),
        }),
        h(Text, { color: colors.muted }, " "),
        h(
          Text,
          null,
          h(
            Text,
            { color: !yes ? colors.blue : colors.muted, bold: !yes },
            "  ← Back to edit  ",
          ),
          h(
            Text,
            { color: yes ? colors.purple : colors.muted, bold: yes },
            "  Publish / save →  ",
          ),
        ),
      );
    } else if (form)
      body = h(form.kind === "appearance" ? AppearanceView : FormView, {
        form,
        active: field,
        navFocus: formNav,
        cursor,
        width: contentWidth,
        height: contentHeight,
      });
    else if ((loading || booting) && !current)
      body = h(
        Text,
        { color: colors.muted },
        "Opening " + labelOf(route).toLowerCase() + " " + spin,
      );
    else if (actionIndex !== null) {
      const first = Math.max(
        0,
        actionIndex - Math.max(1, contentHeight - 2) + 1,
      );
      body = h(
        Box,
        { height: contentHeight, flexDirection: "column", overflow: "hidden" },
        h(
          Text,
          { bold: true, color: colors.blue },
          "Actions · ↑↓ choose · Enter run · Esc close",
        ),
        contentHeight >= 4
          ? h(
              Text,
              { color: colors.muted },
              "Available for this selection and your role",
            )
          : null,
        ...actions
          .slice(
            first,
            first + Math.max(1, contentHeight - (contentHeight >= 4 ? 2 : 1)),
          )
          .map((action, i) =>
            h(
              Text,
              {
                key: action.id,
                color: i + first === actionIndex ? colors.blue : colors.text,
                backgroundColor:
                  i + first === actionIndex ? colors.selected : undefined,
              },
              clip(
                (i + first === actionIndex ? "› " : "  ") + action.label,
                contentWidth,
              ),
            ),
          ),
      );
    } else if (reviewing)
      body = h(ReviewWorkspace, {
        post: current.post,
        note: route.view === "feedback" ? current.note : null,
        items: current.items || [],
        index,
        width: contentWidth,
        height: contentHeight,
        focus: reviewFocus,
        line: reviewLine,
        anchor: reviewAnchor,
        horizontal: reviewHorizontal,
        layout: effectiveAppearance.reviewLayout,
        stride,
        rows: (w) =>
          listRows(
            route,
            current,
            index,
            w,
            colors,
            effectiveAppearance.density,
          ),
      });
    else if (error && !current)
      body = h(FrameRows, {
        rows: [
          { text: "Could not open this view", bold: true, color: colors.red },
          "",
          ...wrap(error, contentWidth),
          "",
          ...wrap(
            "Shift+R retries this view · Esc goes back · Ctrl+L reconnects",
            contentWidth,
          ),
        ],
        width: contentWidth,
        height: contentHeight,
      });
    else {
      const lines = documentRows(route, current || {}, contentWidth, colors);
      if (lines.length)
        body = h(FrameRows, {
          rows: lines,
          width: contentWidth,
          height: contentHeight,
          offset: Math.min(scroll, Math.max(0, lines.length - contentHeight)),
        });
      else if (!current?.items?.length) {
        const messages = {
          inbox: [
            "You're all caught up.",
            "Replies, mentions and review updates will appear here.",
          ],
          drafts: [
            "No local drafts yet.",
            "Start writing to save a private draft on this device.",
          ],
          communities: [
            "Find your people.",
            "Use / to search or N to create a private community.",
          ],
          feed: [
            "Nothing here yet.",
            "N starts a conversation. A asks a question.",
          ],
          search: route.query
            ? [
                "No conversations matched your search.",
                "Try fewer words or a different phrase.",
              ]
            : [
                "Find your next useful conversation.",
                "Press / and type /search followed by your query.",
              ],
        };
        const message = messages[route.view] || [
          "Nothing here yet.",
          "Use / to search or Tab to explore another section.",
        ];
        body = h(DeviPanel, {
          width: contentWidth,
          height: contentHeight,
          message: message[0],
          status: [message[1]],
          show:
            effectiveAppearance.welcome === "on" &&
            Object.hasOwn(messages, route.view),
          motion: effectiveAppearance.motion,
        });
      } else {
        const visible = Math.max(1, Math.floor(contentHeight / stride)),
          first = Math.max(0, index - visible + 1),
          rows = listRows(
            route,
            current,
            index,
            contentWidth,
            colors,
            effectiveAppearance.density,
          ).slice(first * stride, first * stride + contentHeight);
        body = h(
          Box,
          {
            flexDirection: "column",
            height: contentHeight,
            overflow: "hidden",
          },
          ...rows.map((row, i) =>
            h(
              Box,
              {
                key: i,
                width: contentWidth,
                backgroundColor: row.selected ? colors.selected : undefined,
              },
              h(TextLine, {
                text: typeof row === "string" ? row : row.text,
                width: contentWidth,
                color: row.color || colors.text,
                bold: row.bold,
              }),
            ),
          ),
        );
      }
    }
    const tabs =
      route.view === "post" && !form
        ? [
            ["overview", "Overview"],
            ["replies", "Replies"],
            ...(current?.post?.kind === "review"
              ? [["feedback", "Code feedback"]]
              : []),
          ]
        : [];
    const pane = h(
      Box,
      {
        borderStyle: colors.frame,
        borderColor: focus === "nav" && !compact ? colors.line : colors.purple,
        backgroundColor: colors.panel,
        flexDirection: "column",
        flexGrow: 1,
        paddingX: 1,
        height: bodyHeight,
        overflow: "hidden",
      },
      h(TextLine, {
        text: reading
          ? "Full text · " + (reading.name || "reply")
          : preview
            ? "Preview · " + preview.title
            : form
              ? form.title
              : current?.title || labelOf(route),
        width: contentWidth,
        color: colors.text,
        bold: true,
      }),
      tabs.length
        ? h(
            Text,
            { color: colors.muted, wrap: "truncate" },
            ...tabs.map(([id, label]) =>
              h(
                Text,
                {
                  key: id,
                  color:
                    (route.tab || "overview") === id
                      ? colors.blue
                      : colors.muted,
                  bold: (route.tab || "overview") === id,
                  backgroundColor:
                    (route.tab || "overview") === id
                      ? colors.selected
                      : undefined,
                },
                " " + label + " ",
              ),
            ),
            h(
              Text,
              { color: colors.muted },
              reviewing ? "  W focus · F " + (route.status || "all") : "  ← →",
            ),
          )
        : h(TextLine, {
            text: form
              ? (form.kind === "appearance"
                  ? "Local preferences · Preview now · Ctrl+S save · Esc cancel"
                  : (activeSteps.length
                      ? `Step ${activeStep + 1}/${activeSteps.length} · ${activeSteps[activeStep].label} · `
                      : "") + "Tab field · Ctrl+N/P steps · Ctrl+S preview") +
                (draftSaved ? " · Draft saved locally" : "")
              : preview
                ? "Scroll to review · ← → choose · Enter confirms"
                : current?.subtitle || " ",
            width: contentWidth,
            color: colors.muted,
          }),
      h(Text, null, " "),
      body,
      current?.pagination && !form
        ? h(TextLine, {
            text: `[ previous · Page ${current.pagination.page}/${current.pagination.pages || 1} · ${current.pagination.total} items · next ]`,
            width: contentWidth,
            color: colors.muted,
          })
        : null,
    );
    const side =
      !compact || focus === "nav"
        ? h(
            Box,
            {
              borderStyle: colors.frame,
              borderColor: focus === "nav" ? colors.blue : colors.line,
              backgroundColor: colors.panel,
              flexDirection: "column",
              width: compact ? width : sidebar,
              height: bodyHeight,
              paddingX: 1,
              overflow: "hidden",
            },
            h(Text, { color: colors.purple, bold: true }, "YOUR SPACE"),
            h(Text, null, " "),
            ...navigation
              .slice(
                Math.max(0, navIndex - Math.max(1, bodyHeight - 5) + 1),
                Math.max(0, navIndex - Math.max(1, bodyHeight - 5) + 1) +
                  Math.max(1, bodyHeight - 5),
              )
              .map(([id, label], i) => {
                const absolute = navigation.findIndex((item) => item[0] === id),
                  selected = absolute === navIndex && focus === "nav";
                return h(
                  Text,
                  {
                    key: id,
                    color: selected
                      ? colors.blue
                      : route.view === id
                        ? colors.purple
                        : colors.muted,
                    bold: selected || route.view === id,
                    backgroundColor: selected ? colors.selected : undefined,
                    wrap: "truncate",
                  },
                  (selected ? "› " : route.view === id ? "● " : "  ") +
                    label +
                    (id === "inbox" && unread ? " · " + unread : ""),
                );
              }),
            h(
              Text,
              { color: colors.muted, dimColor: true },
              "  Tab sections · / find",
            ),
          )
        : null;
    center = h(
      Box,
      { height: bodyHeight, flexDirection: "row", gap: compact ? 0 : 1 },
      side,
      compact && focus === "nav" ? null : pane,
    );
  }
  const hint = palette
    ? "Type to filter · ↑↓ choose · Enter open · Esc return"
    : ["projects", "events"].includes(route.view) &&
        !form &&
        !preview &&
        !picker
      ? "↑↓ select · Enter open · F filters · N new · [ ] pages · / search"
      : ["project", "event"].includes(route.view) && !form && !preview
        ? "↑↓ scroll · X actions · E edit your publication · Esc back"
        : form?.kind === "appearance"
          ? "← → choose · Tab next · Ctrl+S save · Esc cancel · 0 default preview"
          : actionIndex !== null
            ? "Actions are scoped to the selected item · Esc closes"
            : reviewing && !form && !preview && !reading
              ? "W code / discussion · Space select · C comment · X actions · F filter"
              : picker
                ? "Project files stay local until publication is confirmed"
                : reading
                  ? readerFind.editing
                    ? "Find in this text · Enter locate · Esc finish search"
                    : "↑↓ scroll · / find · n/N match · Home/End · Esc return"
                  : preview
                    ? "← → choose · Enter confirm · Esc edit"
                    : form
                      ? formNav
                        ? `${stepControls(activeSteps, activeStep).find((control) => control.id === formNav)?.label || "Next"} · Enter select · Tab fields · Ctrl+S preview`
                        : fieldsFor(form)[field]?.multiline
                          ? "Enter new line · Tab next field · Ctrl+N next step · Ctrl+S preview"
                          : "Enter/Tab next field · Ctrl+N/P steps · Ctrl+S preview"
                      : phase !== "ready"
                        ? "Enter connect / open browser · Ctrl+C exit"
                        : route.view === "feedback"
                          ? "↑↓ select · R reply · E edit · D delete · S resolve · ! report"
                          : route.view === "post"
                            ? "←→ tabs · ↑↓ select · R reply · E edit · D delete · Space read"
                            : "↑↓ select · Enter open · Tab sections · [ ] pages · N new · / search";
  return h(
    ThemeContext.Provider,
    { value: colors },
    h(
      Box,
      {
        flexDirection: "column",
        width,
        height,
        overflow: "hidden",
        backgroundColor: colors.bg,
      },
      h(
        Box,
        {
          height: 3,
          borderStyle: colors.frame,
          borderColor: colors.line,
          paddingX: 1,
          justifyContent: "space-between",
          overflow: "hidden",
        },
        h(
          Text,
          { color: colors.purple, bold: true },
          clip("◈ DEVDEVIAN  ·  " + basename(root), Math.max(10, width - 36)),
        ),
        h(
          Text,
          { color: colors.blue },
          clip(
            user
              ? "@" +
                  user.username +
                  " · " +
                  unread +
                  " unread · " +
                  (live ? "● Live" : "○ Paused")
              : "CLI · ALPHA",
            32,
          ),
        ),
      ),
      center,
      h(TextLine, {
        text: clip((pending || loading ? spin + " " : "") + status, width),
        width,
        color: error ? colors.red : notice ? colors.green : colors.muted,
      }),
      h(
        Box,
        {
          height: 3,
          borderStyle: colors.frame,
          borderColor: focus === "prompt" ? colors.blue : colors.line,
          paddingX: 1,
          overflow: "hidden",
        },
        h(Text, { color: colors.purple, bold: true }, "› "),
        focus === "prompt"
          ? h(InputText, {
              value: command,
              cursor: commandCursor,
              width: Math.max(1, width - 6),
            })
          : h(
              Text,
              { color: colors.muted },
              clip(
                "Search or /command     ·     Press / to type · X actions · , appearance",
                width - 6,
              ),
            ),
      ),
      h(TextLine, { text: hint, width, color: colors.muted }),
    ),
  );
}
export async function startTui(flags = {}) {
  if (!process.stdin.isTTY || !process.stdout.isTTY)
    throw Error(
      "The live interface needs an interactive terminal. Use --help or a command with --json for scripts.",
    );
  let config = await loadConfig();
  if (flags.host && config && originOf(flags.host) !== config.origin)
    config = null;
  const root = await workspaceRoot(flags.project || process.cwd());
  const loaded = await loadAppearance();
  const initialAppearance = {
    ...loaded,
    settings: normalizeAppearance({
      ...loaded.settings,
      ...appearanceFlags(flags),
    }),
  };
  const app = render(
    h(App, { initialConfig: config, flags, root, initialAppearance }),
    {
      alternateScreen: true,
      exitOnCtrlC: false,
      patchConsole: true,
      maxFps: 20,
      incrementalRendering: false,
    },
  );
  try {
    await app.waitUntilExit();
  } finally {
    app.cleanup();
    process.stdin.pause();
    process.stdin.unref?.();
  }
}
