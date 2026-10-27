import { open, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { basename, dirname, join } from "node:path";
import { createHash } from "node:crypto";
import { workspacePath } from "./workspace.mjs";
export const viewerZone = () =>
  Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
export const isCatalog = (route) =>
  ["projects", "events", "project", "event"].includes(route.view);
const stages = ["Idea", "Prototype", "Beta", "Live"].map((s) => [s, s]);
const imageHint =
  "Ctrl+O selects an image inside this project. Blank keeps it; - removes it.";
export function catalogFields(form) {
  const topic = { key: "topic", label: "Topic", options: form.topics };
  if (form.kind === "catalogFilter")
    return [
      { key: "query", label: "Search", max: 200 },
      { ...topic, options: [["", "Every topic"], ...form.topics] },
      ...(form.entity === "project"
        ? [
            {
              key: "stage",
              label: "Stage",
              options: [["", "Every stage"], ...stages],
            },
            {
              key: "author",
              label: "Owner",
              options: [
                ["", "Everyone"],
                ["me", "My projects"],
              ],
            },
            {
              key: "order",
              label: "Order",
              options: [
                ["newest", "Newest first"],
                ["oldest", "Oldest first"],
              ],
            },
          ]
        : [
            {
              key: "status",
              label: "When",
              options: [
                ["", "All events"],
                ["upcoming", "Upcoming"],
                ["past", "Past"],
              ],
            },
            {
              key: "date",
              label: "Calendar date (optional)",
              max: 10,
              hint: "YYYY-MM-DD in the timezone below; blank clears the date filter.",
            },
            { key: "timezone", label: "Viewer timezone", min: 1, max: 100 },
            {
              key: "mine",
              label: "Participation",
              options: [
                ["", "Everyone"],
                ["attending", "Attending"],
                ["mine", "Hosting or attending"],
              ],
            },
            {
              key: "order",
              label: "Order",
              options: [
                ["earliest", "Earliest first"],
                ["latest", "Latest first"],
              ],
            },
          ]),
    ];
  if (form.kind === "calendar")
    return [
      {
        key: "path",
        label: "Calendar filename",
        min: 1,
        max: 500,
        hint: "A new .ics file inside this project. Existing files are never overwritten.",
      },
    ];
  const links = {
    key: "links",
    label: "Additional links (optional)",
    multiline: true,
    max: 15000,
    hint: "One per line: Label | https://example.com",
  };
  if (form.entity === "event")
    return [
      { key: "title", label: "Event title", min: 5, max: 160 },
      topic,
      {
        key: "local_start",
        label: "Organizer's local start",
        min: 16,
        max: 16,
        hint: "YYYY-MM-DDTHH:mm (24-hour clock); the server validates DST and future dates.",
      },
      {
        key: "timezone",
        label: "Organizer timezone",
        min: 1,
        max: 100,
        hint: "IANA timezone, for example Europe/Kyiv or Asia/Shanghai.",
      },
      {
        key: "duration",
        label: "Duration in minutes",
        min: 2,
        max: 3,
        hint: "15–720 minutes",
      },
      { key: "url", label: "Meeting URL", min: 8, max: 1000 },
      {
        key: "description",
        label: "Description",
        min: 20,
        max: 5000,
        multiline: true,
      },
      {
        key: "banner",
        label: "Banner image (optional)",
        max: 1500,
        hint: imageHint,
      },
      links,
    ];
  return [
    { key: "name", label: "Project name", min: 2, max: 80 },
    { key: "tagline", label: "Tagline (optional)", max: 1000 },
    topic,
    { key: "stage", label: "Stage", options: stages },
    { key: "stack", label: "Tools & technologies", max: 150 },
    {
      key: "description",
      label: "Description",
      min: 20,
      max: 5000,
      multiline: true,
    },
    {
      key: "help",
      label: "What do you need help with?",
      min: 10,
      max: 1500,
      multiline: true,
    },
    { key: "url", label: "Project URL (optional)", max: 1000 },
    { key: "repo", label: "Source URL (optional)", max: 1000 },
    { key: "problem", label: "Problem (optional)", multiline: true, max: 1000 },
    { key: "audience", label: "Audience (optional)", max: 1000 },
    {
      key: "team",
      label: "Team (optional)",
      multiline: true,
      max: 5000,
      hint: "One per line: @username | Role. Existing members can use #user_id | Role.",
    },
    links,
    { key: "logo", label: "Logo image (optional)", max: 1500, hint: imageHint },
    {
      key: "screenshots",
      label: "Screenshot images (optional)",
      multiline: true,
      max: 15000,
      hint: "Ctrl+O appends a file. One local path per line; up to ten. Blank keeps existing screenshots; - removes them.",
    },
  ];
}
export function initialCatalog(entity, row = {}) {
  const values =
    entity === "project"
      ? Object.fromEntries(
          [
            "name",
            "description",
            "help",
            "stack",
            "url",
            "repo",
            "tagline",
            "problem",
            "audience",
          ].map((key) => [key, row[key] || ""]),
        )
      : {
          title: row.title || "",
          description: row.description || "",
          url: row.url || "",
          timezone: row.timezone || viewerZone(),
          duration: row.start_at
            ? String(
                Math.round(
                  (new Date(row.end_at) - new Date(row.start_at)) / 60000,
                ),
              )
            : "60",
          local_start: row.start_at
            ? localTime(row.start_at, row.timezone)
            : "",
          banner: "",
        };
  return {
    ...values,
    topic: row.topic || "web",
    ...(entity === "project"
      ? {
          stage: row.stage || "Idea",
          team: (row.team || [])
            .map((m) => `#${m.user_id} | ${m.role}`)
            .join("\n"),
          logo: "",
          screenshots: "",
        }
      : {}),
    links: (row.links || []).map((l) => `${l.label} | ${l.url}`).join("\n"),
  };
}
export function localTime(value, timezone = viewerZone()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(value))
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}
export function catalogQuery(route) {
  const q = new URLSearchParams({ page: String(route.page || 1), limit: "12" });
  for (const key of [
    "topic",
    "stage",
    "author",
    "order",
    "status",
    "date",
    "timezone",
  ])
    if (route[key]) q.set(key, route[key]);
  if (route.query) q.set("q", route.query);
  if (route.mine) q.set(route.mine === "attending" ? "attending" : "mine", "1");
  return q.toString();
}
export async function loadCatalog(api, route, signal) {
  const plural = route.view === "projects" || route.view === "events";
  if (plural)
    return {
      ...(await api(`/${route.view}?${catalogQuery(route)}`, { signal })),
      title: route.view === "projects" ? "Projects" : "Events",
      subtitle: "F filters · N creates · Enter opens · [ ] pages",
    };
  const row = await api(`/${route.view}s/${route.id}`, { signal });
  return {
    [route.view]: row,
    title: row.name || row.title,
    subtitle:
      route.view === "project"
        ? `${row.stage} · by ${row.founder_name}`
        : `${row.cancelled_at ? "Cancelled · " : ""}Hosted by ${row.organizer_name} · ${row.attendee_count} attending`,
  };
}
export function catalogDocument(route, data) {
  const p = data.project,
    e = data.event;
  if (p)
    return [
      p.tagline,
      p.description,
      "## Request for feedback",
      p.help,
      p.problem && "## Problem\n" + p.problem,
      p.audience && "## Audience\n" + p.audience,
      p.stack && "## Technologies\n" + p.stack,
      p.url && "Project: " + p.url,
      p.repo && "Source: " + p.repo,
      p.team?.length &&
        "## Team\n" +
          p.team
            .map(
              (m) =>
                `${m.name || "Member"} (@${m.username || m.user_id}) · ${m.role}`,
            )
            .join("\n"),
      p.logo && "Logo: uploaded image",
      p.screenshots?.length &&
        `${p.screenshots.length} screenshot(s) · view in browser`,
      ...(p.links || []).map((l) => `${l.label}: ${l.url}`),
    ]
      .filter(Boolean)
      .join("\n\n");
  if (e)
    return [
      `Your time: ${localTime(e.start_at)} – ${localTime(e.end_at)} (${viewerZone()})`,
      `Organizer time: ${localTime(e.start_at, e.timezone)} – ${localTime(e.end_at, e.timezone)} (${e.timezone})`,
      e.cancelled_at
        ? "This event is cancelled."
        : e.viewer_attending
          ? "You're attending."
          : "Join to access the meeting link.",
      e.description,
      e.url && "Meeting: " + e.url,
      ...(e.links || []).map((l) => `${l.label}: ${l.url}`),
      e.banner && "Banner: uploaded image",
    ]
      .filter(Boolean)
      .join("\n\n");
  return "";
}
export function catalogActions(route, data, user) {
  const actions = [],
    row = data?.project || data?.event;
  if (!row) return actions;
  const add = (id, label) => actions.push({ id: "catalog-" + id, label });
  if (row.user_id === user?.id) add("edit", "Edit your " + route.view);
  if (route.view === "project") {
    add("conversation", "Open project conversation");
    if (row.url) add("website", "Open project website");
    if (row.repo) add("source", "Open source repository");
  } else {
    if (
      row.viewer_attending ||
      (!row.cancelled_at && new Date(row.end_at) > new Date())
    )
      add("attend", row.viewer_attending ? "Leave event…" : "Attend event…");
    add("calendar", "Export calendar .ics…");
    if (row.url) add("meeting", "Open meeting link");
    if (row.user_id === user?.id)
      add(
        "lifecycle",
        row.cancelled_at ? "Restore your event…" : "Cancel your event…",
      );
  }
  add("browser", "Open in browser");
  return actions;
}
export async function readImage(root, path) {
  const file = await workspacePath(root, path),
    handle = await open(
      file,
      constants.O_RDONLY |
        (constants.O_NOFOLLOW || 0) |
        (constants.O_NONBLOCK || 0),
    );
  try {
    const info = await handle.stat();
    if (!info.isFile() || !info.size || info.size > 4 * 1024 * 1024)
      throw Error("Choose an image up to 4 MiB.");
    const buffer = Buffer.alloc(4 * 1024 * 1024 + 1);
    let size = 0;
    while (size < buffer.length) {
      const r = await handle.read(buffer, size, buffer.length - size, null);
      if (!r.bytesRead) break;
      size += r.bytesRead;
    }
    if (size > 4 * 1024 * 1024) throw Error("Image exceeds 4 MiB.");
    const bytes = buffer.subarray(0, size);
    const mime = bytes
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      ? "image/png"
      : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
        ? "image/jpeg"
        : /^GIF8[79]a/.test(bytes.subarray(0, 6).toString())
          ? "image/gif"
          : bytes.subarray(0, 4).toString() === "RIFF" &&
              bytes.subarray(8, 12).toString() === "WEBP"
            ? "image/webp"
            : null;
    if (!mime)
      throw Error(
        "Choose a PNG, JPEG, WebP or GIF image. SVG is not accepted.",
      );
    return {
      path,
      name: basename(file),
      bytes,
      size,
      mime,
      hash: createHash("sha256").update(bytes).digest("hex"),
    };
  } finally {
    await handle.close();
  }
}
const lines = (text) =>
  String(text || "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
function pairs(value) {
  return lines(value).map((line) => {
    const at = line.indexOf("|");
    if (at < 1 || !line.slice(at + 1).trim())
      throw Error("Use one Label | Value per line.");
    return [line.slice(0, at).trim(), line.slice(at + 1).trim()];
  });
}
export function webURL(value, optional = false) {
  if (!value && optional) return "";
  let url;
  try {
    url = new URL(value);
  } catch {
    throw Error("Use a complete http:// or https:// URL.");
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    value.length > 1000
  )
    throw Error("Use an http(s) URL without embedded credentials.");
  return value;
}
export function validateFilter(values) {
  if (
    values.date &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(values.date) ||
      new Date(values.date + "T00:00Z").toISOString().slice(0, 10) !==
        values.date)
  )
    throw Error("Use a valid YYYY-MM-DD date.");
  if (values.timezone)
    new Intl.DateTimeFormat("en", { timeZone: values.timezone });
  return { ...values };
}
export async function prepareCatalog(api, root, form) {
  const v = form.values,
    entity = form.entity;
  const details = {
    links: pairs(v.links).map(([label, url]) => {
      if (label.length > 80) throw Error("Link labels allow 80 characters.");
      return { label, url: webURL(url) };
    }),
  };
  if (details.links.length > 100)
    throw Error("Use up to 100 additional links.");
  let payload;
  if (entity === "project") {
    payload = Object.fromEntries(
      [
        "name",
        "description",
        "help",
        "topic",
        "stage",
        "stack",
        "url",
        "repo",
      ].map((k) => [k, v[k] || ""]),
    );
    webURL(v.url, true);
    webURL(v.repo, true);
    Object.assign(details, {
      tagline: v.tagline,
      problem: v.problem,
      audience: v.audience,
    });
    const team = pairs(v.team);
    if (team.length > 30) throw Error("Use up to 30 team members.");
    details.team = [];
    for (const [handle, role] of team) {
      if (role.length > 80) throw Error("Team roles allow 80 characters.");
      let person;
      if (/^#[1-9]\d*$/.test(handle)) {
        const id = Number(handle.slice(1));
        person =
          form.existing?.team?.find((m) => m.user_id === id) ||
          (await api("/users/" + id));
      } else {
        const username = handle.replace(/^@/, "");
        if (!/^[a-zA-Z0-9_]{3,30}$/.test(username))
          throw Error("Choose a valid @username or existing #user_id.");
        for (let page = 1; page <= 5 && !person; page++) {
          const r = await api(
            `/people?q=${encodeURIComponent(username)}&limit=30&page=${page}`,
          );
          person = r.items.find(
            (p) => p.username?.toLowerCase() === username.toLowerCase(),
          );
          if (page >= r.pagination.pages) break;
        }
      }
      if (!person) throw Error("Team member not found: " + handle);
      if (
        details.team.some(
          (m) => m.user_id === person.id || m.user_id === person.user_id,
        )
      )
        throw Error("Choose distinct team members.");
      details.team.push({ user_id: person.user_id || person.id, role });
    }
  } else {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v.local_start))
      throw Error("Use YYYY-MM-DDTHH:mm for the organizer's local start.");
    new Intl.DateTimeFormat("en", { timeZone: v.timezone });
    const duration = Number(v.duration);
    if (!Number.isInteger(duration) || duration < 15 || duration > 720)
      throw Error("Use a duration of 15–720 minutes.");
    payload = {
      ...Object.fromEntries(
        ["title", "description", "topic", "local_start", "timezone"].map(
          (k) => [k, v[k]],
        ),
      ),
      duration,
      url: webURL(v.url),
    };
  }
  if (form.entityId) payload.revision = form.revision;
  const files = [];
  for (const key of entity === "project"
    ? ["logo", "screenshots"]
    : ["banner"]) {
    const value = (v[key] || "").trim();
    if (!value) continue;
    if (value === "-") {
      details[key] = key === "screenshots" ? [] : null;
      continue;
    }
    const paths = key === "screenshots" ? lines(value) : [value];
    if (paths.length > (key === "screenshots" ? 10 : 1))
      throw Error("Choose up to ten screenshots and one logo/banner.");
    for (const path of paths)
      files.push({ ...(await readImage(root, path)), key });
  }
  if (files.reduce((n, file) => n + file.size, 0) > 20 * 1024 * 1024)
    throw Error("Choose at most 20 MiB of images for one publication.");
  return { entity, id: form.entityId, payload: { ...payload, details }, files };
}
// Durable progress stores only IDs/hashes. Publication is never automatically replayed.
export async function publishCatalog(
  api,
  plan,
  progress = {},
  save = async () => {},
) {
  if (progress.completedId) return { id: progress.completedId };
  if (progress.uncertain)
    throw Error(
      "The previous publication outcome is unknown. Check My projects / Hosting or attending before creating another copy. Keep this draft for reference.",
    );
  const next = { ...progress, uploads: { ...progress.uploads } },
    details = { ...plan.payload.details };
  for (const file of plan.files) {
    let id = next.uploads[file.hash];
    if (!id) {
      const uploaded = await api("/uploads", {
        method: "POST",
        raw: file.bytes,
        filename: file.name,
      });
      id = uploaded.id;
      next.uploads[file.hash] = id;
      await save({ ...next, uploads: { ...next.uploads } });
    }
    if (file.key === "screenshots") {
      details.screenshots ||= [];
      details.screenshots.push(id);
    } else details[file.key] = id;
  }
  await save({ ...next, uncertain: true });
  let result;
  try {
    result = await api(`/${plan.entity}s${plan.id ? "/" + plan.id : ""}`, {
      method: plan.id ? "PATCH" : "POST",
      body: { ...plan.payload, details },
    });
  } catch (error) {
    if (error.status >= 400 && error.status < 500)
      await save({ ...next, uncertain: false });
    throw error;
  }
  await save({ ...next, completedId: result.id, uncertain: false });
  return result;
}
export async function saveCalendar(api, root, id, path) {
  if (!/\.ics$/i.test(path) || path.split(/[\\/]/).at(-1).startsWith("."))
    throw Error("Choose a new .ics filename.");
  const directory = await workspacePath(root, dirname(path));
  const text = await api(`/events/${id}/calendar`, { responseType: "text" });
  if (!text.startsWith("BEGIN:VCALENDAR") || !text.includes("END:VCALENDAR"))
    throw Error("The server returned an invalid calendar.");
  const file = join(directory, basename(path));
  try {
    await writeFile(file, text, { flag: "wx", mode: 0o600 });
  } catch (error) {
    if (error.code === "EEXIST")
      throw Error(
        "This filename already exists. Choose a different .ics filename.",
      );
    throw error;
  }
  return file;
}
