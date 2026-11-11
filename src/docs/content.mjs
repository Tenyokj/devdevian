const files = import.meta.glob("../../docs/**/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
});
import cli from "../../packages/cli/README.md?raw";
import contributing from "../../CONTRIBUTING.md?raw";
import security from "../../SECURITY.md?raw";
export const docGroups = [
  [
    "Start here",
    [
      ["overview", "Overview", "docs/site/overview.md"],
      ["first-session", "Your first session", "docs/site/first-session.md"],
      ["forum", "Using the forum", "docs/user-guide.md"],
      ["my-work", "My work", "docs/my-work.md"],
      ["extensions", "Extensions & developer SDK", "docs/extensions.md"],
      ["search", "Search & discovery", "docs/search.md"],
    ],
  ],
  [
    "Build together",
    [
      ["rooms", "Projects & Rooms", "docs/rooms.md"],
      [
        "participation",
        "Participation & access",
        "docs/project-participation.md",
      ],
      ["contributions", "Contributions", "docs/contributions.md"],
      ["workspaces", "Workspaces & revisions", "docs/workspaces-0.2.md"],
      ["review-flow", "Human code reviews", "docs/review-flow.md"],
      ["moderation", "Community moderation", "docs/moderation.md"],
    ],
  ],
  [
    "Terminal",
    [
      ["cli", "CLI handbook", "packages/cli/README.md"],
      ["diagnostics", "Troubleshooting the CLI", "docs/cli-diagnostics.md"],
    ],
  ],
  [
    "GitHub",
    [
      ["github-app", "Connect the GitHub App", "docs/github-app.md"],
      ["github-work", "Issues, tasks & PRs", "docs/github-room-work.md"],
      ["github-context", "Source context", "docs/github-context.md"],
      ["github-pr", "Public pull requests", "docs/github-pr-reader.md"],
    ],
  ],
  [
    "Develop & operate",
    [
      ["development", "Local development", "docs/development.md"],
      ["architecture", "Architecture", "docs/architecture.md"],
      ["source-map", "Find your way in the code", "docs/source-map.md"],
      ["authentication", "Authentication", "docs/authentication.md"],
      ["deployment", "Deployment", "docs/deployment.md"],
      ["reliability", "Backups & reliability", "docs/reliability.md"],
      ["contributing", "Contribute to Devdevian", "CONTRIBUTING.md"],
      ["security", "Report a vulnerability", "SECURITY.md"],
    ],
  ],
];
const special = {
  "packages/cli/README.md": cli,
  "CONTRIBUTING.md": contributing,
  "SECURITY.md": security,
};
export const documents = docGroups.flatMap(([group, entries]) =>
  entries.map(([slug, title, source]) => ({
    slug,
    title,
    group,
    source,
    body: special[source] || files["../../" + source],
  })),
);
export const docPath = (slug) => "/docs/" + slug;
export const headingId = (text) =>
  String(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-");
// Resolve links against each document's real source directory; unmatched source
// links remain useful on GitHub rather than becoming broken local routes.
export function docLink(href, source) {
  if (!href || /^(https?:|mailto:|#|\/)/.test(href)) return href;
  const url = new URL(href, "https://docs.local/" + source);
  const path = decodeURIComponent(url.pathname.slice(1));
  const doc = documents.find((d) => d.source === path);
  return doc
    ? docPath(doc.slug) + url.hash
    : "https://github.com/Tenyokj/devdevian/blob/main/" + path + url.hash;
}
