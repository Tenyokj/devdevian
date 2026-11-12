import React, { useEffect, useState } from "react";
import { Package, ArrowUpRight } from "lucide-react";
import { api } from "./data";
import { Empty, ErrorMessage } from "./ui";
import { Pagination } from "./content";

export function ProfileExtensions({ personId, own, go }) {
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    setPage(1);
  }, [personId]);
  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setError("");
    api(`/extensions/authors/${personId}?page=${page}`, {
      signal: controller.signal,
    })
      .then(setData)
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [personId, page]);
  return (
    <section aria-label={own ? "My extensions" : "Published extensions"}>
      <div className="extension-account-bar">
        <span>
          <Package size={18} />
          {own ? "My extensions" : "Published extensions"}
        </span>
        {own && (
          <button className="button secondary" onClick={() => go("extensions")}>
            Open extension library <ArrowUpRight size={15} />
          </button>
        )}
      </div>
      <ErrorMessage error={error} />
      {!data && !error && <p role="status">Loading extensions…</p>}
      {data &&
        (data.length ? (
          <div className="profile-list">
            {data.map((item) => (
              <button
                className="profile-list-item"
                key={item.id}
                onClick={() => go("extensions/" + item.id)}
              >
                <Package size={24} />
                <span>
                  <strong>{item.name}</strong>
                  <small>
                    v{item.version} ·{" "}
                    {item.review === "reviewed"
                      ? "Reviewed"
                      : "Community package"}
                  </small>
                  <p>{item.description}</p>
                </span>
                <ArrowUpRight size={17} />
              </button>
            ))}
          </div>
        ) : (
          <Empty
            icon={Package}
            title="Make this space your own."
            description={
              own
                ? "Your published extensions will appear here. Installed packages are in the extension library."
                : "This developer hasn’t published an extension yet."
            }
          />
        ))}
      {data && (
        <Pagination
          meta={data.pagination}
          onPage={setPage}
          label="published extensions"
        />
      )}
    </section>
  );
}
