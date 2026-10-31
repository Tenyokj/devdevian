import { normalizeGitHubContext } from "../packages/cli/lib/github-context.mjs";
import { parsePRPatch } from "../packages/cli/lib/pr-diff.mjs";

// A view over the exact published text. Never renumber, trim or reconstruct code:
// the server hashes it and existing remarks use these global line numbers.
export function reviewNavigation(code, value) {
  try {
    const context = normalizeGitHubContext(value);
    if (
      context?.mode !== "pr" ||
      typeof code !== "string" ||
      code.length > 20000
    )
      return [];
    const lines = code.split("\n");
    const files = context.files || [
      {
        path: context.path,
        patch_start: 1,
        patch_end: lines.length,
        hunk_start: context.hunk_start,
        hunk_end: context.hunk_end,
      },
    ];
    if (files.at(-1).patch_end !== lines.length) return [];
    return files.map((file) => {
      const text = lines.slice(file.patch_start - 1, file.patch_end);
      if (!text[0]?.startsWith("--- ") || !text[1]?.startsWith("+++ "))
        throw Error("Unsupported file boundaries");
      const patch = text.slice(2);
      const parsed = parsePRPatch(patch.join("\n"), {
        additions: patch.filter((s) => s.startsWith("+")).length,
        deletions: patch.filter((s) => s.startsWith("-")).length,
      });
      if (
        parsed.reason ||
        parsed.hunks.length !== file.hunk_end - file.hunk_start + 1
      )
        throw Error("Incomplete patch");
      let line = file.patch_start + 2;
      const hunks = parsed.hunks.map((hunk, i) => {
        const result = {
          line,
          label: `Hunk ${file.hunk_start + i}: ${hunk.header}`,
        };
        line += hunk.lines.length;
        return result;
      });
      return { ...file, hunks };
    });
  } catch {
    // Metadata can be missing or stale. Keep all code and feedback accessible.
    return [];
  }
}

export function reviewFileForRange(files, start, end = start) {
  return files.find((f) => start >= f.patch_start && end <= f.patch_end);
}
