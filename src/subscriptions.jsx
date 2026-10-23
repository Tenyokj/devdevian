import React, { useState, useEffect } from "react";
import { Bell, ArrowUpRight } from "lucide-react";
import { api } from "./data";
import { Empty, ErrorMessage } from "./ui";
import { Pagination } from "./content";
import { Select } from "./controls";
export function SubscriptionManager({ user, go, requireUser }) {
  const [query, setQuery] = useState(""),
    [search, setSearch] = useState(""),
    [kind, setKind] = useState(""),
    [page, setPage] = useState(1);
  const [data, setData] = useState(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [pending, setPending] = useState(null),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(query);
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);
  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    setData(null);
    const params = new URLSearchParams({ q: search, kind, page, limit: 12 });
    api("/subscriptions?" + params)
      .then((result) => {
        if (alive) {
          setData(result);
          setError("");
        }
      })
      .catch((e) => {
        if (alive) setError(e.message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [user?.id, search, kind, page, revision]);
  async function unfollow(item) {
    setPending(item.kind + ":" + item.item);
    try {
      await api(
        `/subscriptions/${item.kind}/${encodeURIComponent(item.item)}`,
        { method: "PUT", body: { following: false } },
      );
      setRevision((n) => n + 1);
    } catch (e) {
      setError(e.message);
    } finally {
      setPending(null);
    }
  }
  if (!user)
    return (
      <Empty
        icon={Bell}
        title="Your subscriptions, together."
        description="Sign in to manage the topics and conversations you follow."
        action="Sign in"
        onClick={() => requireUser(() => {})}
      />
    );
  return (
    <section className="subscription-manager">
      <div className="subscription-toolbar">
        <input
          className="local-search"
          aria-label="Search subscriptions"
          placeholder="Search your subscriptions…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <Select
          aria-label="Filter subscriptions"
          value={kind}
          onChange={(e) => {
            setKind(e.target.value);
            setPage(1);
          }}
          options={[
            { value: "", label: "All subscriptions" },
            { value: "topic", label: "Topics" },
            { value: "post", label: "Conversations" },
          ]}
        />
      </div>
      <ErrorMessage error={error} />
      {loading ? (
        <p role="status">Loading subscriptions…</p>
      ) : data?.length ? (
        <div className="subscription-list">
          {data.map((item) => (
            <article
              className="subscription-row"
              key={item.kind + ":" + item.item}
            >
              <div>
                <small>
                  {item.kind === "topic" ? "Topic" : "Conversation"}
                </small>
                <button
                  className="subscription-title"
                  disabled={!item.available}
                  onClick={() =>
                    go((item.kind === "topic" ? "tag/" : "post/") + item.item)
                  }
                >
                  {item.label}
                  {!!item.available && <ArrowUpRight size={15} />}
                </button>
                {!item.available && (
                  <span className="subscription-unavailable">
                    Removed or no longer accessible. You can still unfollow.
                  </span>
                )}
              </div>
              <button
                className="button secondary"
                disabled={pending !== null}
                onClick={() => unfollow(item)}
              >
                {pending === item.kind + ":" + item.item
                  ? "Removing…"
                  : "Unfollow"}
              </button>
            </article>
          ))}
        </div>
      ) : (
        !error && (
          <Empty
            icon={Bell}
            title={
              search || kind
                ? "No subscriptions match."
                : "Your next good conversation awaits."
            }
            description={
              search || kind
                ? "Try another search or filter."
                : "Follow a topic or conversation to find it here."
            }
            action="Explore the public feed"
            onClick={() => go("feed")}
          />
        )
      )}
      {!loading && (
        <Pagination
          meta={data?.pagination}
          onPage={setPage}
          label="subscriptions"
        />
      )}
      <p className="subscription-footnote">
        Unfollowing stops subscription alerts and removes this source from
        Following. Bookmarks and replies to your own posts are managed
        separately.
      </p>
    </section>
  );
}
