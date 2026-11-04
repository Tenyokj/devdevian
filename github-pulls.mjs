import { githubRepository } from "./packages/cli/lib/github-context.mjs";
export function publicPull(value) {
  if (typeof value !== "string") return null;
  const m = value
    .trim()
    .match(
      /^https:\/\/github\.com\/([^/?#]+)\/([^/?#]+)\/pull\/([1-9]\d{0,8})\/?$/,
    );
  const repository =
    m && githubRepository(`https://github.com/${m[1]}/${m[2]}`);
  return repository
    ? { repository, number: Number(m[3]), url: `${repository}/pull/${m[3]}` }
    : null;
}
// Fixed host, no redirects, no OAuth credentials and a bounded response. Public
// metadata is evidence of a fetched revision, never proof of the submitter's identity.
export async function fetchPublicPull(
  ref,
  { fetcher = fetch, now = Date.now } = {},
) {
  const path = new URL(ref.repository).pathname;
  const r = await fetcher(
    `https://api.github.com/repos${path}/pulls/${ref.number}`,
    {
      redirect: "manual",
      credentials: "omit",
      signal: AbortSignal.timeout(10000),
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "Devdevian",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );
  if (!r.ok)
    throw Object.assign(
      Error(
        r.status === 404
          ? "Public PR not found. Private repositories are not supported."
          : "GitHub is unavailable or rate limited. Your work is unchanged.",
      ),
      { status: r.status === 404 ? 404 : 503 },
    );
  const reader = r.body.getReader();
  let size = 0;
  const chunks = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 262144) throw Error("GitHub response is too large.");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  const p = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (
    p.number !== ref.number ||
    !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(p.head?.sha || "") ||
    !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(p.base?.sha || "") ||
    githubRepository(p.base?.repo?.html_url)?.toLowerCase() !==
      ref.repository.toLowerCase() ||
    !["open", "closed"].includes(p.state)
  )
    throw Object.assign(Error("GitHub returned an invalid PR snapshot."), {
      status: 503,
    });
  return {
    ...ref,
    title: String(p.title || "").slice(0, 256),
    state: p.merged_at ? "merged" : p.draft ? "draft" : p.state,
    head: p.head.sha,
    base: p.base.sha,
    fetched_at: new Date(now()).toISOString(),
  };
}
