import {
  MediaPicker,
  formObject,
  TaxonomyPicker,
  PeoplePicker,
} from "./controls";
import React, { useState, useEffect, useCallback } from "react";
import {
  LockKeyhole,
  Plus,
  ArrowUpRight,
  Users,
  Check,
  UserPlus,
  X,
} from "lucide-react";
import { api } from "./data";
import { Modal, PageTitle, Empty, Field, ErrorMessage } from "./ui";
import { Pagination } from "./content";
export function CommunityDirectory({
  items,
  query,
  onSearch,
  go,
  onRefresh,
  onPage,
  requireUser,
  user,
}) {
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <PageTitle
        eyebrow="YOUR OWN CORNER OF THE INTERNET"
        title="Good company. A private space."
        description="Topics organize the public feed. Communities are separate, members-only spaces."
        action="Create a community"
        onClick={() => requireUser(() => setOpen(true))}
      />
      <input
        className="directory-search"
        aria-label="Search communities"
        placeholder="Search communities…"
        value={query}
        onChange={(e) => onSearch?.(e.target.value)}
      />
      <div className="community-grid">
        {items.map((c) => (
          <article className="community-card" key={c.id}>
            {c.banner && (
              <img
                className="entity-banner"
                src={"/api/uploads/" + c.banner}
                alt=""
              />
            )}
            <div className="community-card-top">
              <span
                className={
                  "community-symbol violet " + (c.logo ? "has-logo" : "")
                }
              >
                {c.logo ? (
                  <img
                    className="entity-logo"
                    src={"/api/uploads/" + c.logo}
                    alt=""
                  />
                ) : (
                  <LockKeyhole size={22} />
                )}
              </span>
              <span className="kind-badge violet">
                {c.is_owner ? "Owner" : c.is_member ? "Member" : "Private"}
              </span>
            </div>
            <a href={"#community/" + c.id}>
              <h2>
                {c.name}
                <ArrowUpRight size={17} />
              </h2>
            </a>
            <p>{c.description}</p>
            <div className="community-card-footer">
              <span>
                <Users size={13} />
                {c.members} members
              </span>
              <button
                className="text-button"
                onClick={() => go("community/" + c.id)}
              >
                {c.is_member
                  ? "Open community"
                  : c.requested
                    ? "Request pending"
                    : "View access"}
                <ArrowUpRight size={13} />
              </button>
            </div>
          </article>
        ))}
      </div>
      {!items.length && (
        <Empty
          icon={LockKeyhole}
          title={
            query
              ? "No communities match this search."
              : "A small circle starts with you."
          }
          description="Create a private community for your team or ask an owner for access. Its conversations never appear in the public feed."
          action="Create a community"
          onClick={() => requireUser(() => setOpen(true))}
        />
      )}
      <Pagination meta={items.pagination} label="communities" onPage={onPage} />
      {open && (
        <Modal title="Create a private community" onClose={close}>
          <h2>A space for your people.</h2>
          <p className="modal-description">
            The name and description appear in the directory. Only approved
            members can read or publish conversations and files.
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                const c = await api("/communities", {
                  method: "POST",
                  body: formObject(e.currentTarget),
                });
                setOpen(false);
                await onRefresh();
                go("community/" + c.id);
              } catch (e) {
                setError(e.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <div className="form-grid">
              <MediaPicker name="logo" label="Community logo" />
              <MediaPicker name="banner" label="Community banner" />
            </div>
            <CommunityTopics />
            <Field label="Community name">
              <input name="name" required minLength={3} maxLength={80} />
            </Field>
            <Field label="Who is this space for?">
              <textarea
                name="description"
                required
                minLength={10}
                maxLength={1500}
                rows={4}
              />
            </Field>
            <ErrorMessage error={error} />
            <button className="button primary full" disabled={busy}>
              {busy ? "Creating…" : "Create private community"}
              <LockKeyhole size={15} />
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
export function CommunityHeader({
  community,
  requireUser,
  onRefresh,
  onCreate,
  go,
  user,
}) {
  const [manage, setManage] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const close = useCallback(() => setManage(false), []);
  if (!community)
    return <div className="loading-state">Loading community…</div>;
  return (
    <>
      {community.banner && (
        <img
          className="entity-banner community-banner"
          src={"/api/uploads/" + community.banner}
          alt=""
        />
      )}
      <section className="community-hero">
        <span
          className={
            "community-symbol large violet " +
            (community.logo ? "has-logo" : "")
          }
        >
          {community.logo ? (
            <img
              className="entity-logo"
              src={"/api/uploads/" + community.logo}
              alt=""
            />
          ) : (
            <LockKeyhole size={30} />
          )}
        </span>
        <div>
          <h1>{community.name}</h1>
          <p>{community.description}</p>
          <div className="topic-chips">
            {community.topic_labels?.map((t) => (
              <span key={t}># {t}</span>
            ))}
          </div>
          <div className="community-hero-meta">
            <span>
              <Users size={14} />
              {community.members} members
            </span>
            <span>Owner: {community.owner_name}</span>
            {community.is_member && (
              <span>{community.posts} conversations</span>
            )}
          </div>
        </div>
        {community.is_owner || community.is_validator ? (
          <button className="button secondary" onClick={() => setManage(true)}>
            <UserPlus size={15} />
            Manage access
          </button>
        ) : community.is_member ? (
          <button
            className="button secondary"
            onClick={async () => {
              try {
                await api("/membership", {
                  method: "POST",
                  body: { kind: "group", item: community.id },
                });
                await onRefresh();
              } catch (e) {
                setError(e.message);
              }
            }}
          >
            Leave community
          </button>
        ) : (
          <button
            className="button primary"
            disabled={community.requested || busy}
            onClick={() =>
              requireUser(async () => {
                setBusy(true);
                try {
                  await api(`/communities/${community.id}/request`, {
                    method: "POST",
                    body: {},
                  });
                  await onRefresh();
                } catch (e) {
                  setError(e.message);
                } finally {
                  setBusy(false);
                }
              })
            }
          >
            {community.requested
              ? "Request pending"
              : busy
                ? "Sending…"
                : "Request to join"}
            <LockKeyhole size={14} />
          </button>
        )}
      </section>
      {community.is_member && (
        <div className="community-compose-bar">
          <span>Private conversations · visible only to approved members</span>
          <button className="button primary" onClick={onCreate}>
            <Plus size={15} />
            New private conversation
          </button>
        </div>
      )}
      <ErrorMessage error={error} />
      {!community.is_member && (
        <Empty
          icon={LockKeyhole}
          title="This conversation stays inside."
          description="You can read and publish here after the owner approves your access request. No posts or files are visible outside the community."
        />
      )}
      {manage && (
        <ManageAccess community={community} close={close} refresh={onRefresh} />
      )}
    </>
  );
}
function ManageAccess({ community, close, refresh }) {
  const [page, setPage] = useState(1),
    [items, setItems] = useState([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      setItems(await api(`/communities/${community.id}/requests?page=${page}`));
      setError("");
    } catch (e) {
      setError(e.message);
    }
  }, [community.id, page]);
  useEffect(() => {
    load();
  }, [load]);
  return (
    <Modal title="Community access requests" onClose={close}>
      <h2>Let the right people in.</h2>
      <p className="modal-description">
        The owner and appointed validators review requests and reports. Approved
        members can read and publish in this community.
      </p>
      {community.is_owner && <ValidatorEditor community={community} />}
      <ErrorMessage error={error} />
      {items.map((r) => (
        <div className="access-request" key={r.id}>
          <span>{r.name}</span>
          <button
            className="small-action"
            disabled={busy}
            onClick={() => act(r, "approve")}
          >
            <Check size={15} />
            Approve
          </button>
          <button
            className="icon-button"
            disabled={busy}
            onClick={() => act(r, "reject")}
            aria-label={"Reject " + r.name}
          >
            <X size={16} />
          </button>
        </div>
      ))}
      {!items.length && (
        <Empty
          title="No requests waiting."
          description="Share the community’s page with the people you’d like to join."
        />
      )}
      <Pagination meta={items.pagination} label="requests" onPage={setPage} />
    </Modal>
  );
  async function act(r, action) {
    setBusy(true);
    try {
      await api(`/communities/${community.id}/requests/${r.id}`, {
        method: "PATCH",
        body: { action },
      });
      await load();
      await refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
}

function CommunityTopics() {
  const [ids, setIds] = useState([]),
    [names, setNames] = useState({});
  return (
    <div className="field">
      <span className="field-caption">Main topics</span>
      <input type="hidden" name="detail_topics" value={JSON.stringify(ids)} />
      <TopicAdder
        onAdd={(t) => {
          if (!ids.includes(t.id)) setIds([...ids, t.id]);
          setNames({ ...names, [t.id]: t.name });
        }}
      />
      <div className="topic-chips">
        {ids.map((id) => (
          <button
            type="button"
            key={id}
            onClick={() => setIds(ids.filter((v) => v !== id))}
          >
            {names[id]} ×
          </button>
        ))}
      </div>
    </div>
  );
}
function TopicAdder({ onAdd }) {
  const [topics, setTopics] = useState([]),
    [selected, setSelected] = useState("");
  useEffect(() => {
    api("/topics")
      .then(setTopics)
      .catch(() => {});
  }, []);
  return (
    <div className="link-row">
      <TaxonomyPicker initial={topics} name="unused_topic" />
      <button
        type="button"
        className="button secondary"
        onClick={(e) => {
          const value = e.currentTarget.parentElement.querySelector(
            "input[name=unused_topic]",
          ).value;
          api("/topics").then((all) => {
            const t = all.find((t) => t.id === value);
            if (t) onAdd(t);
          });
        }}
      >
        Add topic
      </button>
    </div>
  );
}
function ValidatorEditor({ community }) {
  const [items, setItems] = useState([]),
    [error, setError] = useState("");
  useEffect(() => {
    api(`/communities/${community.id}/validators`)
      .then(setItems)
      .catch((e) => setError(e.message));
  }, [community.id]);
  async function save(next) {
    try {
      await api(`/communities/${community.id}/validators`, {
        method: "PUT",
        body: { user_ids: next.map((p) => p.id) },
      });
      setItems(next);
      setError("");
    } catch (e) {
      setError(e.message);
    }
  }
  return (
    <div className="settings-section">
      <h3>Community validators</h3>
      <p>
        Choose approved members. They can approve join requests and review
        reports in this community.
      </p>
      <PeoplePicker
        label="Find an approved member"
        path={"/communities/" + community.id + "/members"}
        onChoose={(p) => {
          if (!items.some((v) => v.id === p.id)) save([...items, p]);
        }}
      />
      {items.map((p) => (
        <div className="validator-row" key={p.id}>
          <span>
            {p.name}
            <small>@{p.username}</small>
          </span>
          <button
            onClick={() => save(items.filter((v) => v.id !== p.id))}
            aria-label={"Remove validator " + p.name}
          >
            <X size={14} />
          </button>
        </div>
      ))}
      <ErrorMessage error={error} />
      <OwnershipTransfer community={community} />
    </div>
  );
}

function OwnershipTransfer({ community }) {
  const [person, setPerson] = useState(null),
    [error, setError] = useState("");
  return (
    <div className="settings-section">
      <h3>Transfer ownership</h3>
      <p>
        You will remain a member. The new owner will control this community and
        its validators.
      </p>
      <PeoplePicker
        label="Choose the next owner"
        path={"/communities/" + community.id + "/members"}
        onChoose={setPerson}
      />
      {person && (
        <div className="form-note">
          Transfer this community to {person.name}?
          <button
            className="button secondary danger-button"
            onClick={async () => {
              try {
                await api("/communities/" + community.id + "/owner", {
                  method: "PATCH",
                  body: { user_id: person.id },
                });
                location.reload();
              } catch (e) {
                setError(e.message);
              }
            }}
          >
            Confirm ownership transfer
          </button>
          <button onClick={() => setPerson(null)}>Cancel</button>
        </div>
      )}
      <ErrorMessage error={error} />
    </div>
  );
}
