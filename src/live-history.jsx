import React, { useEffect, useState } from "react";
import { Radio, ArrowUpRight, RefreshCw, Users } from "lucide-react";
import { api, dateStamp } from "./data";
import { ErrorMessage, Empty } from "./ui";
import { UserName } from "./user-name";
import { Pagination } from "./content";
import { LiveLauncher } from "./live-launcher";
import "./live.css";
export function LiveHistory({ project, user, go }) {
  const [data, setData] = useState(null),
    [error, setError] = useState(""),
    [query, setQuery] = useState(""),
    [search, setSearch] = useState(""),
    [state, setState] = useState("all"),
    [page, setPage] = useState(1),
    [reload, setReload] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(query);
      setPage(1);
    }, 250);
    return () => clearTimeout(t);
  }, [query]);
  useEffect(() => {
    setData(null);
    setError("");
    if (!user) return;
    const c = new AbortController(),
      params = new URLSearchParams({ q: search, state, page });
    api((project ? `/projects/${project.id}/live` : "/live") + "?" + params, {
      signal: c.signal,
    })
      .then((r) => {
        if (!c.signal.aborted) setData(r);
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      });
    return () => c.abort();
  }, [project?.id, user?.id, search, state, page, reload]);
  return (
    <section className="live-history">
      <div className="live-history-heading">
        <div>
          <span className="eyebrow">SESSION HISTORY</span>
          <h2>
            {project
              ? "Work together. Keep the progress."
              : "Your sessions & invitations"}
          </h2>
          <p>
            Only sessions you are invited to appear here. Saved outcomes stay
            with their source conversation.
          </p>
        </div>
        <button
          className="icon-button"
          aria-label="Refresh sessions"
          onClick={() => setReload((v) => v + 1)}
        >
          <RefreshCw size={17} />
        </button>
      </div>
      {!user ? (
        <Empty
          title="Sign in to join Live"
          description="Your invitations and saved sessions will appear here."
        />
      ) : (
        <>
          <div className="live-history-filters">
            <label>
              Search sessions
              <input
                type="search"
                placeholder="Title or outcome…"
                value={query}
                maxLength={200}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <label>
              Session status
              <select
                value={state}
                onChange={(e) => {
                  setState(e.target.value);
                  setPage(1);
                }}
              >
                <option value="all">All sessions</option>
                <option value="open">Open sessions</option>
                <option value="saved">Saved sessions</option>
              </select>
            </label>
          </div>
          <ErrorMessage error={error} />
          {!data && !error && <p role="status">Loading sessions…</p>}
          {data?.items.length === 0 && (
            <Empty
              icon={Radio}
              title="No matching sessions yet"
              description="Start one from a conversation or ask a host for an invitation."
            />
          )}
          {data?.items.map((s) => (
            <a key={s.id} href={"#live/" + s.id} className="live-session-card">
              <Radio size={22} />
              <span>
                <strong>{s.title}</strong>
                <small>
                  <UserName userId={s.host_id}>{s.host_name}</UserName> ·{" "}
                  {s.closed_at ? "Saved" : "Open"} · {s.role} ·{" "}
                  {dateStamp(s.closed_at || s.created)}
                </small>
                <small>
                  {s.post_title} · <Users size={12} /> {s.participant_count}{" "}
                  participants
                </small>
                {s.summary && <p>{s.summary}</p>}
                {s.published_reply_id && (
                  <small>Outcome shared with the conversation</small>
                )}
              </span>
              <ArrowUpRight size={18} />
            </a>
          ))}
          <Pagination
            meta={data?.pagination}
            label="Live sessions"
            onPage={setPage}
          />
          {project && data?.can_create && (
            <LiveLauncher
              post={{ id: project.post_id, title: project.name }}
              user={user}
              go={go}
            />
          )}
        </>
      )}
    </section>
  );
}
