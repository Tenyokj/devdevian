import React, { useEffect, useState } from "react";
import { api, dateStamp } from "./data";
import { ErrorMessage } from "./ui";
import { Terminal, CheckCircle2 } from "lucide-react";
export function CliApproval({ user, requireUser, code }) {
  const [device, setDevice] = useState(null),
    [error, setError] = useState(""),
    [done, setDone] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!user) return;
    let alive = true;
    setDevice(null);
    setError("");
    api("/cli/device/" + encodeURIComponent(code))
      .then((d) => alive && setDevice(d))
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [code, user?.id]);
  async function decide(approved) {
    setBusy(true);
    try {
      await api("/cli/authorize", {
        method: "POST",
        body: { user_code: code, approved },
      });
      setDone(
        approved
          ? "Connected. Return to your terminal."
          : "Connection declined.",
      );
      setError("");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="cli-approval">
      <Terminal size={32} />
      <span className="eyebrow">DEVDEVIAN CLI · ALPHA</span>
      <h1>Connect your terminal.</h1>
      <p>
        Use your existing Devdevian account in the terminal. Publications,
        replies and community permissions stay the same.
      </p>
      <ErrorMessage error={error} />
      {!user ? (
        <button
          className="button primary"
          onClick={() => requireUser(() => {})}
        >
          Sign in to connect
        </button>
      ) : done ? (
        <p role="status" className="form-success">
          <CheckCircle2 size={20} />
          {done}
        </p>
      ) : device ? (
        <>
          <p>
            Connecting as <strong>@{user.username}</strong>
          </p>
          <div className="cli-device-code">
            <strong>{device.name}</strong>
            <code>{device.user_code}</code>
          </div>
          <p>
            Confirm that this code matches the login you started in your
            terminal. The connected CLI can act on your behalf. You can revoke
            it in Settings.
          </p>
          <div className="settings-actions">
            <button
              className="button primary"
              disabled={busy}
              onClick={() => decide(true)}
            >
              Authorize terminal
            </button>
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => decide(false)}
            >
              Decline
            </button>
          </div>
        </>
      ) : !error ? (
        <p>Loading connection request…</p>
      ) : null}
    </section>
  );
}
export function CliSessions() {
  const [sessions, setSessions] = useState([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loaded, setLoaded] = useState(false);
  const load = () =>
    api("/cli/sessions").then((d) => {
      setSessions(d.items);
      setLoaded(true);
    });
  useEffect(() => {
    let alive = true;
    api("/cli/sessions")
      .then((d) => {
        if (alive) {
          setSessions(d.items);
          setLoaded(true);
        }
      })
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, []);
  return (
    <section className="settings-section">
      <h3>Connected terminals</h3>
      <p>
        CLI access expires after 30 days. Revoke a terminal to stop its API
        access immediately.
      </p>
      <ErrorMessage error={error} />
      {!loaded && !error && <p>Loading terminal sessions…</p>}
      {loaded && !sessions.length && <p>No connected terminals.</p>}
      {sessions.map((s) => (
        <div className="cli-session" key={s.id}>
          <div>
            <strong>{s.name}</strong>
            <small>
              Connected {dateStamp(s.created)} · expires{" "}
              {dateStamp(new Date(s.expires))}
            </small>
          </div>
          <button
            type="button"
            className="button secondary compact"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await api("/cli/sessions/" + s.id, {
                  method: "DELETE",
                  body: {},
                });
                await load();
                setError("");
              } catch (e) {
                setError(e.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Revoke terminal
          </button>
        </div>
      ))}
    </section>
  );
}
