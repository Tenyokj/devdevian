import React, { useState, useEffect, useCallback } from "react";
import {
  Search,
  ArrowUpRight,
  Hash,
  MessageSquare,
  FolderGit2,
  Users,
  UserRound,
} from "lucide-react";
import { Modal, Empty, ErrorMessage } from "./ui";
import { Select } from "./controls";
import { Pagination } from "./content";
import { api } from "./data";
export function GlobalSearch({ close, topics, onNavigate }) {
  const [q, setQ] = useState(""),
    [type, setType] = useState("posts"),
    [scope, setScope] = useState("all"),
    [topic, setTopic] = useState(""),
    [page, setPage] = useState(1),
    [items, setItems] = useState([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    setPage(1);
    return () => {
      alive = false;
    };
  }, [q, type, scope, topic]);
  useEffect(() => {
    let alive = true;
    if (q.trim().length < 2) {
      setItems([]);
      setBusy(false);
      return;
    }
    setBusy(true);
    const t = setTimeout(() => {
      const params = new URLSearchParams({
        q,
        type,
        scope,
        topic,
        page: String(page),
      });
      api("/search?" + params)
        .then((r) => {
          if (alive) {
            setItems(r);
            setError("");
          }
        })
        .catch((e) => alive && setError(e.message))
        .finally(() => alive && setBusy(false));
    }, 240);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q, type, scope, topic, page]);
  return (
    <Modal title="Explore Devdevian" onClose={close} wide>
      <div className="search-command">
        <Search size={24} />
        <input
          autoFocus
          placeholder="Ideas, questions, people, projects…"
          aria-label="Search all Devdevian"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <kbd>ESC</kbd>
      </div>
      <div className="search-categories">
        {[
          ["posts", "Conversations", MessageSquare],
          ["projects", "Projects", FolderGit2],
          ["communities", "Communities", Users],
          ["people", "People", UserRound],
        ].map(([key, label, Icon]) => (
          <button
            key={key}
            className={type === key ? "active" : ""}
            onClick={() => setType(key)}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>
      {["posts", "projects"].includes(type) && (
        <div className="search-filters">
          <Select
            aria-label="Filter search by topic"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            searchable
            options={[
              { value: "", label: "Every topic" },
              ...topics.map((t) => ({ value: t.id, label: t.name })),
            ]}
          />
          {type === "posts" && (
            <Select
              aria-label="Search visibility"
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              options={[
                { value: "all", label: "Everywhere I can access" },
                { value: "public", label: "Public feed" },
                { value: "private", label: "My private communities" },
              ]}
            />
          )}
        </div>
      )}
      <ErrorMessage error={error} />
      <div className="search-results" aria-live="polite" aria-busy={busy}>
        {q.trim().length < 2 ? (
          <div className="search-intro">
            <span className="search-orbit">
              <Hash size={32} />
            </span>
            <h3>Your next rabbit hole starts here.</h3>
            <p>Search across conversations, projects and your communities.</p>
            <div className="search-suggestions">
              {topics.slice(0, 4).map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    setQ(t.short || t.name);
                    setTopic(t.id);
                  }}
                >
                  # {t.short || t.name}
                </button>
              ))}
            </div>
          </div>
        ) : busy ? (
          <div className="search-loading">
            <span className="loading-dot" /> Finding your people and ideas…
          </div>
        ) : items.length ? (
          items.map((r) => (
            <button
              className="search-result"
              key={r.type + r.id}
              onClick={() => {
                onNavigate(
                  r.type === "project"
                    ? "post/" + r.post_id
                    : r.type === "person"
                      ? "member/" + r.id
                      : r.type === "community"
                        ? "community/" + r.id
                        : "post/" + r.id,
                );
                close();
              }}
            >
              <span className="search-result-icon">
                {r.type === "project" ? (
                  <FolderGit2 size={19} />
                ) : r.type === "community" ? (
                  <Users size={19} />
                ) : r.type === "person" ? (
                  <UserRound size={19} />
                ) : (
                  <MessageSquare size={19} />
                )}
              </span>
              <span>
                <strong>{r.title}</strong>
                <p>{r.excerpt}</p>
                <small>
                  {r.community_name
                    ? "Private · " + r.community_name
                    : r.type === "post"
                      ? "Public feed"
                      : r.type}
                </small>
              </span>
              <ArrowUpRight size={16} />
            </button>
          ))
        ) : (
          <Empty
            title="Nothing here yet."
            description="Try another word or broaden the filters."
          />
        )}
      </div>
      <Pagination
        meta={items.pagination}
        onPage={setPage}
        label="search results"
      />
      <div className="command-footer">
        <span>Only content you can access appears here</span>
        <span>⌘ K to search anywhere</span>
      </div>
    </Modal>
  );
}
