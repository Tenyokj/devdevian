import { clean } from "./client.mjs";
import { githubRepository } from "./github-context.mjs";
export function pullRequestRef(value) {
  const match = String(value || "")
    .trim()
    .match(
      /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/([1-9]\d{0,9})\/?$/,
    );
  const repository =
    match && githubRepository(`https://github.com/${match[1]}/${match[2]}`);
  if (!repository)
    throw Error(
      "Use a public GitHub PR URL: https://github.com/owner/repo/pull/42",
    );
  return {
    repository,
    number: Number(match[3]),
    url: repository + "/pull/" + match[3],
    api:
      repository.replace(
        "https://github.com/",
        "https://api.github.com/repos/",
      ) +
      "/pulls/" +
      match[3],
  };
}
const text = (s, max = 1000) => clean(s).slice(0, max);
const count = (n) => (Number.isSafeInteger(n) && n >= 0 ? n : 0);
export function createGitHubReader({ fetchImpl = fetch, now = Date.now } = {}) {
  const cache = new Map();
  let blockedUntil = 0;
  async function get(url, signal) {
    const cached = cache.get(url);
    if (cached && now() - cached.at < 60000) return cached;
    if (now() < blockedUntil)
      throw Error(
        `GitHub rate limit reached. Try again in ${Math.max(1, Math.ceil((blockedUntil - now()) / 1000))} seconds.`,
      );
    let response;
    try {
      response = await fetchImpl(url, {
        method: "GET",
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": "Devdevian-CLI",
          "X-GitHub-Api-Version": "2026-03-10",
        },
        credentials: "omit",
        redirect: "manual",
        signal: AbortSignal.any([
          signal || new AbortController().signal,
          AbortSignal.timeout(15000),
        ]),
      });
    } catch (e) {
      if (signal?.aborted) throw e;
      throw Error(
        "Could not reach GitHub. Check your connection and retry; the forum is unaffected.",
      );
    }
    if (!response.ok) await response.body?.cancel().catch(() => {});
    if (
      response.status === 429 ||
      (response.status === 403 &&
        (response.headers.get("x-ratelimit-remaining") === "0" ||
          response.headers.has("retry-after")))
    ) {
      const retry = Number(response.headers.get("retry-after")),
        reset = Number(response.headers.get("x-ratelimit-reset")) * 1000;
      blockedUntil = Math.max(
        now() + 60000,
        Number.isFinite(retry) ? now() + Math.min(3600, retry) * 1000 : 0,
        Number.isFinite(reset) ? Math.min(now() + 3600000, reset) : 0,
      );
      throw Error(
        "GitHub rate limit reached. Wait before refreshing; no automatic retry is made.",
      );
    }
    if (response.status === 404)
      throw Error(
        "Public PR not found. It may be private, removed or unavailable without GitHub authorization.",
      );
    if (response.status === 403)
      throw Error(
        "GitHub denied this public read. Wait and retry or open the PR in your browser.",
      );
    if (response.status >= 300 && response.status < 400)
      throw Error(
        "GitHub redirected this repository. Use the PR URL from its current repository.",
      );
    if (!response.ok)
      throw Error(
        `GitHub returned HTTP ${response.status}. Retry later; the forum is unaffected.`,
      );
    if (Number(response.headers.get("content-length")) > 2097152) {
      await response.body?.cancel();
      throw Error("This GitHub response is too large to display safely.");
    }
    const reader = response.body?.getReader();
    let size = 0;
    const chunks = [];
    if (!reader) throw Error("GitHub returned an empty response.");
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 2097152)
          throw Error("This GitHub response is too large to display safely.");
        chunks.push(value);
      }
    } catch (e) {
      await reader.cancel().catch(() => {});
      throw e;
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    let data;
    try {
      data = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      throw Error("GitHub returned an unreadable response. Retry later.");
    }
    const record = { data, at: now() };
    cache.set(url, record);
    while (cache.size > 24) cache.delete(cache.keys().next().value);
    return record;
  }
  return {
    clear() {
      cache.clear();
    },
    async load(value, { page = 1, signal } = {}) {
      const ref = pullRequestRef(value);
      if (!Number.isSafeInteger(page) || page < 1 || page > 150)
        throw Error("Choose a PR file page between 1 and 150.");
      const summary = await get(ref.api, signal),
        p = summary.data;
      if (
        !p ||
        typeof p !== "object" ||
        Array.isArray(p) ||
        p.number !== ref.number ||
        typeof p.title !== "string" ||
        !["open", "closed"].includes(p.state)
      )
        throw Error("GitHub returned invalid PR details.");
      const files = await get(
        ref.api + `/files?per_page=20&page=${page}`,
        signal,
      );
      if (!Array.isArray(files.data) || files.data.length > 20)
        throw Error("GitHub returned an invalid file page.");
      const total = count(p.changed_files),
        pages = Math.max(1, Math.ceil(Math.min(3000, total) / 20));
      if (page > pages)
        throw Error(
          "This PR file page is no longer available. Return to page 1 and refresh.",
        );
      return {
        title: `PR #${ref.number} · ${text(p.title, 256)}`,
        subtitle:
          "Public GitHub · read-only · [ ] file pages · Shift+R refresh",
        pull: {
          url: ref.url,
          repository: ref.repository,
          title: text(p.title, 256),
          number: ref.number,
          state:
            p.merged || p.merged_at ? "merged" : p.draft ? "draft" : p.state,
          author: text(p.user?.login, 100),
          base: text(p.base?.label || p.base?.ref, 300),
          head: text(p.head?.label || p.head?.ref, 300),
          commit: text(p.head?.sha, 64),
          body: text(p.body || "", 20000),
          additions: count(p.additions),
          deletions: count(p.deletions),
          changed_files: total,
          fetched_at: new Date(summary.at).toISOString(),
        },
        items: [],
        files: files.data.map((f) => ({
          path: text(f.filename),
          previous_path: text(f.previous_filename || ""),
          status: text(f.status, 30),
          additions: count(f.additions),
          deletions: count(f.deletions),
        })),
        pagination: { page, pages, total },
        truncated: total > 3000,
      };
    },
  };
}
export const githubReader = createGitHubReader();
export function pullRequestLines(data) {
  const p = data?.pull;
  if (!p) return [];
  return [
    p.url,
    `${p.state.toUpperCase()} · by @${p.author || "unknown"} · +${p.additions} / -${p.deletions}`,
    `Head: ${p.head || "deleted branch"}`,
    `Base: ${p.base || "unknown"}`,
    `Head commit: ${p.commit || "unavailable"}`,
    `Fetched: ${p.fetched_at} · cached up to 60 seconds`,
    "Read-only GitHub data. Not posted to Devdevian.",
    "",
    `CHANGED FILES · page ${data.pagination.page}/${data.pagination.pages} · ${p.changed_files} total`,
    ...data.files.map(
      (f) =>
        `${f.status} · +${f.additions}/-${f.deletions} · ${f.path}${f.previous_path ? " (from " + f.previous_path + ")" : ""}`,
    ),
    ...(data.truncated
      ? [
          "GitHub exposes at most 3,000 files; open the PR in your browser for the complete context.",
        ]
      : []),
    "",
    "DESCRIPTION",
    p.body || "No description.",
  ];
}
