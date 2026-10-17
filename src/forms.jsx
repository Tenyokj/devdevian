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
import { AttachmentPicker } from "./content";
import React, { useState, useCallback, useEffect } from "react";
import {
  ArrowRight,
  Code2,
  Eye,
  PenLine,
  Check,
  Github,
  Globe,
  CalendarDays,
} from "lucide-react";
import { Modal, Field, ErrorMessage, MD, TopicSelect, Avatar } from "./ui";
import { api, types, localZone, tags } from "./data";
export function Auth({ mode, setMode, done, close }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [providers, setProviders] = useState({}),
    [challenge, setChallenge] = useState(null),
    [code, setCode] = useState("");
  useEffect(() => {
    api("/auth/config")
      .then(setProviders)
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (mode !== "link") return;
    let active = true;
    setBusy(true);
    api("/auth/link/pending")
      .then((result) => {
        if (active) setChallenge({ ...result, linking: true });
      })
      .catch((error) => {
        if (active) setError(error.message);
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [mode]);
  return (
    <Modal title="Your community awaits" onClose={close} className="auth-modal">
      <div className="auth-art">
        <img src="/devdevian-logo.png" alt="Devdevian" />
        <span>
          Built for the people
          <br />
          who build things.
        </span>
        <span className="auth-star">✳</span>
      </div>
      <h2>
        {mode === "link"
          ? "Confirm it’s you."
          : mode === "signup"
            ? "Find your people."
            : "Welcome back, builder."}
      </h2>
      <p className="modal-description">
        {mode === "link"
          ? "Your account already exists. Confirm once to connect this sign-in method and keep your profile and activity."
          : mode === "signup"
            ? "A little curiosity. A good conversation. Your next big thing."
            : "Pick up a conversation. Move your next idea forward."}
      </p>
      {!challenge && mode !== "link" && (
        <>
          <div className="auth-provider-grid">
            {[
              ["google", "Google"],
              ["github", "GitHub"],
            ].map(([key, label]) =>
              providers[key] ? (
                <a href={"/api/auth/" + key + "/start"} key={key}>
                  {key === "github" ? (
                    <Github size={18} />
                  ) : (
                    <Globe size={18} />
                  )}
                  Continue with {label}
                </a>
              ) : (
                <button key={key} disabled title="Provider setup required">
                  {key === "github" ? (
                    <Github size={18} />
                  ) : (
                    <Globe size={18} />
                  )}
                  Continue with {label}
                </button>
              ),
            )}
          </div>
          <div className="auth-divider">or continue with email</div>
        </>
      )}
      {challenge && (
        <p className="form-note">
          A six-digit code was sent to {challenge.email}.{" "}
          {challenge.linking
            ? "Enter it to sign in to your existing account and connect " +
              (challenge.provider === "github" ? "GitHub" : "Google") +
              ". Next time, you can sign in directly."
            : "Enter it below to finish creating your account."}
        </p>
      )}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            const result = await api(
              challenge
                ? challenge.linking
                  ? "/auth/link/verify"
                  : "/auth/verify"
                : mode === "signup"
                  ? "/register"
                  : "/login",
              {
                method: "POST",
                body: challenge
                  ? { challenge: challenge.challenge, code }
                  : formObject(e.currentTarget),
              },
            );
            if (result.verification_required) {
              setChallenge(result);
              return;
            }
            await done(result.user);
          } catch (e) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {!challenge && mode !== "link" && (
          <>
            {mode === "signup" && (
              <Field label="Your name">
                <input
                  name="name"
                  required
                  maxLength={80}
                  placeholder="What should we call you?"
                  autoComplete="name"
                />
              </Field>
            )}
            {mode === "signup" && (
              <Field
                label="Username"
                hint="Choose carefully: your @username is permanent. You can change your display name later."
              >
                <input
                  name="username"
                  required
                  pattern="[A-Za-z][A-Za-z0-9_]{2,29}"
                  minLength={3}
                  maxLength={30}
                  placeholder="tenyokj"
                  autoComplete="username"
                />
              </Field>
            )}
            <Field label="Email address">
              <input
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="you@example.com"
              />
            </Field>
            <Field
              label="Password"
              hint={mode === "signup" ? "At least 8 characters." : ""}
            >
              <input
                name="password"
                type="password"
                minLength={8}
                maxLength={256}
                required
                autoComplete={
                  mode === "signup" ? "new-password" : "current-password"
                }
                placeholder="Your password"
              />
            </Field>
          </>
        )}
        {challenge && (
          <Field label="Verification code">
            <input
              className="verification-code"
              aria-label="Verification code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            />
          </Field>
        )}
        <ErrorMessage error={error} />
        <button
          className="button primary full"
          disabled={busy || (mode === "link" && !challenge)}
        >
          {busy
            ? "One moment…"
            : challenge
              ? challenge.linking
                ? "Confirm & sign in"
                : "Verify email & join"
              : mode === "signup"
                ? "Create account"
                : "Sign in"}
          <ArrowRight size={16} />
        </button>
      </form>
      {challenge && (
        <p className="auth-switch">
          <button
            onClick={async () => {
              setBusy(true);
              try {
                await api(
                  challenge.linking ? "/auth/link/resend" : "/auth/resend",
                  {
                    method: "POST",
                    body: { challenge: challenge.challenge },
                  },
                );
                setError("");
              } catch (e) {
                setError(e.message);
              } finally {
                setBusy(false);
              }
            }}
            disabled={busy}
          >
            Send a new code
          </button>{" "}
          ·{" "}
          <button
            onClick={() => {
              setChallenge(null);
              setCode("");
              setMode("signin");
            }}
          >
            Start again
          </button>
        </p>
      )}
      <p className="auth-switch">
        {mode === "signup" ? "Already have an account?" : "New around here?"}{" "}
        <button
          onClick={() => {
            setMode(mode === "signup" ? "login" : "signup");
            setError("");
            setChallenge(null);
            setCode("");
          }}
        >
          {mode === "signup" ? "Sign in" : "Join the community"}
        </button>
      </p>
      <p className="auth-policy-links">
        <a href="/privacy" target="_blank" rel="noopener noreferrer">
          Privacy &amp; Security
        </a>
        <span>·</span>
        <a href="/terms" target="_blank" rel="noopener noreferrer">
          Terms of Use
        </a>
      </p>
      <div className="integration-note">
        <Github size={15} />
        <span>
          {providers.google || providers.github
            ? "Use a connected provider or your email account."
            : "Google/GitHub require provider setup. Existing email accounts can sign in."}
        </span>
      </div>
    </Modal>
  );
}
export function Composer({
  communities,
  topics = [],
  communityId = null,
  defaultKind = "discussion",
  defaultTopic = "web",
  close,
  done,
}) {
  const [kind, setKind] = useState(defaultKind),
    [body, setBody] = useState(""),
    [preview, setPreview] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [files, setFiles] = useState([]),
    [uploading, setUploading] = useState(false),
    [audience, setAudience] = useState(communityId || "");
  const [audiences, setAudiences] = useState(communities);
  useEffect(() => {
    let alive = true;
    const pages = communities.pagination?.pages || 1;
    if (pages > 1)
      Promise.all(
        Array.from({ length: pages - 1 }, (_, i) =>
          api("/communities?joined=1&limit=30&page=" + (i + 2)),
        ),
      )
        .then((rest) => alive && setAudiences([...communities, ...rest.flat()]))
        .catch(() => {});
    return () => {
      alive = false;
    };
  }, [communities]);
  return (
    <Modal title="Start a conversation" onClose={close} wide>
      <h2>Put something good out there.</h2>
      <p className="modal-description">
        A question, a fresh perspective, or the thing you stayed up building.
      </p>
      <div className="type-picker">
        {Object.entries(types).map(([key, t]) => (
          <button
            key={key}
            className={kind === key ? "selected" : ""}
            onClick={() => setKind(key)}
          >
            <span className={"type-dot " + t.color} />
            {t.label}
          </button>
        ))}
      </div>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          setBusy(true);
          try {
            const post = await api("/posts", {
              method: "POST",
              body: {
                ...formObject(e.currentTarget),
                repo_url:
                  kind === "review"
                    ? formObject(e.currentTarget).details?.links?.[0]?.url || ""
                    : "",
                demo_url:
                  kind === "showcase"
                    ? formObject(e.currentTarget).details?.links?.[0]?.url || ""
                    : "",
                body,
                kind,
                community_id: audience || null,
                attachment_ids: files.map((f) => f.id),
              },
            });
            await done(post);
          } catch (e) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="form-grid">
          <Field
            label="Topic tag"
            hint="Organizes conversations by subject. This does not choose a community."
          >
            <TopicSelect communities={topics} defaultValue={defaultTopic} />
          </Field>
          <Field
            label="Tools & technologies"
            hint="Choose existing technologies or create your own."
          >
            <TaxonomyPicker kind="technology" name="stack" multiple />
          </Field>
        </div>
        <Field
          label="Who can see this?"
          hint={
            audience
              ? "Only approved members can read this post, its replies and attachments. It will not appear in the public feed."
              : "Public: appears in the shared feed under the topic tag."
          }
        >
          <Select
            aria-label="Publication audience"
            value={audience}
            onChange={(e) => setAudience(e.target.value)}
          >
            <option value="">Public feed · everyone</option>
            {audiences
              .filter((c) => c.is_member !== false)
              .map((c) => (
                <option value={c.id} key={c.id}>
                  Private community · {c.name}
                </option>
              ))}
          </Select>
        </Field>
        <div className="type-explanation">
          <strong>{types[kind].label}</strong>
          <span>
            {
              {
                question:
                  "Ask a specific question. You can accept the answer that solves it.",
                discussion:
                  "Exchange opinions and perspectives. There is no single accepted answer.",
                review:
                  "Share code or a repository, specify what to review, and mark feedback as addressed.",
                showcase:
                  "Present a working idea with a demo or photos and collect product feedback.",
              }[kind]
            }
          </span>
        </div>
        <Field label="Title">
          <input
            name="title"
            minLength={5}
            maxLength={160}
            required
            placeholder={
              kind === "question"
                ? "What are you trying to figure out?"
                : kind === "review"
                  ? "What would you like a second opinion on?"
                  : "Give your conversation a good starting point"
            }
          />
        </Field>
        {kind === "review" && (
          <>
            <Field
              label="Code snippet"
              hint="Provide a snippet or a repository link below."
            >
              <MentionTextarea
                name="code"
                rows={6}
                maxLength={20000}
                placeholder="Paste the relevant code here…"
              />
            </Field>
            <Field label="What should reviewers focus on?">
              <MentionTextarea
                name="review_focus"
                required
                minLength={10}
                maxLength={1500}
                rows={3}
                placeholder="Correctness, performance, security, naming…"
              />
            </Field>
          </>
        )}
        <LinksEditor />
        <div className="editor-label">
          <span>{types[kind].description}</span>
          <button type="button" onClick={() => setPreview(!preview)}>
            {preview ? <PenLine size={14} /> : <Eye size={14} />}{" "}
            {preview ? "Write" : "Preview"}
          </button>
        </div>
        {preview ? (
          <div className="editor-preview">
            <MD>{body || "Nothing to preview yet."}</MD>
          </div>
        ) : (
          <MentionTextarea
            name="body"
            aria-label="Post content"
            rows={9}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            minLength={10}
            maxLength={15000}
            placeholder={
              {
                question:
                  "Describe the problem, what you tried, and the result you need.",
                discussion:
                  "Set the context and invite different perspectives.",
                review:
                  "Explain what the code does and the environment it runs in.",
                showcase:
                  "What did you build, who is it for, and what feedback would help?",
              }[kind] +
              "\n\nMarkdown, links, and fenced code blocks are supported."
            }
          />
        )}
        <div className="editor-footnote">
          <Code2 size={13} />
          Markdown & syntax highlighting supported
        </div>
        <AttachmentPicker
          files={files}
          onChange={setFiles}
          onBusy={setUploading}
        />
        <ErrorMessage error={error} />
        <div className="form-actions">
          <span>
            {audience
              ? "Private · members only"
              : "Public feed · tagged by topic"}
          </span>
          <button
            className="button primary"
            disabled={busy || uploading || body.trim().length < 10}
          >
            {busy ? "Publishing…" : "Publish conversation"}
            <ArrowRight size={16} />
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function ProjectForm({ communities, close, done }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Modal title="Introduce your project" onClose={close} wide>
      <h2>Let’s see what you’re building.</h2>
      <p className="modal-description">
        One project page. One conversation. Feedback that stays together.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            const p = await api("/projects", {
              method: "POST",
              body: formObject(e.currentTarget),
            });
            await done(p);
          } catch (e) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="form-grid">
          <Field label="Project name">
            <input
              name="name"
              required
              minLength={2}
              maxLength={80}
              placeholder="Your next big thing"
            />
          </Field>
          <Field label="Stage">
            <Select name="stage">
              {["Idea", "Prototype", "Beta", "Live"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </Select>
          </Field>
        </div>
        <Field
          label="What does it do?"
          hint="Who is it for, and what problem does it solve?"
        >
          <MentionTextarea
            name="description"
            required
            minLength={20}
            maxLength={5000}
            rows={3}
            placeholder="A little context goes a long way…"
          />
        </Field>
        <LinksEditor />
        <div className="form-grid">
          <MediaPicker name="logo" label="Project logo" />
          <MediaPicker name="screenshots" label="Screenshots" multiple />
        </div>
        <TeamEditor />
        <Field label="One-line pitch">
          <input
            name="detail_tagline"
            maxLength={160}
            placeholder="What makes this project worth trying?"
          />
        </Field>
        <Field label="Who is it for?">
          <MentionTextarea
            name="detail_audience"
            rows={2}
            maxLength={1000}
            placeholder="The people you’re building this for…"
          />
        </Field>
        <Field label="The problem you’re solving">
          <MentionTextarea name="detail_problem" rows={3} maxLength={1000} />
        </Field>
        <div className="form-grid">
          <Field label="Topic tag">
            <TopicSelect communities={communities} />
          </Field>
          <Field label="Tech stack">
            <TaxonomyPicker kind="technology" name="stack" multiple />
          </Field>
        </div>
        <Field
          label="What specific feedback would help?"
          hint="A focused question is much easier to answer than “any thoughts?”."
        >
          <MentionTextarea
            name="help"
            required
            minLength={10}
            maxLength={1500}
            rows={3}
            placeholder="I’d like feedback on the first-run experience. Can you find your way to…"
          />
        </Field>
        <div className="form-note">
          Your project appears in the public project directory and feed under
          its topic tag. No cross-posting or messaging.
        </div>
        <ErrorMessage error={error} />
        <button className="button primary full" disabled={busy}>
          {busy ? "Sharing…" : "Share project & open feedback"}
          <ArrowRight size={16} />
        </button>
      </form>
    </Modal>
  );
}
export function EventForm({ communities, event, close, done }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const zones = [
    ...new Set([
      localZone,
      "UTC",
      "Europe/Kyiv",
      "Europe/London",
      "Europe/Berlin",
      "America/New_York",
      "America/Los_Angeles",
      "Asia/Kolkata",
      "Asia/Singapore",
      "Asia/Tokyo",
      "Africa/Lagos",
    ]),
  ];
  const localStart = event
    ? new Intl.DateTimeFormat("sv-SE", {
        timeZone: event.timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      })
        .format(new Date(event.start_at))
        .replace(" ", "T")
    : undefined;
  return (
    <Modal
      title={event ? "Edit your event" : "Bring people together"}
      onClose={close}
      wide
    >
      <h2>
        {event ? "A little change of plans." : "Good things happen together."}
      </h2>
      <p className="modal-description">
        A small meetup, a live code review, or a conversation worth making time
        for.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            const data = formObject(e.currentTarget);
            await api(event ? "/events/" + event.id : "/events", {
              method: event ? "PATCH" : "POST",
              body: {
                ...data,
                duration: Number(data.duration),
                ...(event ? { revision: event.revision } : {}),
              },
            });
            await done();
          } catch (e) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <MediaPicker
          name="banner"
          label="Event poster or banner"
          initial={event?.banner}
        />
        <LinksEditor initial={event?.links} />
        <Field label="Event title">
          <input
            name="title"
            defaultValue={event?.title}
            required
            minLength={5}
            maxLength={160}
            placeholder="Friday builders: show what you shipped"
          />
        </Field>
        <Field label="What’s the plan?">
          <MentionTextarea
            name="description"
            defaultValue={event?.description}
            required
            minLength={20}
            maxLength={5000}
            rows={3}
            placeholder="Who should join? What will you talk about?"
          />
        </Field>
        <div className="form-grid">
          <Field label="Start date & time">
            <input
              type="datetime-local"
              name="local_start"
              defaultValue={localStart}
              required
            />
          </Field>
          <Field
            label="Organizer timezone"
            hint="The start time above is interpreted in this timezone."
          >
            <Select
              name="timezone"
              defaultValue={event?.timezone || localZone}
              searchable
              options={[
                ...new Set([
                  ...zones,
                  ...(Intl.supportedValuesOf?.("timeZone") || []),
                ]),
              ].map((z) => ({ value: z, label: z }))}
            />
          </Field>
        </div>
        <div className="form-grid">
          <Field label="Duration">
            <Select
              name="duration"
              defaultValue={
                event
                  ? (new Date(event.end_at) - new Date(event.start_at)) / 60000
                  : 60
              }
            >
              {[
                ...new Set([
                  30,
                  45,
                  60,
                  90,
                  120,
                  180,
                  ...(event
                    ? [
                        (new Date(event.end_at) - new Date(event.start_at)) /
                          60000,
                      ]
                    : []),
                ]),
              ].map((n) => (
                <option value={n} key={n}>
                  {n} minutes
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Topic tag">
            <TopicSelect
              communities={communities}
              defaultValue={event?.topic || "web"}
            />
          </Field>
        </div>
        <Field
          label="Meeting link"
          hint="Use your preferred meeting service. Visible to registered attendees and the organizer."
        >
          <input
            name="url"
            defaultValue={event?.url}
            type="url"
            required
            maxLength={1000}
            placeholder="https://meet.google.com/…"
          />
        </Field>
        <ErrorMessage error={error} />
        <button className="button primary full" disabled={busy}>
          {busy
            ? event
              ? "Saving…"
              : "Creating…"
            : event
              ? "Save changes"
              : "Create event"}
          <CalendarDays size={16} />
        </button>
      </form>
    </Modal>
  );
}
export function ProfileEditor({ user, close, done }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Modal title="Your developer profile" onClose={close} wide>
      <h2>A little about you.</h2>
      <p className="modal-description">
        Help the right people find you and your work.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            const fields = formObject(e.currentTarget);
            const d = await api("/developer-profile", {
              method: "PATCH",
              body: fields,
            });
            done(d.user);
          } catch (e) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="form-grid">
          <Field label="Name">
            <input
              name="name"
              defaultValue={user.name}
              required
              maxLength={80}
            />
          </Field>
          <Field label="What do you do?">
            <input
              name="role"
              defaultValue={user.role}
              maxLength={100}
              placeholder="Full-stack developer"
            />
          </Field>
        </div>
        <p className="identity-note">
          @{user.username}{" "}
          <small>Permanent username · only your display name can change.</small>
        </p>
        <div className="form-grid">
          <MediaPicker
            name="avatar"
            label="Profile photo"
            initial={user.avatar}
          />
          <MediaPicker
            name="banner"
            label="Profile banner · optional"
            initial={user.banner}
          />
        </div>
        <Field label="About you">
          <MentionTextarea
            name="bio"
            defaultValue={user.bio}
            maxLength={1000}
            rows={3}
            placeholder="What are you building? What are you curious about?"
          />
        </Field>
        <div className="form-grid">
          <Field label="Your stack">
            <TaxonomyPicker
              kind="technology"
              name="stack"
              defaultValue={user.stack}
              multiple
            />
          </Field>
          <Field label="Location">
            <input
              name="location"
              defaultValue={user.location}
              maxLength={100}
              placeholder="Your corner of the world"
            />
          </Field>
        </div>
        <LinksEditor
          initial={
            user.links || [
              ...(user.github ? [{ label: "GitHub", url: user.github }] : []),
              ...(user.website
                ? [{ label: "Website", url: user.website }]
                : []),
            ]
          }
        />
        <ErrorMessage error={error} />
        <button className="button primary full" disabled={busy}>
          {busy ? "Saving…" : "Save profile"}
          <Check size={16} />
        </button>
      </form>
    </Modal>
  );
}

export function ChooseUsername({ done }) {
  const [username, setUsername] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <Modal
      title="Choose your permanent username"
      onClose={() => {}}
      dismissible={false}
    >
      <h2>Make your name here.</h2>
      <p className="modal-description">
        Choose your unique @username once. Your display name and profile photo
        can be changed later.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await api("/account/username", {
              method: "POST",
              body: { username },
            });
            await done();
          } catch (e) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="Username">
          <input
            name="username"
            required
            pattern="[A-Za-z][A-Za-z0-9_]{2,29}"
            maxLength={30}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </Field>
        <ErrorMessage error={error} />
        <button className="button primary full" disabled={busy}>
          Confirm permanent username
        </button>
      </form>
      <button
        className="text-button"
        onClick={async () => {
          await api("/logout", { method: "POST" });
          await done();
        }}
      >
        Sign out
      </button>
    </Modal>
  );
}
