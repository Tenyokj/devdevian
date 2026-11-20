import React, { useState } from "react";
import { BadgeCheck } from "lucide-react";
import { api } from "./data";
import { ErrorMessage } from "./ui";
export function VerificationManager() {
  const [q, setQ] = useState(""),
    [items, setItems] = useState([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function search(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      setItems((await api("/platform/users?q=" + encodeURIComponent(q))).items);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function toggle(u) {
    if (
      !window.confirm(
        `${u.verified ? "Remove" : "Grant"} verification for @${u.username}?`,
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      const saved = await api(`/platform/users/${u.id}/verification`, {
        method: "PATCH",
        body: { verified: !u.verified },
      });
      setItems((old) =>
        old.map((x) => (x.id === u.id ? { ...x, ...saved } : x)),
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section>
      <h2>Verified profiles</h2>
      <p>
        A blue check identifies a profile reviewed by the Devdevian owner. It
        does not grant moderation or repository permissions.
      </p>
      <form onSubmit={search}>
        <label>
          Find a public profile
          <input
            value={q}
            maxLength={80}
            onChange={(e) => setQ(e.target.value)}
            placeholder="@username or name"
          />
        </label>
        <button className="button" disabled={busy}>
          Search profiles
        </button>
      </form>
      <ErrorMessage error={error} />
      <div className="platform-items">
        {items.map((u) => (
          <article key={u.id}>
            <div>
              <h3>
                {u.name}{" "}
                {u.verified && (
                  <BadgeCheck
                    className="identity-verified"
                    aria-label="Verified profile"
                  />
                )}
              </h3>
              <a href={"#member/" + u.id}>@{u.username}</a>
              <p>
                {u.founder
                  ? "Devdevian founder"
                  : u.verified
                    ? "Verified"
                    : "Not verified"}
              </p>
            </div>
            <button
              className="button secondary"
              disabled={busy || u.founder}
              onClick={() => toggle(u)}
            >
              {u.founder
                ? "Founder · server managed"
                : u.verified
                  ? "Remove verification"
                  : "Grant verification"}
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
