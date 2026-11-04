// Isolated fixture entry point. No production switch can activate this provider.
process.env.GITHUB_APP_CLIENT_ID = "Iv_fixture";
process.env.GITHUB_APP_CLIENT_SECRET = "fixture";
process.env.GITHUB_APP_SLUG = "fixture";
process.env.GITHUB_APP_TOKEN_KEY = "a".repeat(64);
process.env.GITHUB_APP_WEBHOOK_SECRET = "fixture".repeat(8);
process.env.APP_URL = "http://127.0.0.1:" + process.env.PORT;
const original = globalThis.fetch;
globalThis.fetch = async (value, options) => {
  const u = new URL(value);
  if (!["api.github.com", "github.com"].includes(u.hostname))
    return original(value, options);
  let data;
  if (u.hostname === "github.com")
    data = {
      access_token: "ghu_fixture",
      refresh_token: "ghr_fixture",
      expires_in: 28800,
      refresh_token_expires_in: 15897600,
    };
  else if (u.pathname === "/user") data = { id: 100, login: "fixture-owner" };
  else if (u.pathname === "/repos/example/repo")
    data = {
      id: 7,
      html_url: "https://github.com/example/repo",
      full_name: "example/repo",
      private: true,
      default_branch: "main",
    };
  else if (u.pathname === "/repos/example/repo/issues/4")
    data = {
      number: 4,
      title: "Bound the retry loop",
      body: "Use a fixed deadline. <script>window.pwned=true</script>",
      state: "open",
      updated_at: "2026-11-04T00:00:00Z",
      html_url: "https://github.com/example/repo/issues/4",
    };
  else if (u.pathname === "/repos/example/repo/pulls/5")
    data = {
      number: 5,
      title: "Fix the retry deadline",
      body: "Add a bounded retry.",
      state: "open",
      merged: false,
      head: { sha: "a".repeat(40) },
      base: { sha: "b".repeat(40), repo: { private: true } },
      updated_at: "2026-11-04T00:00:00Z",
      html_url: "https://github.com/example/repo/pull/5",
    };
  else if (u.pathname.endsWith("/reviews"))
    data = [
      { user: { id: 100 }, commit_id: "a".repeat(40), state: "APPROVED" },
    ];
  else if (u.pathname.endsWith("/check-runs"))
    data = {
      total_count: 1,
      check_runs: [
        { name: "tests", status: "completed", conclusion: "success" },
      ],
    };
  else if (u.pathname.endsWith("/status")) data = { state: "success" };
  else if (u.pathname === "/user/installations") data = { installations: [] };
  else
    return new Response(JSON.stringify({ message: "Not found" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};
await import("../server.mjs");
