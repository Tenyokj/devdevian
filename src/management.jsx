import {
  Select,
  TaxonomyPicker,
  LinksEditor,
  MediaPicker,
  formObject,
  EntityLinks,
  Carousel,
  TeamEditor,
  MentionTextarea,
} from "./controls";
import { Pagination } from "./content";
import React, { useState, useEffect, useCallback } from "react";
import {
  Archive,
  RotateCcw,
  LockKeyhole,
  Flag,
  Check,
  CalendarDays,
  PenLine,
  Download,
  ArrowUpRight,
} from "lucide-react";
import { Modal, Empty, ErrorMessage, Field, MD, PageTitle } from "./ui";
import { api, dateOnly } from "./data";
export function PostControls({ post, user, refresh, toast }) {
  const [action, setAction] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const close = useCallback(() => setAction(null), []);
  const owner = user?.id === post.user_id,
    mod =
      !!post.can_moderate ||
      (!post.community_id && user?.platform_role === "moderator");
  return (
    <>
      <div className="conversation-lifecycle">
        {post.archived_at && (
          <span>
            <Archive size={14} />
            Archived by its author. New replies are closed; existing replies remain readable.
          </span>
        )}
        {post.locked_at && (
          <span>
            <LockKeyhole size={14} />
            Replies paused by a moderator: {post.lock_reason}
          </span>
        )}
        {post.removed_at && (
          <span>
            Hidden by moderation · visible to its author and moderators only.
          </span>
        )}
        {(owner || mod) && (
          <div className="lifecycle-actions">
            {owner && (
              <button
                onClick={() => {
                  setError("");
                  setAction(post.archived_at ? "restore" : "archive");
                }}
              >
                {post.archived_at ? (
                  <RotateCcw size={13} />
                ) : (
                  <Archive size={13} />
                )}{" "}
                {post.archived_at
                  ? "Restore conversation"
                  : "Archive conversation"}
              </button>
            )}
            {mod && (
              <button
                onClick={() => {
                  setError("");
                  setAction(post.removed_at ? "unremove" : "remove");
                }}
              >
                <Flag size={13} />
                {post.removed_at ? "Restore visibility" : "Remove spam"}
              </button>
            )}
            {mod && (
              <button
                onClick={() => {
                  setError("");
                  setAction(post.locked_at ? "unlock" : "lock");
                }}
              >
                <LockKeyhole size={13} />
                {post.locked_at ? "Unpause replies" : "Pause replies"}
              </button>
            )}
          </div>
        )}
      </div>
      {action && (
        <Modal title="Manage conversation" onClose={close}>
          <h2>
            {
              {
                remove: "Hide this conversation from members?",
                unremove: "Restore this conversation’s visibility?",
                archive: "Put this conversation on the shelf?",
                restore: "Pick up where you left off?",
                lock: "Pause new replies?",
                unlock: "Open the conversation again?",
              }[action]
            }
          </h2>
          <p className="modal-description">
            {action === "archive"
              ? "Archiving stops new replies. The conversation and existing replies stay readable, and you can restore it later. It does not delete the post or remove it from the feed."
              : action === "restore"
                ? "Restore this conversation to allow new replies again. Any separate moderator restriction will still apply."
                : "Moderator restrictions can be reversed by a moderator. Hiding limits visibility to the author and moderators; pausing only stops new replies."}
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              try {
                await api(`/posts/${post.id}/lifecycle`, {
                  method: "POST",
                  body: {
                    action,
                    reason: new FormData(e.currentTarget).get("reason") || "",
                  },
                });
                await refresh();
                setAction(null);
                toast(action === "archive"
                  ? "Conversation archived. New replies are closed."
                  : action === "restore"
                    ? "Conversation restored. New replies are open unless paused by a moderator."
                    : "Conversation settings updated.");
              } catch (e) {
                setError(e.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {["lock", "remove"].includes(action) && (
              <Field label="Reason">
                <textarea
                  name="reason"
                  required
                  minLength={5}
                  maxLength={1000}
                  rows={3}
                />
              </Field>
            )}
            <ErrorMessage error={error} />
            <button className="button primary full" disabled={busy}>
              {busy ? "Saving…" : "Confirm " + action}
              <Check size={15} />
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
export function EventControls({ event, user, onEdit, onChange }) {
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const close = useCallback(() => setOpen(false), []);
  const owner = event.user_id === user?.id;
  return (
    <>
      <div className="event-management">
        <a href={`/api/events/${event.id}/calendar`} download>
          <Download size={13} />
          Calendar .ics
        </a>
        {owner && (
          <>
            <button onClick={onEdit}>
              <PenLine size={13} />
              Edit
            </button>
            <button
              onClick={() => {
                setOpen(true);
                setError("");
              }}
            >
              {event.cancelled_at ? (
                <RotateCcw size={13} />
              ) : (
                <Archive size={13} />
              )}{" "}
              {event.cancelled_at ? "Restore" : "Cancel event"}
            </button>
          </>
        )}
      </div>
      {open && (
        <Modal title="Manage your event" onClose={close}>
          <h2>
            {event.cancelled_at
              ? "Put it back on the calendar?"
              : "A change of plans?"}
          </h2>
          <p className="modal-description">
            {event.cancelled_at
              ? "Registered attendees will be notified. The start time must still be in the future."
              : "The event stays in the history, registration and meeting access close, and registered attendees receive an in-app notification."}
          </p>
          <ErrorMessage error={error} />
          <button
            className="button primary full"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onChange(event.cancelled_at ? "restore" : "cancel");
                setOpen(false);
              } catch (e) {
                setError(e.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy
              ? "Saving…"
              : event.cancelled_at
                ? "Restore event"
                : "Confirm cancellation"}
            <CalendarDays size={15} />
          </button>
        </Modal>
      )}
    </>
  );
}
export function Moderation({ user, go, scope = "all" }) {
  const [data, setData] = useState(null),
    [error, setError] = useState(""),
    [filter, setFilter] = useState("open"),
    [selected, setSelected] = useState(null),
    [busy, setBusy] = useState(false),
    [decision, setDecision] = useState("resolved"),
    [success, setSuccess] = useState("");
  const close = useCallback(() => setSelected(null), []);
  const [page, setPage] = useState(1),
    [logPage, setLogPage] = useState(1);
  const load = useCallback(async () => {
    try {
      setData(
        await api(
          `/moderation/reports?page=${page}&filter=${filter}&log_page=${logPage}&scope=${scope}`,
        ),
      );
      setError("");
    } catch (e) {
      setError(e.message);
    }
  }, [page, filter, logPage, scope]);
  useEffect(() => {
    if (user?.can_moderate || user?.platform_role === "moderator") load();
  }, [user?.id, user?.platform_role, user?.can_moderate, load]);
  if (!user?.can_moderate && user?.platform_role !== "moderator")
    return (
      <Empty
        icon={LockKeyhole}
        title="This space is for moderators."
        description="Your profile’s job title doesn’t grant moderation permissions."
      />
    );
  return (
    <>
      <PageTitle
        eyebrow="A LITTLE CARE GOES A LONG WAY"
        title="Keep the conversation useful."
        description={
          scope === "public"
            ? "Public feed reports · handled only by the Devdevian moderation team."
            : "Private community reports · handled by that community’s owner and appointed validators."
        }
      />
      <ErrorMessage error={error} />
      {success && (
        <p className="form-success" role="status">
          {success}
        </p>
      )}
      <div className="feed-tabs">
        {["open", "reviewed"].map((t) => (
          <button
            key={t}
            className={filter === t ? "selected" : ""}
            onClick={() => {
              setFilter(t);
              setPage(1);
            }}
          >
            {t === "open" ? "Needs review" : "Reviewed"}
          </button>
        ))}
      </div>
      {!data && error ? (
        <Empty
          title="Couldn’t load the review queue."
          description={error}
          action="Try again"
          onClick={load}
        />
      ) : !data ? (
        <div className="loading-state">
          <span className="spinner" />
          Loading reports…
        </div>
      ) : (
        <>
          <div className="report-list">
            {data.items
              .filter((r) =>
                filter === "open" ? r.status === "open" : r.status !== "open",
              )
              .map((r) => (
                <article className="report-card" key={r.id}>
                  <span className="eyebrow">
                    REPORT #{r.id} · {r.status.toUpperCase()}
                  </span>
                  <h3>{r.post_title}</h3>
                  <p className="report-assignment">
                    {r.community_id
                      ? "Assigned to: " +
                        r.community_name +
                        " · owner and validators"
                      : "Assigned to: Devdevian moderation team"}
                  </p>
                  <p>{r.reason}</p>
                  <small>
                    Reported by {r.reporter_name} · Author: {r.author_name} ·{" "}
                    {dateOnly(r.created)}
                  </small>
                  {r.review_note && (
                    <div className="form-note">Decision: {r.review_note}</div>
                  )}
                  <div className="report-actions">
                    <button
                      className="text-button"
                      onClick={() => go("post/" + r.post_id)}
                    >
                      Open conversation
                      <ArrowUpRight size={14} />
                    </button>
                    {r.status === "open" && (
                      <button
                        className="button secondary compact"
                        onClick={() => {
                          setSelected(r);
                          setDecision("resolved");
                          setError("");
                        }}
                      >
                        Review report
                        <Flag size={13} />
                      </button>
                    )}
                  </div>
                </article>
              ))}
          </div>
          {!data.items.some((r) =>
            filter === "open" ? r.status === "open" : r.status !== "open",
          ) && (
            <Empty
              icon={Flag}
              title={
                filter === "open"
                  ? "No reports waiting for review."
                  : "No reviewed reports yet."
              }
              description="Submitted reports appear here. Every decision needs a written explanation."
            />
          )}
          <Pagination meta={data.pagination} label="reports" onPage={setPage} />
          <section className="moderation-history">
            <h2>Action history</h2>
            {data.log.length ? (
              data.log.map((entry) => (
                <div key={entry.id}>
                  <span>
                    <strong>{entry.actor_name}</strong> ·{" "}
                    {entry.action.replaceAll("_", " ")}
                    <small>
                      {entry.post_title}
                      {entry.reason ? " — " + entry.reason : ""}
                    </small>
                  </span>
                  <span>{dateOnly(entry.created)}</span>
                </div>
              ))
            ) : (
              <p>No actions recorded yet.</p>
            )}
            <Pagination
              meta={data.log_pagination}
              label="actions"
              onPage={setLogPage}
            />
          </section>
        </>
      )}
      {selected && (
        <Modal title="Review report" onClose={close} wide>
          <h2>{selected.post_title}</h2>
          <p className="modal-description">Report: {selected.reason}</p>
          <details className="report-context">
            <summary>Read the reported publication</summary>
            <MD>{selected.post_body}</MD>
          </details>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              const fields = new FormData(e.currentTarget);
              try {
                await api(`/moderation/reports/${selected.id}`, {
                  method: "PATCH",
                  body: {
                    status: decision === "dismissed" ? "dismissed" : "resolved",
                    note: fields.get("note"),
                    lock: decision === "pause",
                    remove: decision === "hide",
                  },
                });
                await load();
                setSelected(null);
                setSuccess(
                  decision === "hide"
                    ? "Report resolved. Publication hidden and decision saved in the action history."
                    : decision === "pause"
                      ? "Report resolved. New replies paused."
                      : "Decision recorded. The publication stays visible. See Reviewed and Action history.",
                );
              } catch (e) {
                setError(e.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field label="Decision">
              <Select
                value={decision}
                onChange={(e) => setDecision(e.target.value)}
              >
                <option value="resolved">
                  Resolve · record decision, keep publication visible
                </option>
                <option value="pause">Resolve · pause new replies</option>
                <option value="hide">Resolve · hide spam publication</option>
                <option value="dismissed">Dismiss · no issue found</option>
              </Select>
            </Field>
            <Field label="Explain your decision">
              <textarea
                name="note"
                required
                minLength={5}
                maxLength={1000}
                rows={3}
              />
            </Field>
            <ErrorMessage error={error} />
            <button className="button primary full" disabled={busy}>
              {busy ? "Saving…" : "Save decision"}
              <Check size={15} />
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
