import React, { useState, useEffect } from "react";
import { api } from "./data";
import { Modal, ErrorMessage, MD } from "./ui";
import { Pagination } from "./content";
export function ExtensionUpdates({ user, onChanged }) {
  const [items, setItems] = useState(null),
    [page, setPage] = useState(1),
    [pagination, setPagination] = useState(null),
    [selected, setSelected] = useState(null),
    [ack, setAck] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const load = () =>
    api("/extensions/updates?page=" + page).then((x) => {
      if(page>x.pagination.pages)setPage(x.pagination.pages);
      setItems(x.items);
      setPagination(x.pagination);
    });
  useEffect(() => {
    if (!user) return;
    let alive = true;
    api("/extensions/updates?page=" + page)
      .then((x) => {
        if (alive) {
          setItems(x.items);
          setPagination(x.pagination);
        }
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [user?.id, page]);
  const update = async () => {
    setBusy(true);
    setError("");
    try {
      await api("/extensions/update?format=2", {
        method: "POST",
        body: {
          from: selected.from.id,
          release: selected.to.id,
          acknowledge_update: true,
          acknowledge_unreviewed: true,
          granted_permissions: selected.to.permissions,
        },
      });
      await onChanged();
      await load();
      setSelected(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section aria-label="Extension updates" className="extension-updates">
      <h2>Updates, on your terms.</h2>
      <p>
        Installed versions stay pinned until you review and confirm a new one.
      </p>
      <ErrorMessage error={selected ? null : error} />
      {!items && !error && <p role="status">Checking versions…</p>}
      {items?.length === 0 && <p>All installed extensions are up to date.</p>}
      {items?.map((item) => (
        <article key={item.from.id}>
          <div>
            <strong>{item.to.name}</strong>
            <p>
              {item.from.version} → {item.to.version}
            </p>
            <small>
              {item.added_permissions.length
                ? `${item.added_permissions.length} new capabilities`
                : "No new capabilities"}{" "}
              · {item.files.length} changed files/styles
            </small>
          </div>
          <button
            className="button secondary"
            onClick={() => {
              setAck(false);
              setError("");
              setSelected(item);
            }}
          >
            Review update
          </button>
        </article>
      ))}
      <Pagination
        meta={pagination}
        onPage={setPage}
        label="extension updates"
      />
      {selected && (
        <Modal
          title={"Update " + selected.to.name}
          onClose={() => !busy && setSelected(null)}
          wide
        >
          <p className="modal-description">
            {selected.from.version} → {selected.to.version} ·{" "}
            {selected.to.review === "reviewed"
              ? "This version is reviewed"
              : "This version has not been reviewed"}
          </p>
          <ErrorMessage error={error} />
          <h3>What changed</h3>
          {selected.to.changelog ? (
            <MD>{selected.to.changelog}</MD>
          ) : (
            <p>The author did not include release notes.</p>
          )}
          <div className="extension-capability-diff">
            <section>
              <strong>Added capabilities</strong>
              <ul>
                {selected.added_permissions.map((p) => (
                  <li key={p}>
                    <code>{p}</code>
                  </li>
                ))}
              </ul>
              {!selected.added_permissions.length && <p>None.</p>}
            </section>
            <section>
              <strong>Removed capabilities</strong>
              <ul>
                {selected.removed_permissions.map((p) => (
                  <li key={p}>
                    <code>{p}</code>
                  </li>
                ))}
              </ul>
              {!selected.removed_permissions.length && <p>None.</p>}
            </section>
          </div>
          <h3>Changed files and host styles</h3>
          <ul>
            {selected.files.map((f) => (
              <li key={f.path}>
                <code>{f.path}</code> · {f.change}
              </li>
            ))}
          </ul>
          <a
            href={"/app#extensions/" + selected.to.id}
            target="_blank"
            rel="noreferrer"
          >
            Inspect the complete new package ↗
          </a>
          <label className="extension-trust">
            <input
              type="checkbox"
              checked={ack}
              onChange={(e) => setAck(e.target.checked)}
            />
            I reviewed this version and trust its code and every listed
            capability
            {selected.to.review !== "reviewed"
              ? ", including this unreviewed release"
              : ""}
            .
          </label>
          <p>
            Updating replaces this installed version. A disabled extension
            remains disabled. Personal extension storage stays on this device.
          </p>
          <button
            className="button primary"
            disabled={!ack || busy}
            onClick={update}
          >
            {busy ? "Updating…" : "Confirm update"}
          </button>
        </Modal>
      )}
    </section>
  );
}
export function ExtensionHistory({ slug, onOpen }) {
  const [items, setItems] = useState(null),
    [page, setPage] = useState(1),
    [pagination, setPagination] = useState(null),
    [page, setPage] = useState(1),
    [error, setError] = useState("");
  useEffect(() => {
    setPage(1);
  }, [slug]);
  useEffect(() => {
    const c = new AbortController();
    setItems(null);
    api(`/extensions/history/${slug}?page=${page}`, { signal: c.signal })
      .then(setItems)
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      });
    return () => c.abort();
  }, [slug, page]);
  return (
    <details className="extension-history">
      <summary>Version history</summary>
      <ErrorMessage error={error} />
      {items?.map((item) => (
        <article key={item.id}>
          <button className="text-button" onClick={() => onOpen(item.id)}>
            v{item.version} · {item.review}
          </button>
          {item.changelog ? (
            <MD>{item.changelog}</MD>
          ) : (
            <p>No release notes provided.</p>
          )}
        </article>
      ))}
      {items?.pagination?.pages > 1 && (
        <div>
          <button disabled={page === 1} onClick={() => setPage((x) => x - 1)}>
            Previous versions
          </button>
          <span>Page {page}</span>
          <button
            disabled={page >= items.pagination.pages}
            onClick={() => setPage((x) => x + 1)}
          >
            Older versions
          </button>
        </div>
      )}
    </details>
  );
}
