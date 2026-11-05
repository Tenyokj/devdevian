import React, { useEffect, useState } from "react";
import { Users } from "lucide-react";
import { api } from "./data";
import { Avatar, ErrorMessage } from "./ui";
import { Pagination } from "./content";
import "./project-contributors.css";
export function ProjectContributors({ projectId }) {
  const [data, setData] = useState(null),
    [error, setError] = useState(""),
    [page, setPage] = useState(1);
  useEffect(() => {
    const c = new AbortController();
    setData(null);
    setError("");
    api(`/projects/${projectId}/contributors?page=${page}`, {
      signal: c.signal,
    })
      .then((d) => {
        if (!c.signal.aborted) setData(d);
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      });
    return () => c.abort();
  }, [projectId, page]);
  return (
    <section className="project-contributors" aria-label="Project contributors">
      <header>
        <Users size={20} />
        <div>
          <h3>Contributors {data && <span>{data.pagination.total}</span>}</h3>
          <p>
            The people behind the work visible to you. Credits do not grant
            project access.
          </p>
        </div>
      </header>
      <ErrorMessage error={error} />
      {!data && !error && <p role="status">Loading contributors…</p>}
      <div className="contributor-grid">
        {data?.items.map((u) => (
          <a href={`#member/${u.id}`} key={u.id}>
            <Avatar name={u.name} userId={u.id} image={u.avatar} />
            <span>
              <strong>{u.name}</strong>
              <small>@{u.username}</small>
              <em>{u.roles.split(",").join(" · ")}</em>
            </span>
          </a>
        ))}
      </div>
      {data && !data.items.length && (
        <p>No public contributor profiles to show yet.</p>
      )}
      <Pagination
        meta={data?.pagination}
        label="contributors"
        onPage={setPage}
      />
    </section>
  );
}
