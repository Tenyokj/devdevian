import React, { useEffect, useRef, useState } from "react";
import { api, dateStamp } from "./data";
import { Modal, ErrorMessage, MD } from "./ui";
import { Pagination } from "./content";
import { SnapshotDialog } from "./review-versions";
import "./review-flow.css";
export const flowLabels = {
  pending: "Requested",
  accepted: "In review",
  declined: "Declined",
  cancelled: "Cancelled",
  completed: "Completed",
  changes_requested: "Changes requested",
  no_objections: "No objections",
};
function usePage(path, epoch = 0) {
  const [data, setData] = useState(null),
    [error, setError] = useState("");
  useEffect(() => {
    if (!path) {
      setData(null);
      setError("");
      return;
    }
    const c = new AbortController();
    setData(null);
    setError("");
    api(path, { signal: c.signal })
      .then((d) => {
        if (!c.signal.aborted) setData(d);
      })
      .catch((e) => {
        if (!c.signal.aborted)
          setError(
            [404, 503].includes(e.status)
              ? "Review Flow is not available on this server yet."
              : e.message,
          );
      });
    return () => c.abort();
  }, [path, epoch]);
  return { data, error };
}
// Every write has its own captured version and explicit preview. A failed
// request keeps the editor; it is never silently rebased or automatically sent.
export function FlowDialog({ plan, close, done }) {
  const [values, setValues] = useState(plan.values || {}),
    [preview, setPreview] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const draftKey = plan.draftKey;
  useEffect(() => {
    if (!draftKey) return;
    try {
      const saved = JSON.parse(sessionStorage.getItem(draftKey));
      if (
        Number.isFinite(saved?.saved) &&
        saved.saved <= Date.now() + 60000 &&
        saved.saved > Date.now() - 86400000 &&
        saved.values &&
        typeof saved.values === "object"
      )
        setValues((old) =>
          Object.fromEntries(
            Object.keys(old).map((k) => [
              k,
              typeof saved.values[k] === "string"
                ? saved.values[k].slice(0, 5000)
                : old[k],
            ]),
          ),
        );
    } catch {}
  }, [draftKey]);
  const change = (key, value) => {
    const next = { ...values, [key]: value };
    setValues(next);
    setPreview(false);
    if (draftKey)
      try {
        sessionStorage.setItem(
          draftKey,
          JSON.stringify({ saved: Date.now(), values: next }),
        );
      } catch {}
  };
  async function publish() {
    setBusy(true);
    setError("");
    try {
      await api(plan.url, {
        method: plan.method || "POST",
        body: {
          ...plan.payload,
          ...(plan.transform ? plan.transform(values) : values),
        },
      });
      if (draftKey)
        try {
          sessionStorage.removeItem(draftKey);
        } catch {}
      if (alive.current) done();
    } catch (e) {
      if (alive.current)
        setError(
          e.message +
            " Your draft is kept. Reload the review before preparing a new attempt.",
        );
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  return (
    <Modal
      title={plan.title}
      onClose={() => !busy && close()}
      dismissible={!busy}
      className="rf-dialog"
    >
      <h2>{plan.title}</h2>
      <p>{plan.context}</p>
      <p className="muted">
        Audience: {plan.audience}. This does not resolve remarks or accept a
        solution.
      </p>
      {!preview ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setPreview(true);
            setError("");
          }}
        >
          {plan.fields?.map((f) => (
            <label className="rf-field" key={f.key}>
              {f.label}
              {f.options ? (
                <select
                  aria-label={f.label}
                  value={values[f.key]}
                  onChange={(e) => change(f.key, e.target.value)}
                >
                  {f.options.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              ) : f.multiline ? (
                <textarea
                  aria-label={f.label}
                  required={f.required}
                  minLength={f.min || 0}
                  maxLength={f.max || 5000}
                  value={values[f.key]}
                  onChange={(e) => change(f.key, e.target.value)}
                  rows={4}
                />
              ) : (
                <input
                  aria-label={f.label}
                  required={f.required}
                  maxLength={f.max || 1000}
                  value={values[f.key]}
                  onChange={(e) => change(f.key, e.target.value)}
                />
              )}
            </label>
          ))}
          <button className="button primary">Preview change</button>
        </form>
      ) : (
        <section aria-label="Review Flow preview">
          <dl className="rf-preview">
            {Object.entries({
              ...plan.payload,
              ...(plan.transform ? plan.transform(values) : values),
            })
              .filter(
                ([key, value]) =>
                  ![
                    "expected_version",
                    "expected_revision",
                    "operation_key",
                  ].includes(key) && value !== "",
              )
              .map(([key, value]) => (
                <React.Fragment key={key}>
                  <dt>
                    {{
                      username: "Reviewer",
                      message: "Invitation context",
                      body: "Your explanation",
                      verdict: "Outcome",
                      action: "Action",
                      revision_id: "Assigned snapshot",
                      snapshot_id: "Newer snapshot",
                      review_id: "Earlier remark",
                    }[key] || key}
                  </dt>
                  <dd>
                    {key === "verdict"
                      ? flowLabels[value] || String(value)
                      : key === "action"
                        ? {
                            accept: "Accept review",
                            decline: "Decline review",
                            cancel: "Cancel request",
                          }[value] || String(value)
                        : String(value)}
                  </dd>
                </React.Fragment>
              ))}
          </dl>
          <div className="rf-actions">
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => setPreview(false)}
            >
              Back to editing
            </button>
            <button
              className="button primary"
              disabled={busy}
              onClick={publish}
            >
              {busy ? "Saving…" : "Confirm change"}
            </button>
          </div>
        </section>
      )}
      <ErrorMessage error={error} />
    </Modal>
  );
}
function requestActions(row, user, open, postOwner) {
  const base = {
    title: "",
    context: `Review request #${row.id} · revision v${row.revision_number}`,
    audience: row.community_id ? "Private community" : "Public conversation",
    url: `/posts/${row.post_id}/review-flow/${row.id}`,
    method: "PATCH",
    payload: { expected_version: row.version },
    values: {},
  };
  const action = (name, label) => (
    <button
      className="button secondary"
      key={name}
      onClick={() =>
        open({
          ...base,
          title: label,
          payload: { ...base.payload, action: name },
        })
      }
    >
      {label}
    </button>
  );
  return (
    <>
      {user?.id === row.reviewer_id &&
        row.state === "pending" &&
        action("accept", "Accept review")}
      {user?.id === row.reviewer_id &&
        ["pending", "accepted"].includes(row.state) &&
        action("decline", "Decline review")}
      {user?.id === postOwner &&
        ["pending", "accepted"].includes(row.state) &&
        action("cancel", "Cancel request")}
      {user?.id === row.reviewer_id && row.state === "accepted" && (
        <button
          className="button primary"
          onClick={() =>
            open({
              title: "Publish review outcome",
              context: base.context,
              audience: base.audience,
              url: base.url + "/outcome",
              payload: {
                expected_version: row.version,
                revision_id: row.snapshot_id,
              },
              draftKey: `devdevian-flow:${user.id}:outcome:${row.id}`,
              values: { verdict: "changes_requested", body: "" },
              fields: [
                {
                  key: "verdict",
                  label: "Review outcome",
                  options: [
                    ["changes_requested", "Changes requested"],
                    ["no_objections", "No objections"],
                  ],
                },
                {
                  key: "body",
                  label: "Outcome context",
                  multiline: true,
                  min: 2,
                  required: true,
                },
              ],
            })
          }
        >
          Share outcome
        </button>
      )}
    </>
  );
}
function RequestCard({ row, user, open, view, postOwner }) {
  return (
    <article className="rf-card">
      <div className="rf-row">
        <strong>@{row.reviewer_username}</strong>
        <span className={"rf-state rf-" + row.state}>
          {flowLabels[row.state]}
        </span>
      </div>
      <p>
        <a href={"#post/" + row.post_id}>{row.post_title}</a> · v
        {row.revision_number}
        {row.outdated ? " · Earlier revision" : ""}
      </p>
      {row.message && <p>{row.message}</p>}
      {row.verdict && (
        <div className="rf-outcome">
          <strong>
            {flowLabels[row.verdict]} · v{row.revision_number}
          </strong>
          <MD>{row.outcome_body}</MD>
        </div>
      )}
      <small>{dateStamp(row.updated_at)}</small>
      <div className="rf-actions">
        <button
          className="text-button"
          onClick={() => view({ postId: row.post_id, id: row.snapshot_id })}
        >
          View assigned code
        </button>
        {requestActions(row, user, open, postOwner)}
      </div>
    </article>
  );
}
export function ReviewFlowPanel({ post, user, refreshToken = 0, onAvailable }) {
  const [page, setPage] = useState(1),
    [reload, setReload] = useState(0),
    [dialog, setDialog] = useState(null),
    [view, setView] = useState(null),
    [linksPage, setLinksPage] = useState(1);
  const { data, error } = usePage(
    `/posts/${post.id}/review-flow?page=${page}`,
    reload + (post.revision || 0) + refreshToken,
  );
  const links = usePage(
    `/posts/${post.id}/revision-links?page=${linksPage}`,
    reload + (post.revision || 0) + refreshToken,
  );
  useEffect(() => {
    onAvailable?.(data?.capabilities?.review_flow === 1);
  }, [data?.capabilities?.review_flow, onAvailable]);
  if (!data)
    return error?.includes("not available") ? null : (
      <section className="rf-panel">
        <ErrorMessage error={error} />
        {!error && <p>Loading reviewers…</p>}
      </section>
    );
  const owner = user?.id === post.user_id,
    paused = post.archived_at || post.locked_at;
  const audience = post.community_id
    ? "Private community"
    : "Public conversation";
  function invite() {
    setDialog({
      title: "Request a reviewer",
      context:
        "Ask a public-profile member who already has access to review this exact code version.",
      audience,
      url: `/posts/${post.id}/review-flow`,
      payload: {
        revision_id: data.current_revision_id,
        expected_revision: data.post_revision,
      },
      draftKey: `devdevian-flow:${user.id}:invite:${post.id}:${data.current_revision_id}`,
      values: { username: "", message: "" },
      fields: [
        {
          key: "username",
          label: "Reviewer username",
          required: true,
          max: 30,
        },
        {
          key: "message",
          label: "Invitation context",
          multiline: true,
          max: 1000,
        },
      ],
    });
  }
  return (
    <section className="rf-panel" aria-label="Review Flow">
      <header className="rf-heading">
        <div>
          <span className="eyebrow">REVIEW FLOW</span>
          <h3>A person. A revision. A useful next step.</h3>
        </div>
        <a href="#review-flow">Waiting for me →</a>
      </header>
      <p className="muted">
        Requests and outcomes belong to their assigned version. Sharing another
        revision does not carry an earlier verdict forward.
      </p>
      {owner && !paused && (
        <div className="rf-actions">
          <button
            className="button secondary"
            disabled={!data.current_revision_id}
            onClick={invite}
          >
            Request a reviewer
          </button>
          <button
            className="text-button"
            onClick={() =>
              setDialog({
                title: "Link an addressed remark",
                context:
                  "An author-provided link to a newer retained revision. The remark stays open until explicitly resolved.",
                audience,
                url: `/posts/${post.id}/revision-links`,
                payload: {},
                draftKey: `devdevian-flow:${user.id}:link:${post.id}`,
                values: {
                  review_id: "",
                  snapshot_id: String(data.current_revision_id || ""),
                  body: "",
                },
                fields: [
                  {
                    key: "review_id",
                    label: "Earlier remark ID",
                    required: true,
                  },
                  {
                    key: "snapshot_id",
                    label: "Addressing snapshot ID",
                    required: true,
                  },
                  {
                    key: "body",
                    label: "What changed",
                    multiline: true,
                    max: 1500,
                  },
                ],
                numeric: ["review_id", "snapshot_id"],
              })
            }
          >
            Link revision to a remark
          </button>
        </div>
      )}
      <div className="rf-list">
        {data.items.map((row) => (
          <RequestCard
            key={row.id}
            row={row}
            user={paused ? null : user}
            open={setDialog}
            view={setView}
            postOwner={post.user_id}
          />
        ))}
        {!data.items.length && (
          <p>
            No named reviewers yet. Conversations remain open for ordinary
            feedback.
          </p>
        )}
      </div>
      <Pagination
        meta={data.pagination}
        label="review requests"
        onPage={setPage}
      />
      {!!links.data?.items?.length && (
        <div className="rf-links">
          <h4>Revisions linked to remarks</h4>
          {links.data.items.map((l) => (
            <div key={l.id}>
              <a href={`#post/${post.id}/review/${l.review_id}`}>
                Remark #{l.review_id}
              </a>{" "}
              →{" "}
              <button
                className="text-button"
                onClick={() => setView({ postId: post.id, id: l.snapshot_id })}
              >
                v{l.revision_number}
              </button>
              {l.body && <p>{l.body}</p>}
            </div>
          ))}
          <Pagination
            meta={links.data.pagination}
            label="revision links"
            onPage={setLinksPage}
          />
        </div>
      )}
      {dialog && (
        <NumericFlowDialog
          plan={dialog}
          close={() => setDialog(null)}
          done={() => {
            setDialog(null);
            setReload((n) => n + 1);
          }}
        />
      )}
      {view && (
        <SnapshotDialog
          postId={view.postId}
          snapshotId={view.id}
          currentId={data.current_revision_id}
          close={() => setView(null)}
        />
      )}
    </section>
  );
}
// Numeric IDs stay numbers on the wire, even though form fields are strings.
function NumericFlowDialog({ plan, ...props }) {
  const numeric = plan.numeric;
  if (!numeric) return <FlowDialog plan={plan} {...props} />;
  return (
    <FlowDialog
      plan={{
        ...plan,
        transform: (values) => ({
          ...values,
          ...Object.fromEntries(numeric.map((k) => [k, Number(values[k])])),
        }),
      }}
      {...props}
    />
  );
}
export function ReviewFlowQueue({ user, requireUser }) {
  const [section, setSection] = useState("waiting"),
    [page, setPage] = useState(1),
    [reload, setReload] = useState(0),
    [dialog, setDialog] = useState(null),
    [view, setView] = useState(null);
  const { data, error } = usePage(
    user ? `/review-flow?section=${section}&page=${page}` : null,
    reload,
  );
  if (!user)
    return (
      <section className="rf-panel">
        <h1>Waiting for me</h1>
        <p>Sign in to see review requests addressed to your account.</p>
        <button
          className="button primary"
          onClick={() => requireUser(() => {})}
        >
          Sign in
        </button>
      </section>
    );
  return (
    <section className="rf-panel">
      <span className="eyebrow">YOUR REVIEW FLOW</span>
      <h1>Waiting for me.</h1>
      <p>Named requests, exact code versions, and your next review.</p>
      <div className="rf-tabs">
        {[
          ["waiting", "Waiting"],
          ["accepted", "In review"],
          ["sent", "Sent"],
          ["completed", "History"],
        ].map(([key, label]) => (
          <button
            className={section === key ? "active" : ""}
            key={key}
            onClick={() => {
              setSection(key);
              setPage(1);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <ErrorMessage error={error} />
      {!data && !error && <p role="status">Loading review requests…</p>}
      {data && (
        <>
          <div className="rf-list">
            {data.items.map((row) => (
              <RequestCard
                key={row.id}
                row={row}
                user={row.archived_at || row.locked_at ? null : user}
                open={setDialog}
                view={setView}
                postOwner={row.requester_id}
              />
            ))}
            {!data.items.length && <p>No requests in this section.</p>}
          </div>
          <Pagination
            meta={data.pagination}
            label="assigned reviews"
            onPage={setPage}
          />
        </>
      )}
      {dialog && (
        <FlowDialog
          plan={dialog}
          close={() => setDialog(null)}
          done={() => {
            setDialog(null);
            setReload((n) => n + 1);
          }}
        />
      )}
      {view && (
        <SnapshotDialog
          postId={view.postId}
          snapshotId={view.id}
          close={() => setView(null)}
        />
      )}
    </section>
  );
}
export function ReviewProjectActivity({ projectId }) {
  const [page, setPage] = useState(1);
  const { data, error } = usePage(
    `/projects/${projectId}/review-activity?page=${page}`,
  );
  return (
    <section className="rf-panel" aria-label="Project review activity">
      <h2>Review activity.</h2>
      <p>Requests, revisions and review outcomes you have permission to see.</p>
      <ErrorMessage error={error} />
      {data?.items.map((e) => (
        <article className="rf-card" key={e.id}>
          <strong>
            {e.actor_name} · {flowLabels[e.type] || e.type.replaceAll("_", " ")}
          </strong>
          <p>
            <a href={"#post/" + e.post_id}>{e.post_title}</a>
            {e.revision_number ? " · v" + e.revision_number : ""}
          </p>
          <small>{dateStamp(e.created)}</small>
        </article>
      ))}
      {data && !data.items.length && <p>No visible review activity yet.</p>}
      <Pagination
        meta={data?.pagination}
        label="project review activity"
        onPage={setPage}
      />
    </section>
  );
}

export function RevisionAddressButton({
  post,
  user,
  remark,
  snapshotId,
  onLinked,
}) {
  const [open, setOpen] = useState(false);
  if (
    user?.id !== post.user_id ||
    !remark.outdated ||
    !remark.snapshot_available ||
    remark.deleted_at ||
    !snapshotId ||
    post.archived_at ||
    post.locked_at
  )
    return null;
  const plan = {
    title: `Address remark #${remark.id} in this revision`,
    context:
      "Link the current immutable revision to this earlier remark. Its resolution stays unchanged.",
    audience: post.community_id ? "Private community" : "Public conversation",
    url: `/posts/${post.id}/revision-links`,
    payload: { snapshot_id: snapshotId, review_id: remark.id },
    draftKey: `devdevian-flow:${user.id}:address:${remark.id}:${snapshotId}`,
    values: { body: "" },
    fields: [
      { key: "body", label: "What changed", multiline: true, max: 1500 },
    ],
  };
  return (
    <>
      <button className="text-button" onClick={() => setOpen(true)}>
        Address in current revision
      </button>
      {open && (
        <FlowDialog
          plan={plan}
          close={() => setOpen(false)}
          done={() => {
            setOpen(false);
            onLinked?.();
          }}
        />
      )}
    </>
  );
}
