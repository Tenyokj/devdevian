import { createGitHubReader } from "./github-reader.mjs";
const readers = new WeakMap();
export function connectedGitHubReader(api) {
  if (!readers.has(api))
    readers.set(
      api,
      createGitHubReader({
        connected: true,
        fetchImpl: async (value, { signal } = {}) => {
          const u = new URL(value);
          if (u.origin !== "https://api.github.com")
            throw Error("Unexpected GitHub host.");
          const r = await api(
            "/github/read?" +
              new URLSearchParams({ path: u.pathname + u.search }),
            { signal },
          );
          const data = Array.isArray(r.data)
            ? r.data
            : { ...r.data, _devdevian_private: !!r.private };
          return new Response(JSON.stringify(data), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        },
      }),
    );
  return readers.get(api);
}
export async function githubList(
  api,
  kind,
  { repository, installation, page = 1, signal } = {},
) {
  if (kind === "installations") {
    const r = await api(`/github/installations?page=${page}`, { signal });
    return {
      ...r,
      pagination: {
        page,
        pages: page + (r.has_next ? 1 : 0),
        total: r.has_next ? `${page * 20}+` : (page - 1) * 20 + r.items.length,
      },
      title: "GitHub installations",
      subtitle: "Enter selects an installation · X actions",
    };
  }
  if (kind === "repositories") {
    const r = await api(
      `/github/installations/${installation}/repositories?page=${page}`,
      { signal },
    );
    return {
      ...r,
      pagination: {
        page,
        pages: page + (r.has_next ? 1 : 0),
        total: r.has_next ? `${page * 20}+` : (page - 1) * 20 + r.items.length,
      },
      title: "Installed repositories",
      subtitle:
        "Enter opens pull requests · Private reads use your GitHub authorization",
    };
  }
  const path =
    "/repos" +
    new URL(repository).pathname +
    `/${kind}?per_page=20&page=${page}&state=open&sort=updated&direction=desc`;
  const r = await api("/github/read?" + new URLSearchParams({ path }), {
    signal,
  });
  return {
    items: r.data.map((i) => ({
      id: i.number,
      number: i.number,
      title: i.title,
      state: i.state,
      body: i.body,
      author_name: i.user?.login,
      pull: kind === "pulls" || !!i.pull_request,
      private: r.private,
    })),
    pagination: {
      page,
      pages: page + (r.has_next ? 1 : 0),
      total: r.has_next ? `${page * 20}+` : (page - 1) * 20 + r.data.length,
    },
    title: kind === "pulls" ? "Repository pull requests" : "Repository issues",
    subtitle: repository + " · Enter opens item · X actions",
  };
}
