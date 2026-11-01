import { createHash, randomBytes } from "node:crypto";
import {
  mkdir,
  lstat,
  readFile,
  writeFile,
  rename,
  unlink,
} from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { configFile, originOf } from "./client.mjs";
import { reviewSource, readCodeFile } from "./workspace.mjs";
export const workStates = ["open", "in_progress", "ready"];
export function workspaceId(value) {
  if (!/^[1-9]\d*$/.test(String(value)) || !Number.isSafeInteger(Number(value)))
    throw Error("Use a positive project, conversation or revision ID.");
  return Number(value);
}
export function requireWorkspace(data, capability = "work_requests") {
  if (data?.capabilities?.[capability] !== 1)
    throw Error(
      "This server does not support Workspaces 0.2 yet. Nothing was changed.",
    );
  return data;
}
export async function loadWorkspace(
  api,
  id,
  { page = 1, state = "", query = "", signal } = {},
) {
  id = workspaceId(id);
  if (state && !workStates.includes(state))
    throw Error("Choose open, in_progress or ready.");
  const workspace = requireWorkspace(
    await api(`/projects/${id}/workspace`, { signal }),
  );
  const params = new URLSearchParams({
    page: String(workspaceId(page)),
    limit: "12",
    q: query,
  });
  if (state) params.set("state", state);
  const requests = requireWorkspace(
    await api(`/projects/${id}/work-requests?${params}`, { signal }),
  );
  return {
    ...requests,
    workspace,
    title: workspace.project.name,
    subtitle: `Work requests · ${state || "all states"} · ← → states · N new · /request ID links`,
  };
}
// Account/server/canonical-directory scoped, outside the repository. No repository file is created.
export class ProjectBinding {
  constructor({ origin, userId, root, env = process.env }) {
    this.scope = createHash("sha256")
      .update(JSON.stringify([originOf(origin), workspaceId(userId), root]))
      .digest("hex");
    this.directory = join(dirname(configFile(env)), "projects");
    this.file = join(this.directory, this.scope + ".json");
  }
  async read() {
    try {
      const info = await lstat(this.file);
      if (
        !info.isFile() ||
        info.isSymbolicLink() ||
        info.size > 4096 ||
        (process.platform !== "win32" && info.mode & 0o077)
      )
        throw Error(
          "Invalid local project binding. Unbind this directory and try again.",
        );
      const data = JSON.parse(await readFile(this.file, "utf8"));
      if (data.scope !== this.scope || data.version !== 1)
        throw Error("Invalid local project binding.");
      return workspaceId(data.project_id);
    } catch (e) {
      if (e.code === "ENOENT") return null;
      throw e;
    }
  }
  async save(id) {
    id = workspaceId(id);
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    for (const path of [dirname(this.directory), this.directory]) {
      const info = await lstat(path);
      if (!info.isDirectory() || info.isSymbolicLink())
        throw Error("The project settings directory must be a real directory.");
    }
    const temp = join(this.directory, "." + randomBytes(12).toString("hex"));
    try {
      await writeFile(
        temp,
        JSON.stringify({ version: 1, scope: this.scope, project_id: id }) +
          "\n",
        { mode: 0o600, flag: "wx" },
      );
      await rename(temp, this.file);
    } finally {
      await unlink(temp).catch((e) => {
        if (e.code !== "ENOENT") throw e;
      });
    }
    return id;
  }
  async remove() {
    await unlink(this.file).catch((e) => {
      if (e.code !== "ENOENT") throw e;
    });
  }
}
export async function requestPlan(
  api,
  projectId,
  postId,
  state = "open",
  detach = false,
) {
  projectId = workspaceId(projectId);
  postId = workspaceId(postId);
  if (!workStates.includes(state))
    throw Error("Choose open, in_progress or ready.");
  const workspace = requireWorkspace(
    await api(`/projects/${projectId}/workspace`),
  );
  const [post, association] = await Promise.all([
    api(`/posts/${postId}`),
    api(`/projects/${projectId}/work-requests/${postId}`),
  ]);
  if (
    !workspace.permissions.manage_requests ||
    post.user_id !== workspace.project.user_id
  )
    throw Error(
      "Linking and workflow changes require ownership of both project and conversation.",
    );
  return {
    url: `/projects/${projectId}/work-requests/${postId}`,
    method: detach ? "DELETE" : association.linked ? "PATCH" : "PUT",
    payload: {
      expected_version: association.version,
      ...(detach ? {} : { state }),
    },
    title: `${detach ? "Unlink" : "Link / update"} #${postId} · ${workspace.project.name}`,
    audience: post.community_id ? "Private community" : "Public feed",
  };
}
export async function revisionBase(api, postId) {
  postId = workspaceId(postId);
  const [post, history] = await Promise.all([
    api(`/posts/${postId}`),
    api(`/posts/${postId}/revisions?page=1`),
  ]);
  requireWorkspace(history, "review_revisions");
  if (!history.current_revision_id || post.revision !== history.post_revision)
    throw Error(
      "Code changed while loading. Refresh before preparing another revision.",
    );
  return {
    post,
    baseRevisionId: history.current_revision_id,
    postRevision: history.post_revision,
  };
}
export async function revisionFiles(root, { source, file, lines, selections }) {
  let files;
  if (selections) {
    const input = await readCodeFile(root, selections);
    if (input.code.length > 16000)
      throw Error("File selection manifest is too large.");
    const entries = JSON.parse(input.code);
    if (!Array.isArray(entries) || entries.length < 1 || entries.length > 10)
      throw Error("Choose 1–10 files in the selection manifest.");
    files = [];
    for (const entry of entries) {
      if (!entry || typeof entry.path !== "string")
        throw Error("Each selection needs a relative path.");
      const chosen = await reviewSource(root, {
        kind: "file",
        path: entry.path,
        start: entry.start,
        end: entry.end,
      });
      files.push({
        path: relative(root, resolve(root, entry.path)),
        code: chosen.code,
      });
    }
  } else {
    let selected = source;
    if (selected?.kind !== "diff") {
      selected = { kind: "file", path: file };
      if (lines) {
        const match = /^([1-9]\d*):([1-9]\d*)$/.exec(lines);
        if (!match) throw Error("Use START:END for file lines.");
        selected.start = Number(match[1]);
        selected.end = Number(match[2]);
      }
    }
    const chosen = await reviewSource(root, selected);
    files = [
      { path: relative(root, resolve(root, selected.path)), code: chosen.code },
    ];
  }
  const paths = new Set();
  for (const file of files) {
    file.path = file.path.replaceAll("\\", "/");
    if (paths.has(file.path)) throw Error("Choose each file only once.");
    paths.add(file.path);
  }
  if (files.map((f) => f.code).join("\n").length > 20000)
    throw Error("Select at most 20,000 characters across all files.");
  return files;
}
export function revisionPlan(postId, base, files, focus) {
  if (
    typeof focus !== "string" ||
    focus.trim().length < 10 ||
    focus.length > 1500
  )
    throw Error("Review focus needs 10–1,500 characters.");
  return {
    url: `/posts/${workspaceId(postId)}/revisions`,
    method: "POST",
    payload: {
      expected_revision: base.postRevision,
      base_revision_id: base.baseRevisionId,
      files,
      review_focus: focus,
    },
    title: "Share immutable review revision",
    audience: base.post.community_id ? "Private community" : "Public feed",
  };
}
export function feedbackAnchor(post, metadata, start, end) {
  if (
    metadata.post_revision !== undefined &&
    metadata.post_revision !== post.revision
  )
    throw Error("Code changed while loading. Refresh before commenting.");
  if (!metadata.revision_id) return {}; // Existing 0.1 servers stay readable/writable.
  const file = metadata.files?.find(
    (f) => start >= f.start_line && end <= f.end_line,
  );
  if (!file)
    throw Error("Select lines within one file in the current revision.");
  return { revision_id: metadata.revision_id, file_path: file.path };
}
export const revisionFileRanges = (data) =>
  data?.files?.map((f) => ({
    path: f.path,
    patch_start: f.start_line,
    patch_end: f.end_line,
  }));
// Keep a known published ID through link failures; never replay an uncertain POST.
export async function publishWorkRequest(
  api,
  projectId,
  payload,
  progress = {},
  save = async () => {},
) {
  if (progress.uncertain)
    throw Error(
      "Publication outcome is unknown. Check My work before retrying; this draft is retained.",
    );
  let id = progress.postId;
  if (!id) {
    // Persist before POST, so a killed terminal cannot replay an unknown result.
    await save({ uncertain: true, payload });
    let result;
    try {
      result = await api("/posts", { method: "POST", body: payload });
    } catch (e) {
      if (e.status >= 400 && e.status < 500 && e.status !== 408) await save({});
      throw e;
    }
    id = workspaceId(result.id);
    await save({ postId: id, payload });
  }
  const plan = await requestPlan(api, projectId, id);
  if (plan.method === "PUT")
    await api(plan.url, { method: plan.method, body: plan.payload });
  return { id };
}
