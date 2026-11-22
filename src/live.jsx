import React, { useEffect, useRef, useState } from "react";
import {
  Radio,
  ArrowLeft,
  ArrowUpRight,
  Copy,
  Users,
  MessageSquare,
  CheckCircle2,
  Columns2,
  Code2,
  Send,
  LockKeyhole,
  RefreshCw,
} from "lucide-react";
import { api, dateStamp } from "./data";
import { Avatar, ErrorMessage, Empty, MD, Modal } from "./ui";
import { UserName } from "./user-name";
import { LiveEditor, StaticCode } from "./live-editor";
import { createLiveTransport } from "./live-transport.mjs";
import { liveDrafts } from "./live-drafts.mjs";
import "./live.css";
function SessionHome({ user }) {
  const [data, setData] = useState(null),
    [error, setError] = useState("");
  useEffect(() => {
    if (!user) return;
    const c = new AbortController();
    api("/live", { signal: c.signal })
      .then(setData)
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      });
    return () => c.abort();
  }, [user?.id]);
  return (
    <section className="live-home">
      <div className="live-home-hero">
        <Radio size={32} />
        <span className="eyebrow">DEVDEVIAN LIVE</span>
        <h1>
          Less back and forth.
          <br />
          <em>More building together.</em>
        </h1>
        <p>
          Shared code, a conversation, and the people who help it click. Start a
          Live session from any discussion or project room.
        </p>
        <a className="button primary" href="#feed">
          Find a conversation <ArrowUpRight size={17} />
        </a>
      </div>
      <ErrorMessage error={error} />
      <h2>Your sessions & invitations</h2>
      {!user ? (
        <Empty
          title="Sign in to join Live"
          description="Your invitations and saved sessions will appear here."
        />
      ) : data?.items.length === 0 ? (
        <Empty
          icon={Radio}
          title="Your first session starts with a conversation."
          description="Open a discussion → Live sessions → Start a session, then invite someone by their username."
        />
      ) : (
        data?.items.map((s) => (
          <a href={"#live/" + s.id} key={s.id} className="live-session-card">
            <Radio size={22} />
            <span>
              <strong>{s.title}</strong>
              <small>
                <UserName userId={s.host_id}>{s.host_name}</UserName> ·{" "}
                {s.closed_at ? "Saved" : "Open"} · {s.role}
              </small>
            </span>
            <ArrowUpRight size={18} />
          </a>
        ))
      )}
    </section>
  );
}
export default function LiveWorkspace({ id, user, go }) {
  const [data, setData] = useState(null),
    [error, setError] = useState(""),
    [status, setStatus] = useState("Connecting…"),
    [transport, setTransport] = useState(null),
    [messages, setMessages] = useState([]),
    [code, setCode] = useState(""),
    [compare, setCompare] = useState(false),
    [panel, setPanel] = useState("chat"),
    [dialog, setDialog] = useState(""),
    [summary, setSummary] = useState(""),
    [busy, setBusy] = useState(false),
    [chat, setChat] = useState(""),
    [accessLost, setAccessLost] = useState(false),
    [notice, setNotice] = useState("");
  const [recoveries, setRecoveries] = useState([]),
    [recovery, setRecovery] = useState(null);
  const draftStore = useRef(null);
  const controller = useRef(null),
    messageKey = useRef(crypto.randomUUID()),
    bottom = useRef(null);
  function mergeMessages(items) {
    setMessages((old) =>
      [...new Map([...old, ...items].map((m) => [m.id, m])).values()].sort(
        (a, b) => a.id - b.id,
      ),
    );
  }
  useEffect(() => {
    if (!id || !user) return;
    let alive = true,
      provider;
    const c = new AbortController();
    setError("");
    setData(null);
    setTransport(null);
    setMessages([]);
    setAccessLost(false);
    setNotice("");
    api("/live/" + id, { signal: c.signal })
      .then((initial) => {
        if (!alive) return;
        try {
          draftStore.current = liveDrafts(user.id, id);
          setRecoveries(draftStore.current.list());
        } catch {
          setNotice(
            "Local recovery is unavailable in this browser. Copy unsaved code before leaving.",
          );
        }
        setData(initial);
        setSummary(initial.session.summary);
        setCode("");
        setMessages(initial.messages);
        provider = createLiveTransport({
          data: initial,
          drafts: draftStore.current,
          onDraftError: () =>
            alive &&
            setNotice(
              "Could not save a local recovery copy. Copy your code before leaving.",
            ),
          user,
          request: (body, signal) =>
            api("/live/" + id + "/sync", { method: "POST", body, signal }),
          onStatus: (s) => alive && setStatus(s),
          onText: (s) => alive && setCode(s),
          onSync: (result) => {
            if (!alive) return;
            if (result.access_lost) {
              setAccessLost(true);
              return;
            }
            setData((old) => ({ ...old, ...result }));
            mergeMessages(result.messages);
          },
        });
        setCode(provider.code.toString());
        controller.current = provider;
        setTransport(provider);
      })
      .catch((e) => {
        if (alive && !c.signal.aborted) setError(e.message);
      });
    const unload = (e) => {
      if (provider?.hasPending()) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", unload);
    return () => {
      alive = false;
      c.abort();
      provider?.destroy();
      controller.current = null;
      window.removeEventListener("beforeunload", unload);
    };
  }, [id, user?.id]);
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "nearest", behavior: "auto" });
  }, [messages.length]);
  if (!id) return <SessionHome user={user} />;
  if (!user)
    return (
      <Empty
        icon={LockKeyhole}
        title="Sign in to open this session"
        description="Live sessions are available only to invited accounts with access to the source conversation."
      />
    );
  if (!data)
    return (
      <section className="live-loading">
        <Radio size={32} />
        <h2>
          {error
            ? "Couldn’t open this session."
            : "Opening your shared workspace…"}
        </h2>
        <ErrorMessage error={error} />
        <a href="#live" className="button secondary">
          Your sessions
        </a>
      </section>
    );
  const s = data.session,
    editable = s.can_edit && !accessLost;
  async function action(path, body) {
    setBusy(true);
    setError("");
    try {
      const result = await api("/live/" + id + "/" + path, {
        method: "POST",
        body,
      });
      transport.syncNow();
      return result;
    } catch (e) {
      setError(e.message);
      return null;
    } finally {
      setBusy(false);
    }
  }
  async function member(username, role) {
    setBusy(true);
    setError("");
    try {
      const result = await api("/live/" + id + "/members", {
        method: "PATCH",
        body: { username, role },
      });
      setData((old) => ({ ...old, members: result.members }));
      setNotice(
        role === "remove"
          ? "Participant removed."
          : "Invitation ready. Share this session link with them.",
      );
      transport.syncNow();
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function copy(value) {
    try {
      await navigator.clipboard.writeText(value);
      setNotice("Copied.");
    } catch {
      setError("Clipboard unavailable. Select and copy the text manually.");
    }
  }
  return (
    <section className="live-workspace">
      <a href={"#post/" + s.post_id} className="back-link">
        <ArrowLeft size={15} />
        Back to {s.post_title}
      </a>
      <header className="live-header">
        <div>
          <span className="eyebrow">
            <span className={"live-dot " + (s.closed_at ? "saved" : "")} />
            {s.closed_at ? "SAVED LIVE SESSION" : "DEVDEVIAN LIVE"}
          </span>
          <h1>{s.title}</h1>
          <p>
            {s.private
              ? "Private conversation · invited members only"
              : "Invited participants only"}{" "}
            · {s.language} · revision {s.revision}
          </p>
        </div>
        <div className="live-header-actions">
          <button
            className="button secondary"
            onClick={() => copy(location.origin + "/app#live/" + id)}
          >
            <Copy size={15} />
            Copy invitation link
          </button>
          {s.can_manage && !s.closed_at && (
            <button
              className="button primary"
              disabled={busy || accessLost}
              onClick={() => setDialog("close")}
            >
              <CheckCircle2 size={16} />
              Save & finish
            </button>
          )}
        </div>
      </header>
      <div
        className={"live-connection " + (accessLost ? "lost" : "")}
        role="status"
      >
        <span className="live-dot" />
        {status}
        <span className="live-mode">
          {editable
            ? "You can edit"
            : s.closed_at
              ? "Read-only snapshot"
              : "You are observing"}
        </span>
      </div>
      <ErrorMessage error={error} />
      {notice && (
        <p className="form-success" role="status">
          {notice}
        </p>
      )}
      {accessLost && (
        <p className="live-alert">
          Your access changed. Sending has stopped. Copy any unsaved local code
          before leaving.
        </p>
      )}
      {recoveries.length > 0 && (
        <section className="live-recovery" aria-label="Unsent local changes">
          <div>
            <strong>Unsent changes found on this device</strong>
            <p>
              Review before restoring. A recovery merges edits with the current
              shared code.
            </p>
          </div>
          <button
            className="button secondary"
            onClick={() => setRecovery(recoveries[0])}
          >
            Review local changes
          </button>
        </section>
      )}
      {recovery && (
        <Modal
          title="Recover unsent changes"
          onClose={() => setRecovery(null)}
          wide
        >
          <h2>Your local recovery copy</h2>
          <p>
            Saved {dateStamp(new Date(recovery.updated).toISOString())}. Kept on
            this device for up to seven days; signing out clears it.
          </p>
          <h3>Current shared code</h3>
          <pre className="live-draft-code">{code}</pre>
          <h3>Unsent local code</h3>
          <pre className="live-draft-code">{recovery.code}</pre>
          <p>
            Restore merges the saved code history with the latest session. Check
            the result before finishing. Closed or read-only sessions allow
            copying only.
          </p>
          <div className="live-recovery-actions">
            <button
              className="button secondary"
              onClick={() => copy(recovery.code)}
            >
              Copy local code
            </button>
            <button
              className="button secondary"
              onClick={() => {
                draftStore.current.discard(recovery);
                setRecoveries(draftStore.current.list());
                setRecovery(null);
              }}
            >
              Discard local copy
            </button>
            <button
              className="button primary"
              disabled={!editable}
              onClick={() => {
                try {
                  if (transport.restore(recovery.state))
                    draftStore.current.discard(recovery);
                  setRecoveries(draftStore.current.list());
                  setRecovery(null);
                } catch (e) {
                  setNotice(e.message);
                  setRecovery(null);
                }
              }}
            >
              Restore and sync
            </button>
          </div>
        </Modal>
      )}
      <p className="live-sharing-note">
        The host can publish the final code and summary back to this
        conversation. Chat stays invitation-only.
      </p>
      <div className="live-desk">
        <section className="live-editor-panel">
          <div className="live-toolbar">
            <span>
              <Code2 size={16} />
              {s.language === "text"
                ? "scratchpad.txt"
                : "shared." +
                  ({
                    typescript: "ts",
                    javascript: "js",
                    python: "py",
                    json: "json",
                  }[s.language] || "txt")}
            </span>
            <div>
              <button
                aria-pressed={compare}
                onClick={() => setCompare(!compare)}
              >
                <Columns2 size={15} />
                {compare ? "Shared editor" : "Compare original"}
              </button>
              <button onClick={() => copy(code)}>
                <Copy size={15} />
                Copy code
              </button>
            </div>
          </div>
          {transport && (
            <div className="live-editor-container" hidden={compare}>
              <LiveEditor
                transport={transport}
                language={s.language}
                editable={editable}
              />
            </div>
          )}
          {compare && (
            <div className="live-compare">
              <div>
                <h3>Starting point</h3>
                <StaticCode
                  code={s.initial_code}
                  language={s.language}
                  label="Original code"
                />
              </div>
              <div>
                <h3>Current result</h3>
                <StaticCode
                  code={code}
                  language={s.language}
                  label="Current result"
                />
              </div>
            </div>
          )}
          <footer className="live-editor-footer">
            <span>
              {code.length.toLocaleString()} / 20,000 characters · code is never
              executed
            </span>
            <span>Local undo · Ctrl/⌘ Z</span>
          </footer>
        </section>
        <aside className="live-side">
          <div className="live-side-tabs">
            <button
              className={panel === "chat" ? "selected" : ""}
              onClick={() => setPanel("chat")}
            >
              <MessageSquare size={16} />
              Conversation
            </button>
            <button
              className={panel === "people" ? "selected" : ""}
              onClick={() => setPanel("people")}
            >
              <Users size={16} />
              People ({data.members.length})
            </button>
          </div>
          {panel === "chat" ? (
            <>
              <div
                className="live-chat"
                role="log"
                aria-label="Session messages"
              >
                {messages.length === 0 && (
                  <div className="live-chat-empty">
                    <MessageSquare size={27} />
                    <h3>Keep the thinking close.</h3>
                    <p>Ask, explain and work through the details together.</p>
                  </div>
                )}
                {messages.map((m) => (
                  <article className="live-message" key={m.id}>
                    <header>
                      <Avatar userId={m.user_id} name={m.name} size="small" />
                      <strong>
                        <UserName userId={m.user_id}>{m.name}</UserName>
                      </strong>
                      <time>{dateStamp(m.created)}</time>
                    </header>
                    <p>{m.body}</p>
                  </article>
                ))}
                <div ref={bottom} />
              </div>
              <form
                className="live-chat-form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!chat.trim()) return;
                  const result = await action("messages", {
                    body: chat,
                    operation_key: messageKey.current,
                  });
                  if (result) {
                    mergeMessages([
                      {
                        id: result.id,
                        user_id: user.id,
                        name: user.name,
                        body: chat,
                        created: new Date().toISOString(),
                      },
                    ]);
                    setChat("");
                    messageKey.current = crypto.randomUUID();
                  }
                }}
              >
                <label htmlFor="live-message">Message the session</label>
                <textarea
                  id="live-message"
                  rows={3}
                  maxLength={2000}
                  value={chat}
                  onChange={(e) => setChat(e.target.value)}
                  disabled={!s.can_chat || accessLost}
                  placeholder={
                    s.closed_at ? "This session is saved." : "Share a thought…"
                  }
                />
                <button
                  className="button primary"
                  disabled={busy || !chat.trim() || !s.can_chat || accessLost}
                >
                  <Send size={14} />
                  Send message
                </button>
              </form>
            </>
          ) : (
            <div className="live-people">
              <p>
                Only the host can change invitations. A link alone never grants
                access.
              </p>
              {data.members.map((m) => (
                <article key={m.user_id}>
                  <Avatar userId={m.user_id} name={m.name} />
                  <div>
                    <strong>
                      <UserName userId={m.user_id}>{m.name}</UserName>
                    </strong>
                    <small>
                      @{m.username} · {m.role} ·{" "}
                      {data.presence.some((p) => p.user_id === m.user_id)
                        ? "here"
                        : "away"}
                    </small>
                  </div>
                  {s.can_manage && m.user_id !== s.host_id && (
                    <select
                      aria-label={"Access for @" + m.username}
                      disabled={busy || accessLost}
                      value={m.role}
                      onChange={(e) => {
                        if (
                          e.target.value === "remove" &&
                          !confirm(
                            "Remove @" + m.username + " from this session?",
                          )
                        )
                          return;
                        member(m.username, e.target.value);
                      }}
                    >
                      <option value="viewer">Viewer</option>
                      <option value="editor" disabled={!!s.closed_at}>
                        Editor
                      </option>
                      <option value="remove">Remove</option>
                    </select>
                  )}
                </article>
              ))}
              {s.can_manage && !s.closed_at && (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const f = e.currentTarget,
                      v = Object.fromEntries(new FormData(f));
                    if (
                      await member(v.username.trim().replace(/^@/, ""), v.role)
                    )
                      f.reset();
                  }}
                >
                  <label>
                    Invite by username
                    <input
                      name="username"
                      required
                      maxLength={30}
                      placeholder="@developer"
                    />
                  </label>
                  <label>
                    Access
                    <select name="role">
                      <option value="editor">Can edit code</option>
                      <option value="viewer">Can observe</option>
                    </select>
                  </label>
                  <button
                    className="button secondary"
                    disabled={busy || accessLost}
                  >
                    Invite participant
                  </button>
                </form>
              )}
            </div>
          )}
        </aside>
      </div>
      {s.closed_at && (
        <section className="live-result">
          <span className="eyebrow">WHAT YOU WORKED OUT TOGETHER</span>
          <h2>A useful next step, saved.</h2>
          <MD>{s.summary}</MD>
          <p>
            The shared code above is now an immutable result. Publishing it
            creates a reply; it does not mark an accepted solution or change a
            formal review outcome.
          </p>
          {s.published_reply_id ? (
            <a
              className="button primary"
              href={`#post/${s.post_id}/reply/${s.published_reply_id}`}
            >
              Open published result <ArrowUpRight size={15} />
            </a>
          ) : (
            s.can_manage &&
            !accessLost && (
              <button
                className="button primary"
                disabled={busy}
                onClick={() => setDialog("publish")}
              >
                Preview result for the conversation
              </button>
            )
          )}
        </section>
      )}
      {dialog === "close" && (
        <Modal title="Save & finish Live" onClose={() => setDialog("")} wide>
          <h2>Keep what you learned.</h2>
          <p className="modal-description">
            Finishing freezes the shared code and this summary. It does not
            publish a reply yet.
          </p>
          <label>
            Session outcome
            <textarea
              aria-label="Session outcome"
              rows={6}
              minLength={3}
              maxLength={4000}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="What changed? What should happen next?"
            />
          </label>
          <ErrorMessage error={error} />
          <button
            className="button primary"
            disabled={busy || summary.trim().length < 3}
            onClick={async () => {
              setBusy(true);
              if (!(await transport.flushPending())) {
                setBusy(false);
                setError(
                  "Wait until the latest changes finish syncing, then try again.",
                );
                return;
              }
              if (
                await action("close", {
                  summary,
                  expected_revision: transport.getRevision(),
                })
              ) {
                setDialog("");
                setData((old) => ({
                  ...old,
                  session: {
                    ...old.session,
                    summary,
                    closed_at: new Date().toISOString(),
                    can_edit: false,
                    can_chat: false,
                  },
                }));
                transport.stop();
                setStatus("Session saved");
              }
            }}
          >
            Finish and save snapshot
          </button>
        </Modal>
      )}
      {dialog === "publish" && (
        <Modal title="Publish Live result" onClose={() => setDialog("")} wide>
          <h2>Share the outcome with the conversation.</h2>
          <p>
            This reply will use the same audience as the original conversation.
            The session itself remains invitation-only.
          </p>
          <MD>{"## Live session: " + s.title + "\n\n" + s.summary}</MD>
          <StaticCode
            code={code}
            language={s.language}
            label="Code to publish"
          />
          <ErrorMessage error={error} />
          <button
            className="button primary"
            disabled={busy}
            onClick={async () => {
              const result = await action("publish", { confirm: true });
              if (result) {
                setDialog("");
                setData((old) => ({
                  ...old,
                  session: {
                    ...old.session,
                    published_reply_id: result.reply_id,
                  },
                }));
                setNotice("Result published once in the conversation.");
              }
            }}
          >
            Confirm & publish reply
          </button>
        </Modal>
      )}
    </section>
  );
}
