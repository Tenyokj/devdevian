import React, { useEffect, useRef, useState, lazy, Suspense } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ArrowLeft,
  ArrowUpRight,
  MessageCircle,
  Link as LinkIcon,
  CheckCircle2,
  Code2,
} from "lucide-react";
import { api, dateStamp, parseTimestamp } from "../data";
import { GitHubContext } from "../github-context";
import {
  rememberConversationReturn,
  clearConversationReturn,
  takeConversationReturn,
} from "../auth-return";
import { conversationLinks } from "../../packages/cli/lib/conversation-links.mjs";
import "../style.css";
import "../refresh.css";
import "./conversation.css";
const Auth = lazy(() => import("../forms").then((m) => ({ default: m.Auth })));
const ChooseUsername = lazy(() =>
  import("../forms").then((m) => ({ default: m.ChooseUsername })),
);
const kinds = {
  question: "Question",
  discussion: "Discussion",
  review: "Code review",
  showcase: "Show & tell",
};

function Body({ children }) {
  return (
    <div className="markdown">
      <Markdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          a: ({ node, href, ...props }) => (
            <a
              {...props}
              href={
                /^#(?:post|member|handle|tag)\//.test(href || "")
                  ? "/app" + href
                  : href
              }
              rel="ugc nofollow noopener noreferrer"
              target={href?.startsWith("#") ? undefined : "_blank"}
            />
          ),
          img: ({ node, ...props }) => (
            <img
              {...props}
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
            />
          ),
        }}
      >
        {children || ""}
      </Markdown>
    </div>
  );
}
function Stamp({ value, zone }) {
  return (
    <time dateTime={parseTimestamp(value)?.toISOString()}>
      {dateStamp(value, zone)}
    </time>
  );
}
function Files({ items }) {
  return items?.length ? (
    <ul className="public-attachments" aria-label="Attachments">
      {items.map((file) => (
        <li key={file.id}>
          <a href={"/api/uploads/" + file.id}>
            {file.name}
            <ArrowUpRight size={14} aria-hidden="true" />
          </a>
          <small>{Math.ceil(file.size / 1024)} KB</small>
        </li>
      ))}
    </ul>
  ) : null;
}
export default function ConversationPage({ seed }) {
  const { post: p, replies, pagination } = seed;
  const [user, setUser] = useState(null),
    [checking, setChecking] = useState(true),
    [identityError, setIdentityError] = useState("");
  const [zone, setZone] = useState("UTC"),
    [auth, setAuth] = useState(null),
    [text, setText] = useState(""),
    [parent, setParent] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const field = useRef(null);
  const workspace = "/app#post/" + p.id;
  const blocked = p.archived_at || p.locked_at;
  useEffect(() => {
    setZone(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
    let active = true;
    api("/me")
      .then((data) => {
        if (active) setUser(data.user);
      })
      .catch((e) => {
        if (active) setIdentityError(e.message);
      })
      .finally(() => {
        if (active) setChecking(false);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!user || user.username_locked === 0) return;
    takeConversationReturn();
    let active = true;
    const key = `devdevian-public-reply:${p.id}:${user.id}`;
    try {
      const draft = JSON.parse(sessionStorage.getItem(key) || "null");
      if (
        draft &&
        draft.expires > Date.now() &&
        typeof draft.text === "string" &&
        draft.text.length <= 10000
      ) {
        setText(draft.text);
        setNotice("Your unsent reply was restored.");
      }
    } catch {
      /* Private session draft is optional. */
    }
    const params = new URLSearchParams(location.search);
    const target = params.get("reply_to");
    if (target && /^[1-9]\d{0,14}$/.test(target)) {
      api(`/posts/${p.id}?reply_id=${target}`)
        .then((data) => {
          const found = data.replies?.find(
            (reply) => reply.id === Number(target) && !reply.deleted_at,
          );
          if (active && found) setParent((current) => current || found);
          else if (active)
            setNotice(
              "The selected reply is unavailable. You can reply to the conversation.",
            );
        })
        .catch(() => {
          if (active)
            setNotice(
              "Could not restore the selected reply. Open its thread to continue.",
            );
        });
      // This request only restores context; it never posts or retries a reply.
      requestAnimationFrame(() => field.current?.focus());
    }
    if (params.get("reply") === "1") {
      document.getElementById("reply")?.scrollIntoView({ block: "center" });
      field.current?.focus();
    }
    return () => {
      active = false;
    };
  }, [user?.id, user?.username_locked, p.id]);
  const signIn = () => {
    if (user && text) {
      try {
        sessionStorage.setItem(
          `devdevian-public-reply:${p.id}:${user.id}`,
          JSON.stringify({ text, expires: Date.now() + 15 * 60 * 1000 }),
        );
      } catch {
        /* Keep in-memory text on the same page. */
      }
    }
    rememberConversationReturn(
      p.path + "?reply=1" + (parent ? "&reply_to=" + parent.id : "") + "#reply",
    );
    setAuth("login");
  };
  const signedIn = async (next) => {
    setUser(next);
    setAuth(null);
    setIdentityError("");
    clearConversationReturn();
    requestAnimationFrame(() => field.current?.focus());
  };
  return (
    <div className="conversation-page">
      <a className="conversation-skip" href="#conversation-content">
        Skip to conversation
      </a>
      <nav className="conversation-nav" aria-label="Main navigation">
        <a className="conversation-brand" href="/">
          <img src="/devdevian-logo.png" alt="" />
          <strong>
            devdevian<span>.</span>
          </strong>
        </a>
        <div>
          <a href="/app">Public feed</a>
          <a href="/faq">FAQ</a>
          <a
            className="button outline"
            href={user ? "/app#profile" : workspace}
          >
            {user ? user.name : "Open the forum"}
            <ArrowUpRight size={15} aria-hidden="true" />
          </a>
        </div>
      </nav>
      <main id="conversation-content">
        <a className="conversation-back" href="/app#feed">
          <ArrowLeft size={15} aria-hidden="true" />
          Back to public feed
        </a>
        <article
          className="public-conversation"
          aria-labelledby="conversation-title"
        >
          <header>
            <div className="conversation-labels">
              <span>{kinds[p.kind] || "Conversation"}</span>
              <a href={"/app#tag/" + encodeURIComponent(p.topic)}>
                {p.topic_name || p.topic}
              </a>
              {p.accepted_reply_id && (
                <span className="public-solution">
                  <CheckCircle2 size={14} aria-hidden="true" />
                  Solution marked
                </span>
              )}
              {blocked && <span>Replies paused</span>}
            </div>
            <h1 id="conversation-title">{p.title}</h1>
            <div className="conversation-byline">
              <a href={"/app#member/" + p.user_id}>{p.name}</a>
              <span>·</span>
              <Stamp value={p.created} zone={zone} />
              <span>·</span>
              <span>
                {p.reply_count} {p.reply_count === 1 ? "reply" : "replies"}
              </span>
            </div>
          </header>
          <Body>{p.body}</Body>
          {p.review_focus && (
            <aside className="public-review-focus">
              <Code2 size={18} aria-hidden="true" />
              <div>
                <strong>Review focus</strong>
                <p>{p.review_focus}</p>
              </div>
            </aside>
          )}
          {p.code && (
            <section className="public-code" aria-label="Published code">
              <div>
                <Code2 size={16} aria-hidden="true" />
                Published snippet
              </div>
              <pre tabIndex={0}>
                <code>{p.code}</code>
              </pre>
            </section>
          )}
          <GitHubContext value={p.github_context} />
          <Files items={p.attachments} />
          {p.stack && (
            <div
              className="conversation-technologies"
              aria-label="Technologies"
            >
              {p.stack
                .split(",")
                .filter(Boolean)
                .slice(0, 30)
                .map((tag, i) => (
                  <span key={tag + i}>{tag.trim()}</span>
                ))}
            </div>
          )}
          {conversationLinks(p).length > 0 && (
            <div className="conversation-links">
              {conversationLinks(p).map((link) => (
                <a
                  key={link.url}
                  href={link.url}
                  target="_blank"
                  rel="ugc nofollow noopener noreferrer"
                >
                  {link.label}
                  <ArrowUpRight size={15} aria-hidden="true" />
                </a>
              ))}
            </div>
          )}
          <div className="conversation-actions">
            <a className="button primary" href="#reply">
              <MessageCircle size={16} aria-hidden="true" />
              Join the conversation
            </a>
            <a className="button outline" href={workspace}>
              Open full workspace
              <ArrowUpRight size={14} aria-hidden="true" />
            </a>
            <button
              className="button outline"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(location.origin + p.path);
                  setNotice("Conversation link copied.");
                } catch {
                  setNotice(
                    "Copy this page’s address to share the conversation.",
                  );
                }
              }}
            >
              <LinkIcon size={15} aria-hidden="true" />
              Share
            </button>
          </div>
        </article>
        {p.accepted_reply_id && (
          <a
            className="public-accepted-link"
            href={workspace + "/reply/" + p.accepted_reply_id}
          >
            <CheckCircle2 size={18} aria-hidden="true" />
            Open the accepted answer
            <ArrowUpRight size={15} aria-hidden="true" />
          </a>
        )}
        <section className="public-replies" aria-labelledby="reply-heading">
          <div className="public-replies-heading">
            <h2 id="reply-heading">The conversation</h2>
            <span>
              {p.reply_count} {p.reply_count === 1 ? "reply" : "replies"}
            </span>
          </div>
          {replies.length === 0 && (
            <div className="public-empty-replies">
              <MessageCircle size={26} aria-hidden="true" />
              <h3>Bring a fresh perspective.</h3>
              <p>Your reply could be the start of a useful conversation.</p>
            </div>
          )}
          {replies.map((reply) => (
            <article
              className="public-reply"
              id={"reply-" + reply.id}
              key={reply.id}
            >
              <header>
                <a href={"/app#member/" + reply.user_id}>{reply.name}</a>
                <Stamp value={reply.created} zone={zone} />
                {p.accepted_reply_id === reply.id && (
                  <span className="public-solution">
                    <CheckCircle2 size={14} aria-hidden="true" />
                    Accepted answer
                  </span>
                )}
              </header>
              <Body>{reply.body}</Body>
              <Files items={reply.attachments} />
              <div className="public-reply-links">
                {reply.children_count > 0 && (
                  <a href={workspace + "/reply/" + reply.id}>
                    {reply.children_count}{" "}
                    {reply.children_count === 1
                      ? "thread reply"
                      : "thread replies"}
                    <ArrowUpRight size={13} aria-hidden="true" />
                  </a>
                )}
                {!blocked && !reply.deleted_at && (
                  <a
                    href="#reply"
                    onClick={() => {
                      setParent(reply);
                      requestAnimationFrame(() => field.current?.focus());
                    }}
                  >
                    Reply to {reply.name}
                  </a>
                )}
                <a href={workspace + "/reply/" + reply.id}>Permalink</a>
              </div>
            </article>
          ))}
          {pagination.pages > 1 && (
            <nav className="public-reply-pages" aria-label="Reply pages">
              {pagination.page > 1 && (
                <a
                  className="button outline"
                  href={
                    p.path +
                    (pagination.page > 2
                      ? "?reply_page=" + (pagination.page - 1)
                      : "") +
                    "#reply-heading"
                  }
                >
                  Previous
                </a>
              )}
              <span>
                Page {pagination.page} of {pagination.pages}
              </span>
              {pagination.page < pagination.pages && (
                <a
                  className="button outline"
                  href={
                    p.path +
                    "?reply_page=" +
                    (pagination.page + 1) +
                    "#reply-heading"
                  }
                >
                  Next
                </a>
              )}
            </nav>
          )}
        </section>
        <section id="reply" className="public-reply-composer">
          <h2>Add your perspective.</h2>
          {notice && (
            <p className="conversation-notice" role="status">
              {notice}
            </p>
          )}
          {blocked ? (
            <p>
              Replies are paused. You can still read the existing conversation.
            </p>
          ) : user ? (
            <form
              onSubmit={async (event) => {
                event.preventDefault();
                if (busy) return;
                setBusy(true);
                setError("");
                try {
                  const created = await api(`/posts/${p.id}/replies`, {
                    method: "POST",
                    body: { body: text, parent_id: parent?.id || null },
                  });
                  try {
                    sessionStorage.removeItem(
                      `devdevian-public-reply:${p.id}:${user.id}`,
                    );
                  } catch {
                    /* Optional session draft. */
                  }
                  location.assign(
                    parent
                      ? workspace + "/reply/" + created.id
                      : p.path +
                          "?reply_page=" +
                          Math.ceil((pagination.total + 1) / 10) +
                          "#reply-" +
                          created.id,
                  );
                } catch (e) {
                  setError(e.message);
                  if (e.status === 401) signIn();
                } finally {
                  setBusy(false);
                }
              }}
            >
              {parent && (
                <div className="public-parent">
                  Replying to {parent.name}
                  <button type="button" onClick={() => setParent(null)}>
                    Cancel
                  </button>
                </div>
              )}
              <label htmlFor="public-reply-text">Your reply</label>
              <textarea
                id="public-reply-text"
                ref={field}
                value={text}
                onChange={(event) => setText(event.target.value)}
                minLength={2}
                maxLength={10000}
                required
                rows={6}
                placeholder="Share what you know, or ask a useful follow-up."
              />
              <p>Markdown is supported. Your reply will be public.</p>
              {error && (
                <p role="alert" className="conversation-error">
                  {error}
                </p>
              )}
              <button
                className="button primary"
                disabled={busy || user.username_locked === 0}
              >
                {busy ? "Posting…" : "Post reply"}
              </button>
            </form>
          ) : (
            <div>
              <p>
                Sign in to reply with your Devdevian account. You’ll return to
                this conversation.
              </p>
              {identityError && (
                <p className="conversation-error" role="alert">
                  {identityError}
                </p>
              )}
              <button
                className="button primary"
                disabled={checking}
                onClick={signIn}
              >
                {checking ? "Checking your session…" : "Sign in to reply"}
              </button>
              <noscript>
                <p>
                  <a href={workspace}>Open the forum to sign in and reply.</a>
                </p>
              </noscript>
            </div>
          )}
        </section>
      </main>
      <footer className="conversation-footer">
        <span>devdevian. · A work in good company.</span>
        <nav aria-label="Footer navigation">
          <a href="/updates">What’s new</a>
          <a href="/faq">FAQ</a>
          <a href="/privacy">Privacy & Security</a>
          <a href="/terms">Terms of Use</a>
        </nav>
      </footer>
      <Suspense fallback={<p role="status">Loading sign-in…</p>}>
        {auth && (
          <Auth
            mode={auth}
            setMode={setAuth}
            close={() => {
              setAuth(null);
              clearConversationReturn();
            }}
            done={signedIn}
          />
        )}
        {user?.username_locked === 0 && (
          <ChooseUsername
            done={async () => {
              const data = await api("/me");
              await signedIn(data.user);
            }}
          />
        )}
      </Suspense>
    </div>
  );
}
