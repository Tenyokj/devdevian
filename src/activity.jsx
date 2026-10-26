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
import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Bell,
  CheckCheck,
  ArrowUpRight,
  MessageCircle,
  CheckCircle2,
  FolderGit2,
  RefreshCw,
  PenLine,
} from "lucide-react";
import { Modal, Avatar, Empty, Field, MD, ErrorMessage } from "./ui";
import { api, dateStamp } from "./data";

const messages = {
  event_updated: "updated an event you’re attending",
  event_cancelled: "cancelled an event you’re attending",
  event_restored: "restored an event you’re attending",
  reply: "replied to a conversation",
  feedback_reply: "added feedback to a code review",
  feedback_resolved: "resolved your code feedback",
  feedback_reopened: "reopened your code feedback",
  mention: "mentioned you in a conversation",
  topic_post: "started a conversation in a topic you follow",
  solution: "marked your answer as the solution",
  solution_edited: "updated an accepted answer",
  project_update: "shared a project update",
};
export function NotificationCenter({ user, onNavigate }) {
  const [open, setOpen] = useState(false),
    [data, setData] = useState({ items: [], unread_count: 0 }),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [pending, setPending] = useState(false);
  const [page, setPage] = useState(1);
  const enabled = user?.preferences?.notifications_enabled !== false;
  const alive = useRef(true),
    epoch = useRef(0);
  const refresh = useCallback(async () => {
    const request = ++epoch.current;
    try {
      const result = await api("/notifications?page=" + page);
      if (alive.current && request === epoch.current) {
        setData(result);
        setError("");
      }
    } catch (e) {
      if (alive.current && request === epoch.current) setError(e.message);
    } finally {
      if (alive.current) setLoading(false);
    }
  }, [page]);
  useEffect(() => {
    alive.current = true;
    if (enabled || open) refresh();
    const visible = () => {
      if ((enabled || open) && document.visibilityState !== "hidden") refresh();
    };
    const timer = setInterval(visible, 30000);
    document.addEventListener("visibilitychange", visible);
    return () => {
      alive.current = false;
      epoch.current++;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [refresh, enabled, open]);
  const close = useCallback(() => setOpen(false), []);
  async function read(item) {
    if (pending) return;
    setPending(true);
    epoch.current++;
    try {
      if (!item.read_at)
        await api(`/notifications/${item.id}/read`, {
          method: "PATCH",
          body: {},
        });
      await refresh();
      setOpen(false);
      onNavigate(
        item.event_id
          ? `events/${item.event_id}`
          : item.code_review_id
            ? `post/${item.post_id}/review/${item.code_review_id}${item.feedback_reply_id ? "/reply/" + item.feedback_reply_id : ""}`
            : `post/${item.post_id}${item.reply_id ? "/reply/" + item.reply_id : ""}`,
      );
    } catch (e) {
      setError(e.message);
    } finally {
      if (alive.current) setPending(false);
    }
  }
  async function allRead() {
    if (!data.items.length || pending) return;
    setPending(true);
    epoch.current++;
    try {
      await api("/notifications/read-all", {
        method: "PATCH",
        body: { through_id: data.latest_id || data.items[0].id },
      });
      await refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      if (alive.current) setPending(false);
    }
  }
  return (
    <>
      <button
        className="notification-toggle icon-button"
        aria-label={`Notifications${!enabled ? ", paused" : data.unread_count ? ", " + data.unread_count + " unread" : ""}`}
        title="Notifications"
        onClick={() => {
          setOpen(true);
          refresh();
        }}
      >
        <Bell size={18} />
        {enabled && data.unread_count > 0 && (
          <span className="notification-count">
            {data.unread_count > 99 ? "99+" : data.unread_count}
          </span>
        )}
      </button>
      {open && (
        <Modal title="Your notifications" onClose={close} wide>
          {!enabled && (
            <p className="form-note">
              New notifications are paused in Settings. Your existing history is
              kept here.
            </p>
          )}
          <div className="notification-title">
            <div>
              <h2>A little heads-up.</h2>
              <p className="modal-description">
                Answers, useful feedback, and progress worth coming back for.
              </p>
            </div>
            <button
              className="icon-button"
              aria-label="Refresh notifications"
              onClick={refresh}
            >
              <RefreshCw size={16} />
            </button>
          </div>
          <div className="notification-toolbar">
            <span>{data.unread_count} unread</span>
            <button onClick={allRead} disabled={pending || !data.unread_count}>
              <CheckCheck size={14} />
              Mark all read
            </button>
          </div>
          <ErrorMessage error={error} />
          {loading ? (
            <div className="loading-state">
              <span className="spinner" />
              Checking your activity…
            </div>
          ) : data.items.length ? (
            <div className="notification-list">
              {data.items.map((item) => (
                <button
                  className={
                    "notification-item " + (!item.read_at ? "unread" : "")
                  }
                  key={item.id}
                  onClick={() => read(item)}
                  disabled={pending}
                >
                  <Avatar name={item.actor_name} />
                  <span>
                    <strong>{item.actor_name}</strong>{" "}
                    {messages[item.type] || "shared an update"}
                    <b>{item.post_title}</b>
                    <small>{dateStamp(item.created)}</small>
                  </span>
                  {!item.read_at && <i className="unread-dot" />}
                  <ArrowUpRight size={15} />
                </button>
              ))}
            </div>
          ) : (
            <Empty
              icon={Bell}
              title="A quiet moment. Enjoy it."
              description="Replies to your posts, answers marked as solutions, and updates to projects you’ve joined will appear here."
            />
          )}
          <Pagination
            meta={data.pagination}
            label="notifications"
            onPage={setPage}
          />
          <p className="notification-footnote">
            Updates automatically while this tab is visible. No email or push
            notifications.
          </p>
        </Modal>
      )}
    </>
  );
}

export function EditContent({ content, reply = false, close, done }) {
  const [preview, setPreview] = useState(false),
    [body, setBody] = useState(content.body),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Modal
      title={reply ? "Edit your reply" : "Edit your conversation"}
      onClose={close}
      wide
    >
      <h2>A better way to put it.</h2>
      <p className="modal-description">
        Your original conversation and its replies stay together. Edited content
        is labeled.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          setBusy(true);
          try {
            await api(
              reply ? `/replies/${content.id}` : `/posts/${content.id}`,
              {
                method: "PATCH",
                body: {
                  ...formObject(e.currentTarget),
                  ...(!reply
                    ? {
                        repo_url:
                          content.kind === "review"
                            ? formObject(e.currentTarget).details?.links?.[0]
                                ?.url || ""
                            : content.repo_url || "",
                        demo_url:
                          content.kind === "showcase"
                            ? formObject(e.currentTarget).details?.links?.[0]
                                ?.url || ""
                            : content.demo_url || "",
                      }
                    : {}),
                  body,
                  revision: content.revision,
                },
              },
            );
            await done();
          } catch (e) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {!reply && (
          <>
            <Field label="Title">
              <input
                name="title"
                defaultValue={content.title}
                required
                minLength={5}
                maxLength={160}
              />
            </Field>
            <Field label="Tools & technologies">
              <TaxonomyPicker
                kind="technology"
                name="stack"
                defaultValue={content.stack}
                multiple
              />
            </Field>
          </>
        )}
        {!reply && content.kind === "review" && (
          <>
            <Field label="Code snippet">
              <MentionTextarea
                name="code"
                rows={6}
                defaultValue={content.code}
                maxLength={20000}
              />
            </Field>
            <Field label="Review focus">
              <MentionTextarea
                name="review_focus"
                defaultValue={content.review_focus}
                maxLength={1500}
              />
            </Field>
          </>
        )}
        {!reply && (
          <LinksEditor
            initial={
              content.links || [
                ...(content.repo_url
                  ? [{ label: "Repository", url: content.repo_url }]
                  : []),
                ...(content.demo_url
                  ? [{ label: "Demo", url: content.demo_url }]
                  : []),
              ]
            }
          />
        )}
        <div className="editor-label">
          <span>{reply ? "Your reply" : "Your message"}</span>
          <button type="button" onClick={() => setPreview(!preview)}>
            <PenLine size={13} />
            {preview ? "Write" : "Preview"}
          </button>
        </div>
        {preview ? (
          <div className="editor-preview">
            <MD>{body}</MD>
          </div>
        ) : (
          <MentionTextarea
            aria-label="Edited message"
            rows={9}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            minLength={reply ? 2 : 10}
            maxLength={reply ? 10000 : 15000}
            required
          />
        )}
        <ErrorMessage error={error} />
        <div className="form-actions">
          <span>Markdown and code blocks supported.</span>
          <button
            className="button primary"
            disabled={busy || body.trim().length < (reply ? 2 : 10)}
          >
            {busy ? "Saving…" : "Save changes"}
            <CheckCircle2 size={15} />
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function ProjectUpdateForm({ project, close, done }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Modal title="Share a project update" onClose={close} wide>
      <h2>What’s new with {project.name}?</h2>
      <p className="modal-description">
        Keep the story in one place. People who replied or saved your project
        will get a notification.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          setBusy(true);
          try {
            await api(`/projects/${project.id}/updates`, {
              method: "POST",
              body: formObject(e.currentTarget),
            });
            await done();
          } catch (e) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="Update title">
          <input
            name="title"
            required
            minLength={5}
            maxLength={160}
            placeholder="What changed, what you learned, what’s next…"
          />
        </Field>
        <Field
          label="The details"
          hint="Markdown, code blocks, and links are supported."
        >
          <MentionTextarea
            name="body"
            rows={7}
            required
            minLength={10}
            maxLength={10000}
            placeholder="We took your feedback and…"
          />
        </Field>
        <ErrorMessage error={error} />
        <button className="button primary full" disabled={busy}>
          {busy ? "Sharing…" : "Publish project update"}
          <FolderGit2 size={16} />
        </button>
      </form>
    </Modal>
  );
}
export function ProjectTimeline({
  project,
  updates,
  owner,
  onCreate,
  pagination,
  onPage,
}) {
  return (
    <section className="project-timeline">
      <div className="project-timeline-heading">
        <div>
          <span className="eyebrow">THE PROJECT, IN PROGRESS</span>
          <h2>Small steps. Real progress.</h2>
        </div>
        {owner && (
          <button className="button secondary compact" onClick={onCreate}>
            <PenLine size={14} />
            Share an update
          </button>
        )}
      </div>
      {updates.length ? (
        <div className="project-update-list">
          {updates.map((update) => (
            <article
              className="project-update"
              key={update.id}
              id={"update-" + update.id}
            >
              <span className="update-marker" />
              <div className="project-update-heading">
                <h3>{update.title}</h3>
                <span>{dateStamp(update.created)}</span>
              </div>
              <MD>{update.body}</MD>
            </article>
          ))}
        </div>
      ) : (
        <p className="project-update-empty">
          {owner
            ? "A first version is just the beginning. Share what you learn and what changes."
            : "Project updates will appear here as the idea grows."}
        </p>
      )}
      <Pagination meta={pagination} label="project updates" onPage={onPage} />
    </section>
  );
}
