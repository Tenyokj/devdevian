import React, { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { api } from "./data";

export function FollowButton({ kind, item, user, requireUser, toast }) {
  const [following, setFollowing] = useState(false);
  const [loading, setLoading] = useState(!!user);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    setFollowing(false);
    setError("");
    setLoading(!!user);
    if (user)
      api(`/subscriptions/${kind}/${encodeURIComponent(item)}`)
        .then((r) => {
          if (alive) setFollowing(r.following);
        })
        .catch((e) => {
          if (alive) setError(e.message);
        })
        .finally(() => {
          if (alive) setLoading(false);
        });
    return () => {
      alive = false;
    };
  }, [kind, item, user?.id]);
  return (
    <button
      className={
        "text-button follow-button " + (following ? "is-following" : "")
      }
      disabled={loading || busy}
      aria-pressed={following}
      title={
        error ||
        (following
          ? "Stop notifications from this " + kind
          : "Get in-app notifications from this " + kind)
      }
      onClick={() =>
        requireUser(async () => {
          setBusy(true);
          try {
            const result = await api(
              `/subscriptions/${kind}/${encodeURIComponent(item)}`,
              { method: "PUT", body: { following: !following } },
            );
            setFollowing(result.following);
            setError("");
            toast(
              result.following
                ? "Following. New activity will appear in your notifications."
                : "Unfollowed.",
            );
          } catch (e) {
            toast(e.message);
          } finally {
            setBusy(false);
          }
        })
      }
    >
      {following ? <BellOff size={15} /> : <Bell size={15} />}
      {loading
        ? "Loading…"
        : busy
          ? "Saving…"
          : following
            ? "Following"
            : error
              ? "Follow · retry"
              : "Follow " + (kind === "topic" ? "topic" : "conversation")}
    </button>
  );
}
