import React, { useState, useEffect, useMemo, useRef } from "react";
import { render, Box, Text, useApp, useInput, useWindowSize } from "ink";
import { randomBytes } from "node:crypto";
import { homedir, hostname } from "node:os";
import { workspaceRoot, reviewSource } from "./workspace.mjs";
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
import { navigation, loadPage, contentLines } from "./tui-data.mjs";
const h = React.createElement;
const colors = {
  bg: "#0d1222",
  panel: "#12192b",
  line: "#354266",
  muted: "#8190af",
  text: "#e0e7ff",
  blue: "#79b8ff",
  purple: "#b29aff",
  green: "#70d6b0",
  red: "#ff9baf",
  selected: "#29345b",
};
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
function TextLine({ text, width, color = colors.text, bold = false }) {
  return h(Text, { color, bold, wrap: "truncate" }, clip(text, width));
}
function FrameRows({ rows, width, height, offset = 0 }) {
  return h(
    Box,
    { flexDirection: "column", height, overflow: "hidden" },
    ...rows.slice(offset, offset + height).map((row, i) =>
      h(TextLine, {
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
function FormView({ form, active, cursor, width, height }) {
  const fields = fieldsFor(form),
    rows = [];
  let selectedLine = 0;
  fields.forEach((field, index) => {
    if (index === active) selectedLine = rows.length;
    rows.push({
      text: (index === active ? "› " : "  ") + field.label,
      color: index === active ? colors.purple : colors.muted,
      bold: index === active,
    });
    if (field.options) {
      const option = field.options.find(
        (item) => String(item[0]) === String(form.values[field.key] || ""),
      );
      rows.push({
        text:
          "  ‹ " + (option?.[1] || form.values[field.key] || "Choose") + " ›",
        color: index === active ? colors.blue : colors.text,
      });
    } else {
      const value = form.values[field.key] || "";
      const text =
        index === active
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
          ? Math.min(4, Math.max(2, text.length))
          : 1,
        start = index === active ? Math.max(0, caretLine - visible + 1) : 0;
      rows.push(
        ...text.slice(start, start + visible).map((line) => ({
          text: "  " + line,
          color: index === active ? colors.text : colors.muted,
        })),
      );
    }
    if (field.hint && active === index)
      rows.push({ text: "  " + field.hint, color: colors.muted });
    rows.push("");
  });
  if (active === fields.length) selectedLine = rows.length;
  rows.push({
    text:
      (active === fields.length ? "› " : "  ") +
      "Preview publication  [Ctrl+S]",
    color: colors.blue,
    bold: true,
  });
  const offset = Math.max(0, Math.min(selectedLine - 1, rows.length - height));
  return h(FrameRows, { rows, width, height, offset });
}
function listRows(route, data, index, width) {
  const items = data.items || [];
  return items.flatMap((item, i) => {
    let title = item.title || item.name || "",
      meta = "",
      body = "";
    if (route.view === "drafts") {
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
          : " · reply #" + item.id);
      meta = stamp(item.created) + (item.edited_at ? " · edited" : "");
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
        text: (selected ? "› " : "  ") + clip(title, width - 3),
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
      "",
    ];
  });
}
function App({ initialConfig, flags, root }) {
  const { exit } = useApp(),
    { columns, rows } = useWindowSize();
  const [config, setConfig] = useState(initialConfig),
    [phase, setPhase] = useState(
      initialConfig && !flags.initialLogin ? "checking" : "auth",
    ),
    [user, setUser] = useState(null),
    [device, setDevice] = useState(null),
    [authVersion, setAuthVersion] = useState(0);
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
    [notice, setNotice] = useState("");
  const [form, setForm] = useState(null),
    [field, setField] = useState(0),
    [cursor, setCursor] = useState(0),
    [preview, setPreview] = useState(null),
    [dialog, setDialog] = useState(null),
    [yes, setYes] = useState(false),
    [pending, setPending] = useState(false),
    [tick, setTick] = useState(0),
    [reading, setReading] = useState(null),
    [picker, setPicker] = useState(null),
    [draftSaved, setDraftSaved] = useState(false);
  const cache = useRef(new PageCache()),
    history = useRef([]),
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
  const width = Math.max(1, columns),
    height = Math.max(1, rows - 1),
    compact = width < 90,
    sidebar = compact ? 0 : 25,
    bodyHeight = Math.max(1, height - 9),
    contentWidth = Math.max(1, width - sidebar - 6),
    contentHeight = Math.max(1, bodyHeight - 5);
  const key = JSON.stringify(route),
    current = data?.key === key ? data : null;
  const selected = current?.items?.[index];
  const resetAccount = () => {
    cache.current.clear();
    history.current = [];
    setData(null);
    setForm(null);
    setPicker(null);
    setPreview(null);
    setDevice(null);
    setUser(null);
    setRoute({ view: "feed", page: 1 });
    setError("");
  };
  function fail(e) {
    if (!alive.current) return;
    if (e.status === 401) {
      resetAccount();
      setPhase("auth");
      setConfig(null);
      setError(
        "Your session expired or was revoked. Press Enter to reconnect.",
      );
    } else setError(clean(e.message));
  }
  function navigate(next, { replace = false } = {}) {
    if (!replace) history.current.push({ route, index, scroll });
    if (history.current.length > 30) history.current.shift();
    setReading(null);
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
      setRoute(previous.route);
      setIndex(previous.index);
      setScroll(previous.scroll);
      setFocus("content");
      setError("");
    } else setFocus("nav");
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
    if (!loading && !pending && phase !== "pending") return;
    const timer = setInterval(() => setTick((v) => (v + 1) % 4), 180);
    return () => clearInterval(timer);
  }, [loading, pending, phase]);
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
  }, [phase, api]);
  useEffect(() => {
    if (phase !== "ready" || !api || form || route.view === "help") return;
    let active = true;
    const controller = new AbortController(),
      cached = cache.current.get(key);
    setData(cached ? { ...cached, key } : null);
    setLoading(!cached);
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
          setIndex((i) =>
            Math.min(i, Math.max(0, (result.items?.length || 0) - 1)),
          );
        })
        .catch((e) => {
          if (active) fail(e);
        })
        .finally(() => {
          if (active) setLoading(false);
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
  function openForm(next) {
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
    await task(async () => {
      const notes = await api(`/posts/${p.id}/code-reviews`);
      openForm({
        kind: "line",
        title: "Comment on code lines",
        feedback: true,
        audience: p.community_id ? "Private community" : "Public feed",
        postId: p.id,
        snippetHash: notes.snippet_hash,
        lineCount: p.code.split("\n").length,
        values: { start_line: "1", end_line: "1", body: "" },
      });
    });
  }
  async function prepare() {
    if (!form) return;
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
      const response = await api(preview.url, {
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
      if (preview.url === "/posts")
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
        if (!item.read_at)
          await api("/notifications/" + item.id + "/read", {
            method: "PATCH",
            body: {},
          });
        cache.current.clear();
        if (item.event_id) {
          openBrowser(
            config.origin + "/app#events/" + encodeURIComponent(item.event_id),
          );
          setNotice("Event opened in your browser.");
          return;
        }
        if (item.code_review_id)
          navigate({
            view: "feedback",
            postId: item.post_id,
            id: item.code_review_id,
            page: 1,
            targetReply: item.feedback_reply_id || null,
          });
        else
          navigate({
            view: "post",
            id: item.post_id,
            tab: item.reply_id ? "replies" : "overview",
            page: 1,
          });
      });
      return;
    }
    if (route.view === "post" && route.tab === "feedback") {
      navigate({ view: "feedback", postId: route.id, id: item.id, page: 1 });
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
      setReading(item);
      setScroll(0);
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
    if (
      !target?.feedback ||
      target.row.user_id !== user.id ||
      target.row.deleted_at
    ) {
      setError("Select your own line feedback or feedback reply to delete.");
      return;
    }
    askConfirm(
      "Delete your feedback?",
      "Your text is removed. Other members’ replies are preserved.",
      () =>
        task(async () => {
          await api(target.url, {
            method: "DELETE",
            body: { revision: target.row.revision },
          });
          invalidate("Feedback deleted; the discussion is preserved.");
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
  async function runCommand() {
    const value = command.trim();
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
        ...(parsed.command === "search" ? { query: parsed.arg } : {}),
      });
    } catch (e) {
      setError(e.message);
    }
  }
  function askQuit() {
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
      selected = (next + fields.length + 1) % (fields.length + 1);
    setField(selected);
    setCursor(
      selected < fields.length
        ? graphemes(form.values[fields[selected].key] || "").length
        : 0,
    );
  }
  useInput((input, keyEvent) => {
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
      if (input === "q") exit();
      else if (keyEvent.return && !busy.current) {
        if (phase === "pending" && device) openBrowser(device.verification_uri);
        else connect();
      }
      return;
    }
    if (busy.current) return;
    if (reading) {
      const lines = wrap(
          reading.deleted_at
            ? "[deleted — discussion preserved]"
            : reading.body || "",
          contentWidth,
        ),
        maximum = Math.max(0, lines.length - contentHeight);
      if (keyEvent.escape || keyEvent.return || input === " ") {
        setReading(null);
        setScroll(0);
        return;
      }
      if (keyEvent.upArrow || keyEvent.pageUp)
        setScroll((v) =>
          Math.max(0, v - (keyEvent.pageUp ? contentHeight : 1)),
        );
      else if (keyEvent.downArrow || keyEvent.pageDown)
        setScroll((v) =>
          Math.min(maximum, v + (keyEvent.pageDown ? contentHeight : 1)),
        );
      else if (input === "r") {
        setReading(null);
        reply();
      } else if (input === "e") {
        setReading(null);
        editSelected();
      }
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
        ["o", "g"].includes(input) &&
        form.kind === "publication" &&
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
            i = Math.max(
              0,
              opts.findIndex(
                (item) =>
                  String(item[0]) === String(form.values[active.key] || ""),
              ),
            ),
            step = keyEvent.leftArrow || keyEvent.upArrow ? -1 : 1,
            next = opts[(i + step + opts.length) % opts.length];
          if (next)
            setForm((old) => ({
              ...old,
              values: { ...old.values, [active.key]: next[0] },
            }));
        } else if (keyEvent.return) changeField(field + 1);
        return;
      }
      if (keyEvent.return && !active.multiline) {
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
    const prose =
      route.view === "help" ||
      (route.view === "post" && (!route.tab || route.tab === "overview")) ||
      (route.view === "community" && !current?.community?.is_member);
    if (
      keyEvent.upArrow ||
      keyEvent.downArrow ||
      keyEvent.pageUp ||
      keyEvent.pageDown
    ) {
      const step =
          keyEvent.pageUp || keyEvent.pageDown
            ? Math.max(1, Math.floor(contentHeight / 4))
            : 1,
        delta = keyEvent.upArrow || keyEvent.pageUp ? -step : step;
      if (prose) {
        const maximum = Math.max(
          0,
          contentLines(route, current || {}).flatMap((line) =>
            wrap(line, contentWidth),
          ).length - contentHeight,
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
      setReading(selected);
      setScroll(0);
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
    if (input === "c") {
      lineFeedback();
      return;
    }
    if (input === "s") {
      resolveSelected();
      return;
    }
    if (input === "e") {
      editSelected();
      return;
    }
    if (input === "d") {
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
  });
  const status =
    error ||
    notice ||
    (pending
      ? "Saving…"
      : loading
        ? "Loading…"
        : "Shared account · shared conversations · same permissions");
  const spin = ["◐", "◓", "◑", "◒"][tick];
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
      initial: picker,
      onCancel: () => setPicker(null),
      onSelect: (source) => {
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
    const lines = [
      "A place for curious developers.",
      "Your conversations, without leaving the terminal.",
      "",
      ...(phase === "pending" && device
        ? [
            "Confirm this code: " + device.user_code,
            "Waiting for your approval " + spin,
            device.verification_uri,
            "Enter reopens the browser · Esc cancels",
          ]
        : phase === "checking"
          ? ["Opening your workspace " + spin]
          : [
              "Sign in with your existing Devdevian account.",
              "",
              "Enter connects this terminal through your browser.",
              "Google, GitHub and email sign-in stay on the website.",
              "",
              "Q exits.",
            ]),
    ];
    center = h(
      Box,
      {
        borderStyle: "round",
        borderColor: colors.purple,
        flexDirection: "column",
        paddingX: 2,
        paddingY: 1,
        height: bodyHeight,
        overflow: "hidden",
      },
      h(Text, { bold: true, color: colors.purple }, "YOUR DEVELOPER SPACE"),
      h(FrameRows, {
        rows: lines.flatMap((line) => wrap(line, width - 8)),
        width: width - 8,
        height: Math.max(1, bodyHeight - 5),
      }),
    );
  } else if (dialog) {
    center = h(
      Box,
      {
        borderStyle: "round",
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
      const lines = wrap(
        reading.deleted_at
          ? "[deleted — discussion preserved]"
          : reading.body || "",
        contentWidth,
      );
      body = h(FrameRows, {
        rows: lines,
        width: contentWidth,
        height: contentHeight,
        offset: Math.min(scroll, Math.max(0, lines.length - contentHeight)),
      });
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
        ...(payload.title ? [payload.title, ""] : []),
        payload.body || payload.reason || payload.description || "",
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
      body = h(FormView, {
        form,
        active: field,
        cursor,
        width: contentWidth,
        height: contentHeight,
      });
    else if (loading && !current)
      body = h(
        Text,
        { color: colors.muted },
        "Opening " + labelOf(route).toLowerCase() + " " + spin,
      );
    else {
      const lines = contentLines(route, current || {}).flatMap((line) =>
        wrap(line, contentWidth),
      );
      if (lines.length)
        body = h(FrameRows, {
          rows: lines,
          width: contentWidth,
          height: contentHeight,
          offset: Math.min(scroll, Math.max(0, lines.length - contentHeight)),
        });
      else if (!current?.items?.length)
        body = h(
          Box,
          { flexDirection: "column", paddingTop: 1 },
          h(
            Text,
            { color: colors.text },
            route.view === "search"
              ? "Find your next useful conversation."
              : error
                ? "Could not open this view."
                : "Nothing here yet.",
          ),
          h(
            Text,
            { color: colors.muted },
            error
              ? "Press Shift+R to retry."
              : route.view === "feed"
                ? "N starts a conversation. A asks a question."
                : "Use / to search or Tab to explore another section.",
          ),
        );
      else {
        const visible = Math.max(1, Math.floor(contentHeight / 4)),
          first = Math.max(0, index - visible + 1),
          rows = listRows(route, current, index, contentWidth).slice(
            first * 4,
            first * 4 + contentHeight,
          );
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
        borderStyle: "round",
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
                },
                " " + label + " ",
              ),
            ),
            h(Text, { color: colors.muted }, "  ← →"),
          )
        : h(TextLine, {
            text: form
              ? "Tab next field · Ctrl+S preview" +
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
              borderStyle: "round",
              borderColor: focus === "nav" ? colors.blue : colors.line,
              backgroundColor: colors.panel,
              flexDirection: "column",
              width: compact ? width : sidebar,
              height: bodyHeight,
              paddingX: 1,
              overflow: "hidden",
            },
            h(Text, { color: colors.muted }, "WORKSPACE"),
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
                  (selected ? "› " : "  ") + label,
                );
              }),
          )
        : null;
    center = h(
      Box,
      { height: bodyHeight, flexDirection: "row", gap: compact ? 0 : 1 },
      side,
      compact && focus === "nav" ? null : pane,
    );
  }
  const hint = picker
    ? "Project files stay local until publication is confirmed"
    : reading
      ? "↑↓ scroll · R reply · E edit · Esc close"
      : preview
        ? "← → choose · Enter confirm · Esc edit"
        : form
          ? "Tab field · Ctrl+O files · Ctrl+G diff · Ctrl+S preview · Esc discard"
          : phase !== "ready"
            ? "Enter connect / open browser · Ctrl+C exit"
            : route.view === "feedback"
              ? "↑↓ select · R reply · E edit · D delete · S resolve · ! report"
              : route.view === "post"
                ? "←→ tabs · ↑↓ scroll/select · R reply · C code remark · Space full text · Tab navigate"
                : "↑↓ select · Enter open · Tab sections · [ ] pages · N new · / search";
  return h(
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
        borderStyle: "round",
        borderColor: colors.line,
        paddingX: 1,
        justifyContent: "space-between",
        overflow: "hidden",
      },
      h(
        Text,
        { color: colors.purple, bold: true },
        clip("◈ DEVDEVIAN  /  TERMINAL WORKSPACE", Math.max(10, width - 28)),
      ),
      h(
        Text,
        { color: colors.blue },
        clip(user ? "@" + user.username : "CLI · ALPHA", 24),
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
        borderStyle: "round",
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
            clip("Search or /command     ·     Press / to type", width - 6),
          ),
    ),
    h(TextLine, { text: hint, width, color: colors.muted }),
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
  const app = render(h(App, { initialConfig: config, flags, root }), {
    alternateScreen: true,
    exitOnCtrlC: false,
    patchConsole: true,
    maxFps: 20,
    incrementalRendering: false,
  });
  try {
    await app.waitUntilExit();
  } finally {
    app.cleanup();
    process.stdin.pause();
    process.stdin.unref?.();
  }
}
