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
    !["file", "staged", "unstaged"].includes(mode)
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
  return {
    repository,
    branch,
    commit,
    path,
    mode,
    start_line,
    end_line,
    pull_request: pr,
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
    `Branch: ${c.branch || "detached HEAD"} · ${c.mode === "file" ? "Local file" : c.mode === "staged" ? "Staged patch" : "Unstaged patch"}`,
    "File: " +
      c.path +
      (c.start_line ? ` · lines ${c.start_line}–${c.end_line}` : ""),
    "Base commit: " + c.commit,
    c.repository + "/commit/" + c.commit,
    ...(c.pull_request ? ["Pull request: " + c.pull_request] : []),
    "Local code may differ from the base commit. GitHub content is not synchronized.",
  ];
}
