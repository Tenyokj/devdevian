import React, { useState } from "react";
import { Radio, ArrowUpRight, Plus, LockKeyhole } from "lucide-react";
import { api } from "./data";
import { Modal, ErrorMessage, Empty } from "./ui";
import { UserName } from "./user-name";
import "./live.css";
export function LiveLauncher({ post, user, go }) {
  const [open, setOpen] = useState(false),
    [data, setData] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [create, setCreate] = useState(false);
  async function load() {
    setOpen(true);
    setError("");
    try {
      setData(await api(`/posts/${post.id}/live`));
    } catch (e) {
      setError(e.message);
    }
  }
  return (
    <>
      <div className="live-launch">
        <div className="live-orb">
          <Radio size={24} />
        </div>
        <div>
          <span className="eyebrow">DEVDEVIAN LIVE</span>
          <h3>A second pair of hands.</h3>
          <p>
            Work through the code together. Keep the result with this
            conversation.
          </p>
        </div>
        <button className="button secondary" onClick={load}>
          Live sessions <ArrowUpRight size={16} />
        </button>
      </div>
      {open && (
        <Modal
          title="Live sessions"
          onClose={() => {
            setOpen(false);
            setCreate(false);
          }}
          wide
        >
          <h2>From a thread to working together.</h2>
          <p className="modal-description">
            Only invited participants can enter. Everyone must also have access
            to this conversation.
          </p>
          <ErrorMessage error={error} />
          {!user ? (
            <Empty
              icon={LockKeyhole}
              title="Sign in to use Live"
              description="Sign in first, then return to this conversation."
            />
          ) : (
            <>
              {data?.items.map((s) => (
                <a
                  className="live-session-card"
                  href={"#live/" + s.id}
                  key={s.id}
                  onClick={() => setOpen(false)}
                >
                  <Radio size={20} />
                  <span>
                    <strong>{s.title}</strong>
                    <small>
                      <UserName userId={s.host_id}>{s.host_name}</UserName> ·{" "}
                      {s.closed_at ? "Saved session" : "Open session"} ·{" "}
                      {s.role}
                    </small>
                  </span>
                  <ArrowUpRight size={17} />
                </a>
              ))}
              {data?.items.length === 0 && (
                <p className="live-empty">
                  No sessions for you here yet. Start one, or ask a host for an
                  invitation.
                </p>
              )}
              {data?.can_create && !create && (
                <button
                  className="button primary"
                  onClick={() => setCreate(crypto.randomUUID())}
                >
                  <Plus size={16} />
                  Start a session
                </button>
              )}
              {create && (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setBusy(true);
                    setError("");
                    const b = Object.fromEntries(new FormData(e.currentTarget));
                    b.operation_key = e.currentTarget.dataset.operation;
                    try {
                      const r = await api(`/posts/${post.id}/live`, {
                        method: "POST",
                        body: b,
                      });
                      setOpen(false);
                      go("live/" + r.id);
                    } catch (e) {
                      setError(e.message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                  data-operation={create}
                >
                  <label>
                    Session title
                    <input
                      name="title"
                      required
                      minLength={3}
                      maxLength={100}
                      defaultValue={
                        post.title?.slice(0, 100) || "Let’s work through this"
                      }
                    />
                  </label>
                  <label>
                    Language
                    <select name="language" defaultValue="typescript">
                      <option value="typescript">TypeScript</option>
                      <option value="javascript">JavaScript</option>
                      <option value="python">Python</option>
                      <option value="json">JSON</option>
                      <option value="text">Plain text</option>
                    </select>
                  </label>
                  <label>
                    Starting code
                    <textarea
                      name="code"
                      maxLength={20000}
                      rows={7}
                      defaultValue={post.code || ""}
                      placeholder="Paste only the code you want to share"
                    />
                  </label>
                  <p className="live-hint">
                    Up to 20,000 characters. Code is shared as text and is never
                    executed. The original conversation stays unchanged.
                  </p>
                  <button disabled={busy} className="button primary">
                    {busy ? "Opening…" : "Open Live workspace"}
                  </button>
                </form>
              )}
            </>
          )}
        </Modal>
      )}
    </>
  );
}
