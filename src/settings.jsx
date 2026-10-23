import React, { useState, useEffect } from "react";
import { Shield, LogIn, Trash2, Github, Globe } from "lucide-react";
import { Modal, Field, ErrorMessage } from "./ui";
import { Select } from "./controls";
import { api } from "./data";
export function Settings({
  user,
  close,
  refresh,
  onSwitch,
  onManageSubscriptions,
}) {
  const [prefs, setPrefs] = useState({ ...user.preferences }),
    [privacy, setPrivacy] = useState(user.privacy || "public"),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false),
    [busy, setBusy] = useState(false),
    [remove, setRemove] = useState(false),
    [confirm, setConfirm] = useState(""),
    [providers, setProviders] = useState({}),
    [accounts, setAccounts] = useState([]);
  useEffect(() => {
    api("/auth/config")
      .then(setProviders)
      .catch(() => {});
    api("/accounts")
      .then(setAccounts)
      .catch(() => {});
  }, []);
  return (
    <Modal title="Your preferences" onClose={close} wide>
      <h2>Make yourself at home.</h2>
      <p className="modal-description">
        Your identity, privacy and connected accounts.
      </p>
      <ErrorMessage error={error} />
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await api("/account/preferences", {
              method: "PATCH",
              body: { privacy, preferences: prefs },
            });
            await refresh();
            setSaved(true);
          } catch (e) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="settings-section">
          <h3>
            <Shield size={16} /> Identity & privacy
          </h3>
          <p className="identity-note">
            @{user.username}
            <small>
              Permanent username. Your display name can be changed in Edit
              profile.
            </small>
          </p>
          <Field
            label="Profile visibility"
            hint="Hidden removes your profile page, people-search result and mention suggestions for other users. You can still see your own profile. Public posts remain in the feed."
          >
            <Select
              value={privacy}
              onChange={(e) => {
                setPrivacy(e.target.value);
                setSaved(false);
              }}
              options={[
                {
                  value: "public",
                  label: "Public · visible profile and member search",
                },
                {
                  value: "hidden",
                  label: "Hidden · hide profile and remove from member search",
                },
              ]}
            />
          </Field>
          <p className="privacy-status">
            {privacy === "hidden"
              ? "Hidden: other accounts will see “Profile unavailable”."
              : "Public: other accounts can open your profile."}
          </p>
          <h3>In-app notifications</h3>
          <button
            type="button"
            className="text-button"
            onClick={onManageSubscriptions}
          >
            Manage subscriptions
          </button>
          <p>
            Choose which new notifications to receive. Existing history stays
            available. Email verification codes are unaffected.
          </p>
          {[
            [
              "notifications_enabled",
              "Receive in-app notifications",
              "Master switch for new notification delivery.",
            ],
            [
              "notify_replies",
              "Replies to my conversations",
              "Replies and responses in your threads.",
            ],
            [
              "notify_mentions",
              "@Mentions",
              "When someone mentions your @username in a post or reply.",
            ],
            [
              "notify_subscriptions",
              "Followed topics and conversations",
              "New public posts in topics you follow and replies in followed conversations.",
            ],
            [
              "notify_solutions",
              "Solutions and accepted answers",
              "When an answer is accepted or updated.",
            ],
            [
              "notify_projects",
              "Project updates",
              "Updates to projects you follow or participate in.",
            ],
            [
              "notify_events",
              "Event changes",
              "Changes, cancellations and restoration of events you attend.",
            ],
            [
              "show_event_reminders",
              "My upcoming events in the sidebar",
              "Only events you have joined.",
            ],
            [
              "compact_feed",
              "Compact conversation cards",
              "Use less space in the public feed.",
            ],
            [
              "reduce_motion",
              "Reduce animations",
              "Disable interface motion and decorative animation.",
            ],
          ].map(([key, label, hint]) => (
            <label className="preference-toggle" key={key}>
              <span>
                {label}
                <small>{hint}</small>
              </span>
              <input
                type="checkbox"
                role="switch"
                aria-label={label}
                checked={
                  prefs[key] ?? !["compact_feed", "reduce_motion"].includes(key)
                }
                disabled={
                  key.startsWith("notify_") &&
                  prefs.notifications_enabled === false
                }
                onChange={(e) => {
                  setPrefs({ ...prefs, [key]: e.target.checked });
                  setSaved(false);
                }}
              />
            </label>
          ))}
          <button className="button primary" disabled={busy}>
            {saved ? "Preferences saved" : "Save preferences"}
          </button>
        </div>
      </form>
      <div className="settings-section">
        <h3>Connected sign-in methods</h3>
        <p>
          {user.email} ·{" "}
          {user.email_verified
            ? "Email verified"
            : "Legacy email account · email not verified"}
        </p>
        <div className="settings-actions">
          {[
            ["google", "Google", Globe],
            ["github", "GitHub", Github],
          ].map(([key, label, Icon]) =>
            providers[key] ? (
              <a
                key={key}
                className="button secondary"
                href={"/api/auth/" + key + "/start?link=1"}
              >
                <Icon size={16} />
                Connect {label}
              </a>
            ) : (
              <button className="button secondary" disabled key={key}>
                <Icon size={16} />
                {label} · setup required
              </button>
            ),
          )}
        </div>
      </div>
      <div className="settings-section">
        <h3>Your accounts</h3>
        <p>
          Add another account by signing in. Switching uses sessions stored
          securely on this browser.
        </p>
        {accounts.map((a) => (
          <button
            key={a.id}
            className="validator-row"
            style={{ width: "100%" }}
            disabled={a.id === user.id}
            onClick={async () => {
              try {
                await api("/accounts/switch", {
                  method: "POST",
                  body: { user_id: a.id },
                });
                await refresh();
                close();
                location.hash = "profile";
              } catch (e) {
                setError(e.message);
              }
            }}
          >
            <span>
              {a.name}
              <small>@{a.username}</small>
            </span>
            {a.id === user.id ? "Active" : "Switch"}
          </button>
        ))}
        <button
          className="button secondary"
          onClick={() => {
            close();
            onSwitch();
          }}
        >
          <LogIn size={15} />
          Add another account
        </button>
      </div>
      <div className="settings-section">
        <h3>Delete your account</h3>
        <p>
          Revokes every session, removes your profile, links and memberships,
          and anonymizes your public contributions. Existing conversations stay
          readable. Community owners must transfer ownership first.
        </p>
        {!remove ? (
          <button
            className="button secondary danger-button"
            onClick={() => setRemove(true)}
          >
            <Trash2 size={15} />
            Delete account…
          </button>
        ) : (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                await api("/account", { method: "DELETE", body: { confirm } });
                close();
                await refresh();
                location.hash = "feed";
              } catch (e) {
                setError(e.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field label={"Type @" + user.username + " without @ to confirm"}>
              <input
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                autoComplete="off"
              />
            </Field>
            <div className="settings-actions">
              <button
                type="button"
                className="button secondary"
                onClick={() => setRemove(false)}
              >
                Keep account
              </button>
              <button
                className="button primary danger-button"
                disabled={busy || confirm !== user.username}
              >
                Permanently delete account
              </button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
}
