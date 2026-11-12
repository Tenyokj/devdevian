import React, { useState, useEffect } from "react";
import { ShieldCheck, LockKeyhole, ExternalLink } from "lucide-react";
import { api, dateTime } from "./data";
import { PageTitle, Empty, ErrorMessage, MD } from "./ui";
import { Pagination } from "./content";
import { Moderation } from "./management";
import "./platform-moderation.css";
export function PlatformModeration({ user, go }) {
  const [tab, setTab] = useState("extensions"),
    [filter, setFilter] = useState("unreviewed"),
    [page, setPage] = useState(1),
    [data, setData] = useState(null),
    [selected, setSelected] = useState(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [note, setNote] = useState(""),
    [ack, setAck] = useState(false),
    [query, setQuery] = useState(""),
    [search, setSearch] = useState("");
  const allowed = user?.is_platform_owner;
  async function load() {
    setError("");
    setData(
      await api(
        tab === "extensions"
          ? `/platform/extensions?filter=${filter}&page=${page}`
          : `/platform/content?page=${page}&q=${encodeURIComponent(search)}`,
      ),
    );
  }
  useEffect(() => {
    if (!allowed || tab === "reports") return;
    let alive = true;
    setData(null);
    api(
      tab === "extensions"
        ? `/platform/extensions?filter=${filter}&page=${page}`
        : `/platform/content?page=${page}&q=${encodeURIComponent(search)}`,
    )
      .then((x) => alive && setData(x))
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [allowed, tab, filter, page, search]);
  const open = async (id) => {
    try {
      setSelected(await api("/platform/extensions/" + id));
      setNote("");
      setAck(false);
      setError("");
    } catch (e) {
      setError(e.message);
    }
  };
  async function decide(status) {
    setBusy(true);
    try {
      await api("/extensions/releases/" + selected.release.id + "/review", {
        method: "PATCH",
        body: {
          status,
          note,
          digest: selected.security.digest,
          expected_review: selected.release.review,
          expected_revision: selected.review_revision,
          acknowledge_sources: ack,
        },
      });
      setNotice(
        "Decision recorded for this exact version. Withdrawal disables installs; open clients refresh within about 60 seconds.",
      );
      await open(selected.release.id);
      await load();
      window.dispatchEvent(new Event("devdevian-extensions"));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function reviewReport(id, status) {
    setBusy(true);
    try {
      await api("/platform/extension-reports/" + id, {
        method: "PATCH",
        body: { status, note },
      });
      await open(selected.release.id);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function lifecycle(item, action) {
    const reason = window.prompt("Moderation reason (5–1,000 characters)");
    if (!reason) return;
    setBusy(true);
    try {
      await api(`/posts/${item.id}/lifecycle`, {
        method: "POST",
        body: { action, reason },
      });
      await load();
      setNotice("Public content decision recorded in the moderation log.");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  if (!allowed)
    return (
      <Empty
        icon={LockKeyhole}
        title="Owner access only"
        description="This page is available only to the configured, verified platform owner."
      />
    );
  return (
    <section className="platform-console">
      <PageTitle
        eyebrow="PLATFORM OWNER"
        title="Trust is a decision."
        description="Public forum moderation and exact-version extension reviews. Private communities are excluded. Extensions are suspended on this page."
      />
      <div className="feed-tabs">
        {[
          ["extensions", "Extension reviews"],
          ["content", "Public content"],
          ["reports", "Public reports & log"],
        ].map(([key, label]) => (
          <button
            key={key}
            className={tab === key ? "selected" : ""}
            onClick={() => {
              setTab(key);
              setPage(1);
              setSelected(null);
              setError("");
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <ErrorMessage error={error} />
      {notice && (
        <p className="form-success" role="status">
          {notice}
        </p>
      )}
      {tab === "reports" ? (
        <Moderation user={user} go={go} scope="public" />
      ) : (
        <>
          {tab === "extensions" ? (
            <label>
              Review queue
              <select
                aria-label="Review queue"
                value={filter}
                onChange={(e) => {
                  setFilter(e.target.value);
                  setPage(1);
                }}
              >
                {["unreviewed", "reported", "reviewed", "withdrawn"].map(
                  (v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ),
                )}
              </select>
            </label>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setSearch(query);
                setPage(1);
              }}
            >
              <label>
                Search public content
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              <button className="button">Search</button>
            </form>
          )}
          {data?.items.length === 0 && <p>No items in this queue.</p>}
          <div className="platform-items">
            {data?.items.map((item) => (
              <article key={item.id}>
                <div>
                  <h3>{item.name || item.title}</h3>
                  <p>
                    {tab === "extensions"
                      ? `v${item.version} · @${item.author.username || item.author.name} · ${item.review}`
                      : `By ${item.author_name} · ${item.removed_at ? "Hidden" : "Visible"} · ${item.locked_at ? "Replies paused" : "Replies open"}`}
                  </p>
                  {item.security?.warnings.map((w) => (
                    <p className={"security-signal " + w.severity} key={w.code}>
                      {w.message}
                    </p>
                  ))}
                </div>
                {tab === "extensions" ? (
                  <button className="button" onClick={() => open(item.id)}>
                    Inspect version
                  </button>
                ) : (
                  <div className="platform-actions">
                    <a className="button" href={"#post/" + item.id}>
                      Open conversation
                    </a>
                    <button
                      disabled={busy}
                      onClick={() =>
                        lifecycle(item, item.removed_at ? "unremove" : "remove")
                      }
                    >
                      {item.removed_at ? "Restore" : "Hide"}
                    </button>
                    <button
                      disabled={busy}
                      onClick={() =>
                        lifecycle(item, item.locked_at ? "unlock" : "lock")
                      }
                    >
                      {item.locked_at ? "Resume replies" : "Pause replies"}
                    </button>
                  </div>
                )}
              </article>
            ))}
          </div>
          <Pagination
            meta={data?.pagination}
            onPage={setPage}
            label="moderation queue"
          />
          {selected && tab === "extensions" && (
            <section
              className="platform-review"
              aria-label="Exact version review"
            >
              <h2>
                <ShieldCheck /> {selected.release.name} · v
                {selected.release.version}
              </h2>
              <p>
                Current state: <strong>{selected.release.review}</strong>
              </p>
              <p className="security-signal">{selected.security.disclaimer}</p>
              <p>
                Manifest SHA-256 <code>{selected.security.digest}</code>
              </p>
              <h3>Permissions & signals</h3>
              <ul>
                {(selected.release.manifest.permissions || []).map((p) => (
                  <li key={p}>
                    <code>{p}</code>
                  </li>
                ))}
              </ul>
              {selected.security.warnings.map((w) => (
                <p className={"security-signal " + w.severity} key={w.code}>
                  {w.message}
                </p>
              ))}
              {selected.security.signals.map((s, i) => (
                <p className="security-signal" key={i}>
                  <code>{s.file}</code>: {s.message}
                </p>
              ))}
              <h3>Publication</h3>
              <p>{selected.release.description}</p>
              <MD>{selected.release.listing?.full_description || ""}</MD>
              <div className="platform-actions">
                {selected.release.listing?.links?.map((l, i) => (
                  <a
                    key={i}
                    className="button"
                    href={l.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {l.label}
                    <ExternalLink size={14} />
                  </a>
                ))}
              </div>
              <h3>All package sources (never executed here)</h3>
              {Object.entries({
                ...selected.release.manifest.files,
                ...Object.fromEntries(
                  Object.entries(selected.release.manifest.styles || {}).map(
                    ([k, v]) => ["host-style:" + k, v],
                  ),
                ),
                ...(selected.release.manifest.kind === "theme"
                  ? {
                      "theme.json": JSON.stringify(
                        selected.release.manifest,
                        null,
                        2,
                      ),
                    }
                  : {}),
              }).map(([name, source]) => (
                <details key={name}>
                  <summary>{name}</summary>
                  <pre>
                    <code>{source}</code>
                  </pre>
                </details>
              ))}
              <label>
                Decision note
                <textarea
                  aria-label="Decision note"
                  value={note}
                  maxLength={400}
                  onChange={(e) => setNote(e.target.value)}
                />
              </label>
              <label className="platform-check">
                <input
                  type="checkbox"
                  checked={ack}
                  onChange={(e) => setAck(e.target.checked)}
                />
                I inspected every source file and the declared capabilities of
                this exact version.
              </label>
              <div className="platform-actions">
                <button
                  className="button primary"
                  disabled={busy || !ack || note.trim().length < 5}
                  onClick={() => decide("reviewed")}
                >
                  Mark reviewed
                </button>
                <button
                  className="button"
                  disabled={busy || note.trim().length < 5}
                  onClick={() => decide("unreviewed")}
                >
                  Revoke review
                </button>
                <button
                  className="button danger"
                  disabled={busy || note.trim().length < 5}
                  onClick={() => decide("withdrawn")}
                >
                  Withdraw & disable version
                </button>
              </div>
              <h3>Reports on this version</h3>
              {selected.reports.length === 0 && <p>No reports.</p>}
              {selected.reports.map((r) => (
                <article key={r.id}>
                  <p>{r.reason}</p>
                  <small>
                    {r.status} · {dateTime(r.created)}
                  </small>
                  {r.note && <p>{r.note}</p>}
                  {r.status === "open" && (
                    <div className="platform-actions">
                      <button
                        disabled={busy || note.trim().length < 5}
                        onClick={() => reviewReport(r.id, "resolved")}
                      >
                        Resolve report
                      </button>
                      <button
                        disabled={busy || note.trim().length < 5}
                        onClick={() => reviewReport(r.id, "dismissed")}
                      >
                        Dismiss report
                      </button>
                    </div>
                  )}
                </article>
              ))}
              <h3>Review decision history</h3>
              {selected.history.map((h, i) => (
                <p key={i}>
                  <strong>{h.status}</strong> · {dateTime(h.created)}
                  <br />
                  {h.note}
                </p>
              ))}
            </section>
          )}
        </>
      )}
    </section>
  );
}
