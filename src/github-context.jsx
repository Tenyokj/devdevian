import React from "react";
import { Github, ExternalLink } from "lucide-react";
import { normalizeGitHubContext } from "../packages/cli/lib/github-context.mjs";
import "./github-context.css";
export function GitHubContext({ value }) {
  if (!value) return null;
  let c;
  try {
    c = normalizeGitHubContext(value);
  } catch {
    return null;
  }
  const link = (url, label) => (
    <a href={url} target="_blank" rel="noopener noreferrer">
      {label}
      <ExternalLink size={13} aria-hidden="true" />
    </a>
  );
  return (
    <section className="github-context" aria-label="GitHub context">
      <div className="github-context-heading">
        <Github size={19} aria-hidden="true" />
        <strong>GitHub context</strong>
        <span>
          {c.mode === "file"
            ? "Local file"
            : c.mode === "staged"
              ? "Staged patch"
              : "Unstaged patch"}
        </span>
      </div>
      <div className="github-context-links">
        {link(c.repository, c.repository.replace("https://github.com/", ""))}
        {link(
          c.repository + "/commit/" + c.commit,
          "Base " + c.commit.slice(0, 7),
        )}
        {c.pull_request &&
          link(c.pull_request, "PR #" + c.pull_request.split("/").at(-1))}
      </div>
      <p>
        <span>Branch</span> <code>{c.branch || "detached HEAD"}</code>
      </p>
      <p>
        <span>File</span> <code>{c.path}</code>
        {c.start_line && (
          <span>
            {" "}
            · lines {c.start_line}–{c.end_line}
          </span>
        )}
      </p>
      <small>
        Shared by the author. Local code may differ from the base commit; GitHub
        content is not synchronized.
      </small>
    </section>
  );
}
