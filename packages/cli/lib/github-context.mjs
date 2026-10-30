// Pure shared contract: used by the packaged CLI, API validation and browser.
const repositoryPattern =
  /^https:\/\/github\.com\/([A-Za-z0-9][A-Za-z0-9-]{0,38})\/([A-Za-z0-9_.-]{1,100})$/;
export function githubRepository(remote) {
  if (typeof remote !== "string") return null;
  const match = remote
    .trim()
    .match(
      /^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([^/?#:\s]+)\/([^/?#:\s]+?)\/?$/,
    );
  if (!match) return null;
  const url = `https://github.com/${match[1]}/${match[2].replace(/\.git$/, "")}`;
  return repositoryPattern.test(url) &&
    ![".", ".."].includes(url.split("/").at(-1))
    ? url
    : null;
}
export function normalizeGitHubContext(value) {
  if (value === null) return null;
  const fail = () => {
    throw Error(
      "Check the GitHub repository, commit, relative file path and matching PR URL.",
    );
  };
  if (!value || typeof value !== "object" || Array.isArray(value)) fail();
  const {
    repository,
    commit,
    branch = null,
    path,
    mode,
    start_line = null,
    end_line = null,
    pull_request = null,
  } = value;
  if (
    typeof repository !== "string" ||
    !repositoryPattern.test(repository) ||
    githubRepository(repository) !== repository ||
    typeof commit !== "string" ||
    !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(commit) ||
    (branch !== null &&
      (typeof branch !== "string" ||
        !branch ||
        branch.length > 200 ||
        /[\s\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/u.test(branch))) ||
    typeof path !== "string" ||
    !path ||
    path.length > 1000 ||
    path.startsWith("/") ||
    /[\\\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/u.test(path) ||
    path.split("/").some((p) => !p || p === "." || p === "..") ||
    !["file", "staged", "unstaged", "pr"].includes(mode)
  )
    fail();
  if (
    (start_line !== null || end_line !== null) &&
    (mode !== "file" ||
      !Number.isSafeInteger(start_line) ||
      !Number.isSafeInteger(end_line) ||
      start_line < 1 ||
      end_line < start_line ||
      end_line > 10000000)
  )
    fail();
  let pr = null;
  if (pull_request !== null && pull_request !== "") {
    if (typeof pull_request !== "string") fail();
    const match = pull_request.match(
      /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/([1-9]\d{0,9})$/,
    );
    if (
      !match ||
      `https://github.com/${match[1]}/${match[2]}`.toLowerCase() !==
        repository.toLowerCase()
    )
      fail();
    pr = repository + "/pull/" + match[3];
  }
  let snapshot = {};
  if (mode === "pr") {
    const { base_commit, hunk_start, hunk_end } = value;
    if (
      !pr ||
      typeof base_commit !== "string" ||
      !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(base_commit) ||
      !Number.isSafeInteger(hunk_start) ||
      !Number.isSafeInteger(hunk_end) ||
      hunk_start < 1 ||
      hunk_end < hunk_start ||
      hunk_end > 10000
    )
      fail();
    snapshot = { base_commit, hunk_start, hunk_end };
    if (value.files !== undefined) {
      if (
        !Array.isArray(value.files) ||
        !value.files.length ||
        value.files.length > 10
      )
        fail();
      const seen = new Set();
      let nextLine = 1;
      const files = value.files.map((file) => {
        if (!file || typeof file !== "object" || Array.isArray(file)) fail();
        const normalized = normalizeGitHubContext({
          repository,
          commit,
          branch,
          mode: "pr",
          pull_request: pr,
          base_commit,
          path: file.path,
          hunk_start: file.hunk_start,
          hunk_end: file.hunk_end,
        });
        if (
          seen.has(normalized.path) ||
          file.patch_start !== nextLine ||
          !Number.isSafeInteger(file.patch_end) ||
          file.patch_end < nextLine + 3 ||
          file.patch_end > 20000
        )
          fail();
        seen.add(normalized.path);
        nextLine = file.patch_end + 1;
        return {
          path: normalized.path,
          hunk_start: normalized.hunk_start,
          hunk_end: normalized.hunk_end,
          patch_start: file.patch_start,
          patch_end: file.patch_end,
        };
      });
      if (
        files[0].path !== path ||
        files[0].hunk_start !== hunk_start ||
        files[0].hunk_end !== hunk_end
      )
        fail();
      snapshot.files = files;
    }
  }
  return {
    repository,
    branch,
    commit,
    path,
    mode,
    start_line,
    end_line,
    pull_request: pr,
    ...snapshot,
  };
}
export function githubContextLines(value) {
  if (!value) return [];
  let c;
  try {
    c = normalizeGitHubContext(value);
  } catch {
    return [
      "GitHub context could not be displayed. Refresh or check it in the browser.",
    ];
  }
  return [
    "GITHUB CONTEXT · provided by the author",
    c.repository,
    `Branch: ${c.branch || "detached HEAD"} · ${c.mode === "pr" ? "GitHub PR patch snapshot" : c.mode === "file" ? "Local file" : c.mode === "staged" ? "Staged patch" : "Unstaged patch"}`,
    "File: " +
      c.path +
      (c.start_line ? ` · lines ${c.start_line}–${c.end_line}` : ""),
    ...(c.files
      ? c.files.map(
          (f) =>
            `Selected file: ${f.path} · hunks ${f.hunk_start}–${f.hunk_end} · published lines ${f.patch_start}–${f.patch_end}`,
        )
      : []),
    ...(c.mode === "pr"
      ? [
          `Selected hunks: ${c.hunk_start}–${c.hunk_end}`,
          "Base commit: " + c.base_commit,
        ]
      : []),
    (c.mode === "pr" ? "Head commit: " : "Base commit: ") + c.commit,
    c.repository + "/commit/" + c.commit,
    ...(c.pull_request ? ["Pull request: " + c.pull_request] : []),
    c.mode === "pr"
      ? "Author-provided PR patch snapshot. Published line numbers refer to this patch, not the original file. GitHub is not synchronized."
      : "Local code may differ from the base commit. GitHub content is not synchronized.",
  ];
}
