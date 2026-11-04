import React, { useEffect, useState } from "react";
import {
  Github,
  GitPullRequest,
  GitBranch,
  ShieldCheck,
  RefreshCw,
} from "lucide-react";
import { api, dateStamp } from "./data";
import { MD, ErrorMessage } from "./ui";
import { selectPRHunks, parsePRPatch } from "../packages/cli/lib/pr-diff.mjs";
import { githubRepository } from "../packages/cli/lib/github-context.mjs";
import "./github-app.css";
import { GitHubWorkDialog } from "./github-work";
const query = (path) => "/github/read?" + new URLSearchParams({ path });
function Pager({ page, hasNext, onPage }) {
  return (
    <div className="gh-pager">
      <button disabled={page <= 1} onClick={() => onPage(page - 1)}>
        Previous page
      </button>
      <span>Page {page}</span>
      <button disabled={!hasNext} onClick={() => onPage(page + 1)}>
        Next page
      </button>
    </div>
  );
}
export function GitHubConnection() {
  const [config, setConfig] = useState(null),
    [status, setStatus] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState(false);
  const load = () =>
    Promise.all([api("/github/config"), api("/github/status")]).then(
      ([c, s]) => {
        setConfig(c);
        setStatus(s);
      },
    );
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);
  async function connect() {
    setBusy(true);
    setError("");
    try {
      const d = await api("/github/connect", { method: "POST", body: {} });
      location.assign(d.url);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }
  async function disconnect() {
    setBusy(true);
    setError("");
    try {
      await api("/github/connection", { method: "DELETE", body: {} });
      setConfirm(false);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="github-connection">
      <header>
        <Github size={20} />
        <h3>GitHub workspace connection</h3>
      </header>
      <p>
        Separate from sign-in. Connect your GitHub account and install the app
        on repositories you choose.
      </p>
      <ErrorMessage error={error} />
      {!config && !error && <p role="status">Checking GitHub connection…</p>}
      {config && !config.configured && (
        <p>GitHub App setup is not complete on this server yet.</p>
      )}
      {status?.connected ? (
        <>
          <p>
            <ShieldCheck size={16} /> Connected as{" "}
            <strong>@{status.login}</strong>
            {status.reconnect ? " · Reauthorization needed" : ""}
          </p>
          <div className="gh-actions">
            <button disabled={busy || !config?.configured} onClick={connect}>
              Reauthorize
            </button>
            {config?.app_url && (
              <a
                className="button secondary"
                href={config.app_url + "/installations/new"}
                target="_blank"
                rel="noreferrer"
              >
                Choose repositories ↗
              </a>
            )}
            <button onClick={() => setConfirm(true)} disabled={busy}>
              Disconnect from Devdevian
            </button>
          </div>
          {confirm && (
            <div className="gh-notice">
              <p>
                Disconnect this GitHub workspace connection? Your Devdevian
                sign-in remains available. You can also revoke the app in GitHub
                settings.
              </p>
              <button disabled={busy} onClick={disconnect}>
                Confirm disconnect
              </button>
              <button onClick={() => setConfirm(false)} disabled={busy}>
                Cancel
              </button>
            </div>
          )}
        </>
      ) : (
        <button
          className="button primary"
          disabled={busy || !config?.configured}
          onClick={connect}
        >
          Connect GitHub App
        </button>
      )}
    </section>
  );
}
function PRView({ repository, number, close, generation = 0, onReview }) {
  const [page, setPage] = useState(1),
    [pull, setPull] = useState(null),
    [files, setFiles] = useState(null),
    [chosen, setChosen] = useState(""),
    [patch, setPatch] = useState(null),
    [checks, setChecks] = useState(null),
    [error, setError] = useState(""),
    [epoch, setEpoch] = useState(0),
    [busy, setBusy] = useState(false),
    [fileData, setFileData] = useState(null),
    [hunkStart, setHunkStart] = useState(1),
    [hunkEnd, setHunkEnd] = useState(1);
  const root = "/repos" + new URL(repository).pathname + "/pulls/" + number;
  useEffect(() => {
    const c = new AbortController();
    setError("");
    setPull(null);
    setFiles(null);
    setPatch(null);
    setChosen("");
    setChecks(null);
    Promise.all([
      api(query(root), { signal: c.signal }),
      api(query(root + `/files?per_page=20&page=${page}`), {
        signal: c.signal,
      }),
    ])
      .then(async ([p, f]) => {
        const after = await api(query(root), { signal: c.signal });
        if (
          p.data.head?.sha !== after.data.head?.sha ||
          p.data.base?.sha !== after.data.base?.sha
        )
          throw Error(
            "PR changed while loading. Refresh before choosing a file.",
          );
        if (!c.signal.aborted) {
          setPull({ ...p.data, private: p.private, checked_at: p.checked_at });
          setFiles(f);
        }
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      });
    return () => c.abort();
  }, [root, page, epoch, generation]);
  async function file(path) {
    setError("");
    setBusy(true);
    setPatch(null);
    try {
      const before = await api(query(root)),
        fresh = await api(query(root + `/files?per_page=20&page=${page}`)),
        after = await api(query(root));
      if (
        before.data.head.sha !== pull.head.sha ||
        after.data.head.sha !== pull.head.sha ||
        before.data.base.sha !== pull.base.sha ||
        after.data.base.sha !== pull.base.sha
      )
        throw Error("PR changed. Refresh before inspecting its diff.");
      const f = fresh.data.find((f) => f.filename === path);
      if (!f) throw Error("File moved. Refresh this PR.");
      setPatch(
        parsePRPatch(f.patch, {
          path: f.filename,
          additions: f.additions,
          deletions: f.deletions,
        }),
      );
      setFileData(f);
      setHunkStart(1);
      setHunkEnd(1);
      if (
        before.private ||
        after.private ||
        before.data.base?.repo?.private ||
        after.data.base?.repo?.private
      )
        setPull((p) => ({ ...p, private: true }));
      setChosen(path);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function status() {
    setBusy(true);
    setError("");
    try {
      const commit = pull.head.sha,
        repo = "/repos" + new URL(repository).pathname;
      const [runs, states, current] = await Promise.all([
        api(query(repo + `/commits/${commit}/check-runs?per_page=20`)),
        api(query(repo + `/commits/${commit}/status?per_page=20`)),
        api(query(root)),
      ]);
      if (current.data.head.sha !== commit)
        throw Error("New commits arrived. Refresh before reading checks.");
      setChecks({
        runs: runs.data.check_runs || [],
        statuses: states.data.statuses || [],
        state: states.data.state,
        checked_at: new Date().toISOString(),
        truncated: runs.has_next || states.has_next,
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="github-pr-view">
      <div className="gh-actions">
        <button onClick={close}>← Repository</button>
        <button onClick={() => setEpoch((n) => n + 1)} disabled={busy}>
          <RefreshCw size={15} /> Refresh PR
        </button>
        <a
          href={repository + "/pull/" + number}
          target="_blank"
          rel="noreferrer"
        >
          Open on GitHub ↗
        </a>
      </div>
      <ErrorMessage error={error} />
      {!pull && !error && (
        <p role="status">Loading PR and checking its revision…</p>
      )}
      {pull && (
        <>
          <header>
            <span
              className={
                "gh-status " + (pull.merged_at ? "merged" : pull.state)
              }
            >
              {pull.merged_at ? "Merged" : pull.draft ? "Draft" : pull.state} ·{" "}
              {pull.private ? "Private" : "Public"}
            </span>
            <h2>
              #{number} · {pull.title}
            </h2>
            <p>
              {pull.head?.label} → {pull.base?.label}
            </p>
            <code>Head {pull.head?.sha}</code>
            <small>
              Checked {dateStamp(pull.checked_at)}. GitHub data stays in this
              viewer until you explicitly share code.
            </small>
          </header>
          <MD>{pull.body || "No description."}</MD>
          <button onClick={status} disabled={busy}>
            Load checks for this commit
          </button>
          {checks && (
            <div className="gh-checks">
              <h3>Checks · {checks.state}</h3>
              {checks.runs.map((r) => (
                <p key={r.id}>
                  <span className={"gh-dot " + (r.conclusion || r.status)} />
                  {r.name} · {r.conclusion || r.status}
                </p>
              ))}
              {checks.statuses.map((r) => (
                <p key={r.id}>
                  <span className={"gh-dot " + r.state} />
                  {r.context} · {r.state}
                </p>
              ))}
              {!checks.runs.length && !checks.statuses.length && (
                <p>No checks reported for this commit.</p>
              )}
              {checks.truncated && (
                <p>
                  Showing the first page of checks; open GitHub for the complete
                  list.
                </p>
              )}
            </div>
          )}
          <h3>Changed files · {pull.changed_files}</h3>
          <div className="gh-files">
            {files?.data.map((f) => (
              <button
                key={f.filename}
                disabled={busy}
                aria-pressed={chosen === f.filename}
                onClick={() => file(f.filename)}
              >
                <span>{f.filename}</span>
                <small>
                  +{f.additions} −{f.deletions} · {f.status}
                </small>
              </button>
            ))}
          </div>
          <Pager page={page} hasNext={files?.has_next} onPage={setPage} />
          {patch && (
            <section className="gh-diff" aria-label="GitHub diff">
              {onReview && !patch.reason && (
                <div className="gh-notice">
                  <p>
                    Select complete changes to copy into a Devdevian review
                    draft. Publication requires an explicit audience and
                    confirmation.
                  </p>
                  <div className="gh-actions">
                    <label>
                      From hunk
                      <input
                        aria-label="From GitHub hunk"
                        type="number"
                        min="1"
                        max={patch.hunks.length}
                        value={hunkStart}
                        onChange={(e) => setHunkStart(Number(e.target.value))}
                      />
                    </label>
                    <label>
                      To hunk
                      <input
                        aria-label="To GitHub hunk"
                        type="number"
                        min="1"
                        max={patch.hunks.length}
                        value={hunkEnd}
                        onChange={(e) => setHunkEnd(Number(e.target.value))}
                      />
                    </label>
                    <button
                      onClick={() => {
                        try {
                          const selected = selectPRHunks(
                            {
                              pull: {
                                repository,
                                url: repository + "/pull/" + number,
                                number,
                                commit: pull.head.sha,
                                base_commit: pull.base.sha,
                                head_ref: pull.head.ref,
                                fetched_at: pull.checked_at,
                                private: pull.private,
                              },
                              file: {
                                path: chosen,
                                previous_path: fileData.previous_filename,
                                status: fileData.status,
                                additions: fileData.additions,
                                deletions: fileData.deletions,
                              },
                              patch,
                            },
                            hunkStart,
                            hunkEnd,
                          );
                          onReview(selected);
                        } catch (e) {
                          setError(e.message);
                        }
                      }}
                    >
                      Prepare code review
                    </button>
                  </div>
                </div>
              )}

              <h3>{chosen}</h3>
              {patch.reason ? (
                <p>{patch.reason}</p>
              ) : (
                patch.hunks.map((h, i) => (
                  <pre key={i}>
                    {h.lines.map((line, n) => (
                      <span
                        className={
                          line.startsWith("+")
                            ? "added"
                            : line.startsWith("-")
                              ? "removed"
                              : line.startsWith("@@")
                                ? "hunk"
                                : ""
                        }
                        key={n}
                      >
                        {line}
                        {"\n"}
                      </span>
                    ))}
                  </pre>
                ))
              )}
            </section>
          )}
        </>
      )}
    </section>
  );
}
export function GitHubHub({ user, requireUser, project = null, onReview }) {
  const [repository, setRepository] = useState(""),
    [importURL, setImportURL] = useState(null),
    [input, setInput] = useState(""),
    [repo, setRepo] = useState(null),
    [installations, setInstallations] = useState(null),
    [installation, setInstallation] = useState(null),
    [repos, setRepos] = useState(null),
    [repoPage, setRepoPage] = useState(1),
    [instPage, setInstPage] = useState(1),
    [rows, setRows] = useState(null),
    [section, setSection] = useState("pulls"),
    [page, setPage] = useState(1),
    [number, setNumber] = useState(null),
    [error, setError] = useState(""),
    [epoch, setEpoch] = useState(0),
    [binding, setBinding] = useState(null);
  useEffect(() => {
    if (!user || !project) return;
    const c = new AbortController();
    api(`/projects/${project.id}/github`, { signal: c.signal })
      .then((d) => {
        setBinding(d.binding);
        if (d.binding) {
          setRepository(d.binding.repository);
          setInput(d.binding.repository);
        }
      })
      .catch((e) => {
        if (!c.signal.aborted && e.status !== 503) setError(e.message);
      });
    return () => c.abort();
  }, [project?.id, user?.id]);
  useEffect(() => {
    if (!user) return;
    const c = new AbortController();
    api(`/github/installations?page=${instPage}`, { signal: c.signal })
      .then(setInstallations)
      .catch(() => {});
    return () => c.abort();
  }, [user?.id, instPage, epoch]);
  useEffect(() => {
    if (!installation) return;
    const c = new AbortController();
    api(`/github/installations/${installation}/repositories?page=${repoPage}`, {
      signal: c.signal,
    })
      .then(setRepos)
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      });
    return () => c.abort();
  }, [installation, repoPage, epoch]);
  useEffect(() => {
    if (!repository) return;
    const c = new AbortController();
    setError("");
    setRows(null);
    setRepo(null);
    Promise.all([
      api("/github/repository?" + new URLSearchParams({ repository }), {
        signal: c.signal,
      }),
      api(
        query(
          "/repos" +
            new URL(repository).pathname +
            `/${section}?per_page=20&page=${page}&state=open&sort=updated&direction=desc`,
        ),
        { signal: c.signal },
      ),
    ])
      .then(([r, list]) => {
        if (!c.signal.aborted) {
          setRepo(r);
          setRows(list);
        }
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      });
    return () => c.abort();
  }, [repository, section, page, epoch]);
  useEffect(() => {
    if (!repository || !repo) return;
    const c = new AbortController();
    let running = false;
    const timer = setInterval(async () => {
      if (document.hidden || running) return;
      running = true;
      try {
        const fresh = await api(
          "/github/repository?" + new URLSearchParams({ repository }),
          { signal: c.signal },
        );
        if (fresh.generation !== repo.generation) setEpoch((n) => n + 1);
      } catch (e) {
        if (!c.signal.aborted && [403, 404, 409].includes(e.status)) {
          setNumber(null);
          setRepo(null);
          setRows(null);
          setError(e.message);
        }
      } finally {
        running = false;
      }
    }, 45000);
    return () => {
      clearInterval(timer);
      c.abort();
    };
  }, [repository, repo?.generation]);
  async function bind() {
    setError("");
    try {
      await api(`/projects/${project.id}/github`, {
        method: "POST",
        body: { repository, expected_version: binding?.version || 0 },
      });
      const d = await api(`/projects/${project.id}/github`);
      setBinding(d.binding);
    } catch (e) {
      setError(e.message);
    }
  }
  const choose = (value) => {
    const canonical = githubRepository(value);
    if (!canonical) {
      setError("Use https://github.com/owner/repository.");
      return;
    }
    setRepository(canonical);
    setInput(canonical);
    setPage(1);
    setNumber(null);
  };
  if (!user)
    return (
      <section className="github-hub">
        <h2>Bring your repository into the conversation.</h2>
        <p>Sign in to connect your GitHub workspace.</p>
        <button
          className="button primary"
          onClick={() => requireUser?.(() => {})}
        >
          Sign in
        </button>
      </section>
    );
  return (
    <section className="github-hub" aria-label="GitHub workspace">
      <header className="gh-hero">
        <Github size={30} />
        <div>
          <span className="eyebrow">CODE · CONTEXT · COLLABORATION</span>
          <h2>Your repository. A shared next step.</h2>
          <p>
            Pull requests, issues, checks and exact changes beside your
            Devdevian work.
          </p>
        </div>
      </header>
      <GitHubConnection />
      {importURL && (
        <GitHubWorkDialog
          project={project}
          initialURL={importURL}
          close={() => setImportURL(null)}
        />
      )}
      <ErrorMessage error={error} />
      {!number ? (
        <>
          <form
            className="gh-repo-form"
            onSubmit={(e) => {
              e.preventDefault();
              choose(input);
            }}
          >
            <label>
              Repository URL
              <input
                aria-label="GitHub repository URL"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="https://github.com/owner/repository"
                maxLength={250}
              />
            </label>
            <button className="button primary">Open repository</button>
          </form>
          {installations && (
            <details>
              <summary>Choose from installed repositories</summary>
              <div className="gh-actions">
                {installations.items.map((i) => (
                  <button
                    key={i.id}
                    onClick={() => {
                      setInstallation(i.id);
                      setRepoPage(1);
                    }}
                  >
                    {i.account}
                    {i.suspended ? " · Suspended" : ""}
                  </button>
                ))}
              </div>
              <Pager
                page={instPage}
                hasNext={installations.has_next}
                onPage={setInstPage}
              />
              {repos && (
                <>
                  <div className="gh-files">
                    {repos.items.map((r) => (
                      <button key={r.id} onClick={() => choose(r.repository)}>
                        {r.name} · {r.private ? "Private" : "Public"}
                      </button>
                    ))}
                  </div>
                  <Pager
                    page={repoPage}
                    hasNext={repos.has_next}
                    onPage={setRepoPage}
                  />
                </>
              )}
            </details>
          )}
          {repo && (
            <>
              <div className="gh-repository">
                <GitBranch size={22} />
                <div>
                  <h3>{repo.name}</h3>
                  <p>{repo.description}</p>
                  <small>
                    {repo.private
                      ? "Private · Your GitHub access is checked on every read"
                      : "Public"}{" "}
                    · {repo.default_branch}
                    {repo.updated_at
                      ? " · Repository event " + dateStamp(repo.updated_at)
                      : ""}
                  </small>
                </div>
              </div>
              {project?.user_id === user.id && (
                <div className="gh-notice">
                  <p>
                    {binding?.repository === repository
                      ? "Linked to this Devdevian project."
                      : "Link this repository to the project workspace."}
                  </p>
                  <button
                    disabled={binding?.repository === repository}
                    onClick={bind}
                  >
                    Confirm repository link
                  </button>
                  {repo.private && (
                    <small>
                      Private repositories require a private community project.
                      Other viewers still need their own GitHub authorization.
                    </small>
                  )}
                </div>
              )}
              <div className="gh-actions">
                <button
                  aria-pressed={section === "pulls"}
                  onClick={() => {
                    setSection("pulls");
                    setPage(1);
                  }}
                >
                  Pull requests
                </button>
                <button
                  aria-pressed={section === "issues"}
                  onClick={() => {
                    setSection("issues");
                    setPage(1);
                  }}
                >
                  Issues
                </button>
                <button onClick={() => setEpoch((n) => n + 1)}>
                  <RefreshCw size={15} /> Refresh
                </button>
              </div>
            </>
          )}
          {repository && !rows && !error && (
            <p role="status">Loading repository…</p>
          )}
          {rows && (
            <>
              <div className="gh-items">
                {rows.data.map((r) => (
                  <article key={r.id}>
                    <small>
                      #{r.number} · {r.state} · @{r.user?.login}
                    </small>
                    <h3>{r.title}</h3>
                    {section === "pulls" || r.pull_request ? (
                      <button onClick={() => setNumber(r.number)}>
                        <GitPullRequest size={15} /> Inspect pull request
                      </button>
                    ) : (
                      <>
                        <MD>{String(r.body || "").slice(0, 3000)}</MD>
                        {project && project.user_id === user.id && (
                          <button
                            onClick={() =>
                              setImportURL(repository + "/issues/" + r.number)
                            }
                          >
                            Import as room task
                          </button>
                        )}
                        <a
                          href={repository + "/issues/" + r.number}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open issue on GitHub ↗
                        </a>
                      </>
                    )}
                  </article>
                ))}
              </div>
              {!rows.data.length && (
                <p>
                  No open {section === "pulls" ? "pull requests" : "issues"} on
                  this page.
                </p>
              )}
              <Pager page={page} hasNext={rows.has_next} onPage={setPage} />
            </>
          )}
        </>
      ) : (
        <PRView
          repository={repository}
          number={number}
          generation={repo?.generation || 0}
          onReview={onReview}
          close={() => setNumber(null)}
        />
      )}
    </section>
  );
}
