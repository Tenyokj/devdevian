import { normalizeGitHubContext } from "./github-context.mjs";

// GitHub patches are untrusted text. Keep complete hunks; never execute or apply them.
export function parsePRPatch(patch, file) {
  const unavailable = (reason) => ({ hunks: [], reason });
  if (typeof patch !== "string" || !patch.trim())
    return unavailable(
      "GitHub did not provide a text patch (binary, large or unavailable file). Open it on GitHub.",
    );
  if (
    patch.length > 120000 ||
    /[\x00-\x08\x0b-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/u.test(patch)
  )
    return unavailable(
      "This patch is too large or contains terminal control characters. Open it on GitHub.",
    );
  const lines = patch.split("\n");
  if (lines.at(-1) === "") lines.pop();
  const hunks = [];
  let current,
    added = 0,
    removed = 0;
  const complete = () =>
    !current ||
    (current.old === current.oldCount && current.next === current.newCount);
  for (const line of lines) {
    const match = line.match(
      /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(?: .*)?$/,
    );
    if (match) {
      if (!complete())
        return unavailable(
          "GitHub returned an incomplete patch. Open the complete diff on GitHub.",
        );
      current = {
        header: line,
        lines: [line],
        old: 0,
        next: 0,
        oldStart: Number(match[1]),
        oldCount: Number(match[2] ?? 1),
        newStart: Number(match[3]),
        newCount: Number(match[4] ?? 1),
      };
      if (
        [
          current.oldStart,
          current.oldCount,
          current.newStart,
          current.newCount,
        ].some((n) => !Number.isSafeInteger(n) || n > 10000000)
      )
        return unavailable("This patch has unsupported line ranges.");
      hunks.push(current);
    } else {
      if (!current || !/^[ +\-\\]/.test(line))
        return unavailable(
          "GitHub returned an unsupported or incomplete patch.",
        );
      if (line.startsWith("\\") && line !== "\\ No newline at end of file")
        return unavailable("GitHub returned an unsupported patch marker.");
      current.lines.push(line);
      if (line[0] === " " || line[0] === "-") current.old++;
      if (line[0] === " " || line[0] === "+") current.next++;
      if (line[0] === "+") added++;
      if (line[0] === "-") removed++;
    }
  }
  if (
    !hunks.length ||
    !complete() ||
    added !== file.additions ||
    removed !== file.deletions
  )
    return unavailable(
      "GitHub returned an incomplete patch. Open the complete diff on GitHub.",
    );
  return {
    hunks: hunks.map(({ header, lines, oldStart, newStart }) => ({
      header,
      lines,
      oldStart,
      newStart,
    })),
    reason: null,
  };
}

export function selectPRHunks(data, start = 1, end = start) {
  const { pull, file, patch } = data || {};
  if (!patch?.hunks?.length || patch.reason)
    throw Error(patch?.reason || "Open an available PR patch first.");
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 1 ||
    end < start ||
    end > patch.hunks.length
  )
    throw Error("Choose a valid, contiguous hunk range.");
  const path = file.path,
    oldPath = file.previous_path || path;
  const context = normalizeGitHubContext({
    repository: pull.repository,
    commit: pull.commit,
    base_commit: pull.base_commit,
    branch: pull.head_ref || null,
    path,
    mode: "pr",
    pull_request: pull.url,
    hunk_start: start,
    hunk_end: end,
  });
  const code = [
    "--- " +
      (file.status === "added" ? "/dev/null" : JSON.stringify("a/" + oldPath)),
    "+++ " +
      (file.status === "removed" ? "/dev/null" : JSON.stringify("b/" + path)),
    ...patch.hunks.slice(start - 1, end).flatMap((h) => h.lines),
  ].join("\n");
  if (code.length > 20000)
    throw Error(
      "Selected patch exceeds 20,000 characters. Choose fewer hunks.",
    );
  return {
    code,
    context,
    label: `${path} · hunks ${start}–${end}`,
    fetched_at: pull.fetched_at,
  };
}

// Drafts hold a frozen selection, not a path to re-read from disk or GitHub.
export function validatePRSelection(selection) {
  const context = normalizeGitHubContext(selection?.context);
  if (
    context?.mode !== "pr" ||
    typeof selection?.code !== "string" ||
    selection.code.length < 10 ||
    selection.code.length > 20000 ||
    /[\x00-\x08\x0b-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/u.test(
      selection.code,
    )
  )
    throw Error("Invalid saved PR selection. Select the changes again.");
  return { code: selection.code, context };
}
