import { FollowButton } from "./follow";
import PolicyPage from "./policies";
import Landing from "./landing";
import { Settings } from "./settings";
import { GlobalSearch } from "./search";
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
import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useLayoutEffect,
} from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import {
  Compass,
  MessagesSquare,
  Users,
  FolderGit2,
  CalendarDays,
  Bookmark,
  Search,
  Plus,
  ArrowUpRight,
  ArrowRight,
  ArrowLeft,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Code2,
  Sparkles,
  Menu,
  X,
  MessageCircle,
  Check,
  CheckCircle2,
  Clock,
  MapPin,
  Github,
  Globe,
  LogOut,
  SlidersHorizontal,
  Flame,
  Radio,
  Flag,
  RefreshCw,
  Link as LinkIcon,
  PenLine,
  Send,
  ExternalLink,
  Lightbulb,
  HelpCircle,
  Sun,
  Moon,
} from "lucide-react";
import {
  Brand,
  Avatar,
  MD,
  Empty,
  PageTitle,
  Modal,
  Field,
  ErrorMessage,
} from "./ui";
import {
  Auth,
  Composer,
  ProjectForm,
  EventForm,
  ProfileEditor,
  ChooseUsername,
} from "./forms";
import { api, types, dateOnly, dateTime, localZone, tags } from "./data";
import { initialTheme, applyTheme } from "./theme";
import {
  NotificationCenter,
  EditContent,
  ProjectUpdateForm,
  ProjectTimeline,
} from "./activity";
import { PostControls, EventControls, Moderation } from "./management";
import {
  Pagination,
  AttachmentPicker,
  Attachments,
  ReplyThreads,
} from "./content";
import { CommunityDirectory, CommunityHeader } from "./spaces";
import "./style.css";
import "./refresh.css";
const navigation = [
  ["feed", "Public feed", Compass],
  ["communities", "Communities", Users],
  ["projects", "Projects", FolderGit2],
  ["events", "Events", CalendarDays],
];
function useRoute() {
  const [route, set] = useState(location.hash.slice(1) || "feed");
  useEffect(() => {
    const handle = () => set(location.hash.slice(1) || "feed");
    window.addEventListener("hashchange", handle);
    return () => window.removeEventListener("hashchange", handle);
  }, []);
  return route;
}
export function App() {
  const [eventTopic, setEventTopic] = useState(""),
    [eventDate, setEventDate] = useState(""),
    [eventOrder, setEventOrder] = useState("soonest");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(
    () => window.localStorage?.getItem("devdevian-sidebar") === "collapsed",
  );
  const [theme, setTheme] = useState(initialTheme);
  useLayoutEffect(() => applyTheme(theme), [theme]);
  const route = useRoute();
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.has("auth_link")) {
      setAuth("link");
      history.replaceState(null, "", location.pathname + location.hash);
    }
    const error = params.get("auth_error");
    if (error) {
      setToast(
        error === "link_existing"
          ? "This email already has an account. Sign in, then connect this provider in Settings."
          : error === "link_wait"
            ? "A confirmation code was sent recently. Check the earlier sign-in tab, or wait one minute and start again."
            : error === "link_mail"
              ? "Could not send the sign-in confirmation. Try again, or use your existing sign-in method."
              : "Sign-in was cancelled or could not be completed. Please try again.",
      );
      history.replaceState(null, "", location.pathname + location.hash);
    }
  }, []);
  const [page, id] = route.split("/");
  useEffect(() => {
    if (page === "handle")
      api("/handles/" + encodeURIComponent(id))
        .then((u) => {
          location.hash = "member/" + u.id;
        })
        .catch(() => {
          location.hash = "feed";
        });
  }, [page, id]);
  const [user, setUser] = useState(null),
    [posts, setPosts] = useState([]),
    [communities, setCommunities] = useState([]),
    [projects, setProjects] = useState([]),
    [events, setEvents] = useState([]),
    [myEvents, setMyEvents] = useState([]),
    [loading, setLoading] = useState(true),
    [loadError, setLoadError] = useState("");
  const [auth, setAuth] = useState(null),
    [composer, setComposer] = useState(null),
    [projectForm, setProjectForm] = useState(false),
    [eventForm, setEventForm] = useState(false),
    [editor, setEditor] = useState(false),
    [toast, setToast] = useState(""),
    [mobile, setMobile] = useState(false),
    [query, setQuery] = useState(""),
    [sort, setSort] = useState("Recent"),
    [typeFilter, setTypeFilter] = useState("all");
  const [detail, setDetail] = useState(null),
    [member, setMember] = useState(null),
    [detailError, setDetailError] = useState("");
  const go = (path) => {
    location.hash = path;
  };
  const [topics, setTopics] = useState([]),
    [joinedCommunities, setJoinedCommunities] = useState([]),
    [communityDetail, setCommunityDetail] = useState(null),
    [listPage, setListPage] = useState(1);
  useEffect(() => {
    document.documentElement.dataset.reduceMotion = user?.preferences
      ?.reduce_motion
      ? "true"
      : "false";
  }, [user?.preferences?.reduce_motion]);
  const [debouncedQuery, setDebouncedQuery] = useState(query);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(timer);
  }, [query]);
  const requestVersion = useRef(0);
  const accountIdentity = useRef(null);
  const clearAccountData = useCallback(() => {
    setPosts([]);
    setCommunities([]);
    setProjects([]);
    setEvents([]);
    setJoinedCommunities([]);
    setMyEvents([]);
    setCommunityDetail(null);
    setDetail(null);
    setMember(null);
    setTopics([]);
  }, []);
  const refresh = useCallback(async () => {
    const version = ++requestVersion.current;
    setLoadError("");
    const params = new URLSearchParams({ page: String(listPage), limit: "12" });
    if (debouncedQuery) params.set("q", debouncedQuery);
    if (typeFilter !== "all") params.set("kind", typeFilter);
    if (sort === "Active") params.set("sort", "active");
    if (sort === "Needs help") params.set("sort", "help");
    if (page === "community") params.set("community", id);
    if (page === "tag") params.set("topic", id);
    if (page === "saved") params.set("saved", "1");
    if (page === "profile") params.set("author", "me");
    const list = new URLSearchParams({
      page: String(listPage),
      limit: "12",
      q: debouncedQuery,
    });
    const ev = new URLSearchParams(list);
    if (eventTopic) ev.set("topic", eventTopic);
    if (eventDate) {
      ev.set("date", eventDate);
      ev.set("timezone", localZone);
    }
    ev.set("order", eventOrder);
    if (sort === "Upcoming") ev.set("status", "upcoming");
    if (sort === "Past") ev.set("status", "past");
    if (page === "profile") ev.set("mine", "1");
    if (page === "profile") list.set("joined", "1");
    try {
      const projectList = new URLSearchParams(list);
      if (page === "profile") projectList.set("author", "me");
      if (page === "member") projectList.set("author", id);
      // Fetch only the active screen. Sidebar data must not delay its first paint.
      const updates = [];
      let staging = true,
        nextUser;
      const active = (path, setter) =>
        api(path).then((value) => {
          if (version !== requestVersion.current) return;
          if (staging) updates.push(() => setter(value));
          else setter(value);
        });
      const tasks = [
        api("/me").then((value) => {
          nextUser = value.user;
          updates.push(() => setUser(value.user));
        }),
      ];
      if (["feed", "tag", "saved", "community", "profile"].includes(page))
        tasks.push(
          api("/posts?" + params)
            .catch((e) => {
              if (e.status === 403 && page === "community") return [];
              throw e;
            })
            .then((value) => {
              updates.push(() => setPosts(value));
            }),
        );
      if (["communities", "profile", "member"].includes(page))
        tasks.push(active("/communities?" + list, setCommunities));
      if (["projects", "profile", "member"].includes(page))
        tasks.push(active("/projects?" + projectList, setProjects));
      if (["events", "profile", "member"].includes(page))
        tasks.push(active("/events?" + ev, setEvents));
      if (page === "community")
        tasks.push(active("/communities/" + id, setCommunityDetail));
      else setCommunityDetail(null);
      await Promise.all(tasks);
      if (version !== requestVersion.current) return;
      if (accountIdentity.current !== (nextUser?.id ?? null)) {
        clearAccountData();
        accountIdentity.current = nextUser?.id ?? null;
      }
      for (const update of updates) update();
      staging = false;
      setLoading(false);
      // Failures in reminders or catalogs leave the current screen usable.
      void Promise.allSettled([
        active("/topics", setTopics),
        active("/communities?joined=1&limit=30", setJoinedCommunities),
        active("/events?attending=1&status=upcoming&limit=2", setMyEvents),
      ]);
    } catch (e) {
      if (version === requestVersion.current) {
        setLoadError(e.message);
        throw e;
      }
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, [
    clearAccountData,
    page,
    id,
    debouncedQuery,
    sort,
    typeFilter,
    listPage,
    eventTopic,
    eventDate,
    eventOrder,
  ]);
  useEffect(() => {
    setListPage(1);
  }, [route, query, sort, typeFilter, eventTopic, eventDate, eventOrder]);
  useEffect(() => {
    refresh().catch(() => {});
  }, [refresh]);
  useEffect(() => {
    setMobile(false);
    setQuery("");
    setSort("Recent");
    setTypeFilter("all");
    setDetail(null);
    setMember(null);
    setDetailError("");
    window.scrollTo(0, 0);
    let active = true;
    if (page === "post")
      api(
        "/posts/" +
          encodeURIComponent(id) +
          (route.split("/")[2] === "reply"
            ? "?reply_id=" + route.split("/")[3]
            : ""),
      )
        .then((d) => {
          if (active) setDetail(d);
        })
        .catch((e) => {
          if (active) setDetailError(e.message);
        });
    if (page === "member")
      api("/users/" + encodeURIComponent(id) + "?page=" + listPage)
        .then((d) => {
          if (active) setMember(d);
        })
        .catch((e) => {
          if (active) setDetailError(e.message);
        });
    return () => {
      active = false;
    };
  }, [route, user?.id]);
  useEffect(() => {
    if (page === "member")
      api("/users/" + id + "?page=" + listPage)
        .then(setMember)
        .catch((e) => setDetailError(e.message));
  }, [listPage]);
  useEffect(() => {
    const parts = route.split("/");
    if (detail && parts[2] === "reply") {
      document
        .getElementById("reply-" + parts[3])
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [detail, route]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
      if (e.key === "Escape") setMobile(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  useEffect(() => {
    if (page === "events" && id)
      document
        .getElementById("event-" + id)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [events, route]);
  const has = (kind, item) =>
    !!user?.memberships.some((m) => m.kind === kind && m.item === String(item));
  const authorized = (action) => {
    if (!user) {
      setAuth("signup");
      return;
    }
    action();
  };
  async function membership(kind, item) {
    if (!user) {
      setAuth("signup");
      return;
    }
    try {
      const result = await api("/membership", {
        method: "POST",
        body: { kind, item: String(item) },
      });
      setUser(result.user);
      setToast(
        has(kind, item)
          ? "Removed from your profile."
          : kind === "event"
            ? "You’re on the list. See you there!"
            : kind === "group"
              ? "Welcome to the community."
              : "Saved for a little later.",
      );
      await refresh();
    } catch (e) {
      setToast(e.message);
    }
  }
  async function vote(p) {
    authorized(async () => {
      try {
        const updated = await api(`/posts/${p.id}/vote`, { method: "POST" });
        setPosts((all) =>
          Object.assign(
            all.map((item) => (item.id === p.id ? updated : item)),
            { pagination: all.pagination },
          ),
        );
        if (detail?.id === p.id)
          setDetail((current) => ({ ...current, ...updated }));
      } catch (e) {
        setToast(e.message);
      }
    });
  }
  async function reloadPost(
    updatesPage = detail?.updates_pagination?.page || 1,
  ) {
    const target =
      route.split("/")[2] === "reply" ? "&reply_id=" + route.split("/")[3] : "";
    const d = await api(
      "/posts/" + id + "?updates_page=" + updatesPage + target,
    );
    setDetail(d);
    await refresh();
  }
  const closeAuth = useCallback(() => setAuth(null), []),
    closeComposer = useCallback(() => setComposer(null), []),
    closeProject = useCallback(() => setProjectForm(false), []),
    closeEvent = useCallback(() => setEventForm(false), []),
    closeEditor = useCallback(() => setEditor(false), []);
  const community = communityDetail;
  const topicName = (topic) =>
    topics.find((t) => t.id === topic)?.name || topic;
  const isFeed =
    ["feed", "tag", "saved"].includes(page) ||
    (page === "community" && community?.is_member);
  const feed = posts.filter(
    (p) =>
      page === "saved" ||
      (page === "community" ? p.community_id === id : !p.community_id),
  );
  const create = (kind = "discussion", topic = page === "tag" ? id : "web") =>
    authorized(() =>
      setComposer({
        kind,
        topic,
        community_id: page === "community" ? id : null,
      }),
    );
  const title =
    page === "moderation"
      ? "Moderation"
      : page === "community"
        ? community?.name || "Community"
        : page === "post"
          ? "Conversation"
          : page === "member"
            ? "Developer profile"
            : page === "profile"
              ? "Your profile"
              : navigation.find((n) => n[0] === page)?.[1] || "Saved posts";
  return (
    <div
      className={
        "app " +
        (collapsed ? "sidebar-collapsed " : "") +
        (user?.preferences?.compact_feed ? "feed-compact" : "")
      }
    >
      {settingsOpen && user && (
        <Settings
          user={user}
          close={() => setSettingsOpen(false)}
          refresh={refresh}
          onSwitch={() => setAuth("login")}
        />
      )}
      {searchOpen && (
        <GlobalSearch
          close={() => setSearchOpen(false)}
          topics={topics}
          onNavigate={go}
        />
      )}
      <aside className={"sidebar " + (mobile ? "is-open" : "")}>
        <Brand />
        <button
          className="sidebar-collapse icon-button"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          onClick={() =>
            setCollapsed((v) => {
              window.localStorage?.setItem(
                "devdevian-sidebar",
                v ? "expanded" : "collapsed",
              );
              return !v;
            })
          }
        >
          <Menu size={17} />
        </button>
        <div className="workspace-status">
          <span className="status-dot" />
          THE DEVELOPER COMMONS<span className="beta-badge">BETA</span>
        </div>
        <nav aria-label="Main navigation">
          {navigation.map(([key, label, Icon]) => (
            <a
              key={key}
              href={"#" + key}
              className={
                "nav-item " +
                (page === key || (key === "communities" && page === "community")
                  ? "active"
                  : "")
              }
            >
              <Icon size={19} />
              <span>{label}</span>
              {page === key && <span className="nav-active-mark" />}
            </a>
          ))}
          <div className="nav-rule" />
          <a
            href="#saved"
            className={"nav-item " + (page === "saved" ? "active" : "")}
          >
            <Bookmark size={19} />
            <span>Saved for later</span>
            {user && (
              <span className="nav-number">
                {user.memberships.filter((m) => m.kind === "post").length}
              </span>
            )}
          </a>
          <a
            href="#profile"
            className={"nav-item " + (page === "profile" ? "active" : "")}
          >
            <Code2 size={19} />
            <span>Your corner</span>
          </a>
          {user?.platform_role === "moderator" && (
            <a
              href="#moderation/public"
              className={
                "nav-item " +
                (page === "moderation" && id === "public" ? "active" : "")
              }
            >
              <Flag size={19} />
              <span>Platform moderation</span>
            </a>
          )}
          {!!user?.managed_communities?.length && (
            <a
              href="#moderation/communities"
              className={
                "nav-item " +
                (page === "moderation" && id !== "public" ? "active" : "")
              }
            >
              <Flag size={19} />
              <span>Community moderation</span>
            </a>
          )}
        </nav>
        <div className="sidebar-section-heading">
          YOUR COMMUNITIES
          <button
            onClick={() => go("communities")}
            aria-label="Find communities"
          >
            <Plus size={14} />
          </button>
        </div>
        <div className="sidebar-communities">
          {joinedCommunities.filter((c) => c.is_member).length ? (
            joinedCommunities
              .filter((c) => c.is_member)
              .map((c) => (
                <a key={c.id} href={"#community/" + c.id}>
                  {c.logo ? (
                    <img
                      className="sidebar-community-logo"
                      src={"/api/uploads/" + c.logo}
                      alt=""
                    />
                  ) : (
                    <span className={"community-dot " + c.color} />
                  )}
                  {c.name}
                </a>
              ))
          ) : (
            <p>
              A good conversation starts
              <br />
              with finding your people.
              <button onClick={() => go("communities")}>
                Explore communities
                <ArrowRight size={13} />
              </button>
            </p>
          )}
        </div>
        <div className="sidebar-bottom">
          <div className="sidebar-card">
            <Lightbulb size={19} />
            <h3>Something on your mind?</h3>
            <p>
              Someone here might have
              <br />
              just the perspective you need.
            </p>
            <button onClick={() => create("question")}>
              Ask a question
              <ArrowUpRight size={15} />
            </button>
          </div>
          <button
            className="account-button"
            onClick={() => (user ? go("profile") : setAuth("login"))}
          >
            <Avatar name={user?.name || "New builder"} image={user?.avatar} />
            <span>
              {user?.name || "Your place is here"}
              <small>{user?.role || "Join the community"}</small>
            </span>
            <ChevronDown size={14} />
          </button>
        </div>
      </aside>
      {mobile && (
        <div className="sidebar-scrim" onClick={() => setMobile(false)} />
      )}
      <div className="main-shell">
        <header className="topbar">
          <div className="topbar-location">
            <button
              className="icon-button mobile-menu"
              onClick={() => setMobile(!mobile)}
              aria-label="Toggle navigation"
            >
              <Menu size={21} />
            </button>
            <span className="header-note">
              <span className="status-dot" /> A space for curious minds
            </span>
          </div>
          <div className="topbar-right">
            {user && (
              <NotificationCenter
                key={user.id}
                user={user}
                onNavigate={(path) => {
                  if (path === route)
                    reloadPost().catch((e) => setToast(e.message));
                  else go(path);
                }}
              />
            )}
            <button
              className="theme-toggle icon-button"
              onClick={() =>
                setTheme((current) => (current === "dark" ? "light" : "dark"))
              }
              aria-label={
                theme === "dark"
                  ? "Switch to light theme"
                  : "Switch to dark theme"
              }
              title={theme === "dark" ? "Light theme" : "Dark theme"}
              aria-pressed={theme === "dark"}
            >
              {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button
              className="global-search"
              onClick={() => setSearchOpen(true)}
            >
              <Search size={17} />
              <span>Find your next idea…</span>
              <kbd>⌘ K</kbd>
            </button>
            {user && (
              <button
                className="icon-button"
                aria-label="Open settings"
                title="Settings"
                onClick={() => setSettingsOpen(true)}
              >
                <SlidersHorizontal size={17} />
              </button>
            )}
            {user ? (
              <Avatar
                name={user.name}
                image={user.avatar}
                onClick={() => go("profile")}
              />
            ) : (
              <button
                className="signin-button"
                onClick={() => setAuth("login")}
              >
                Sign in
                <ArrowUpRight size={14} />
              </button>
            )}
          </div>
        </header>
        <main key={route}>
          {loadError ? (
            <div className="load-error">
              <span>{loadError}</span>
              <button onClick={() => refresh().catch(() => {})}>
                Try again
                <RefreshCw size={14} />
              </button>
            </div>
          ) : null}
          {loading ? (
            <div className="loading-state">
              <span className="spinner" />
              Getting the house ready…
            </div>
          ) : (
            <>
              {page === "community" && !community?.is_member && (
                <CommunityHeader
                  community={community}
                  onCreate={() => create()}
                  user={user}
                  requireUser={authorized}
                  onRefresh={refresh}
                  go={go}
                />
              )}
              {isFeed && (
                <>
                  {page === "feed" || page === "tag" ? (
                    <section className="feed-intro">
                      <div>
                        <span className="eyebrow">
                          <span className="tiny-dot" />
                          PUBLIC FEED · OPEN CONVERSATIONS
                        </span>
                        <h1>
                          A little curiosity.
                          <br />A lot of possibility
                          <span className="accent-text">.</span>
                        </h1>
                        <p>
                          A place to ask, share, build, and figure things out
                          together.
                        </p>
                        <div className="intro-actions">
                          <button
                            className="button primary"
                            onClick={() => create()}
                          >
                            <Plus size={16} />
                            Start a conversation
                          </button>
                          <button
                            className="text-button"
                            onClick={() => go("communities")}
                          >
                            Find your people
                            <ArrowUpRight size={15} />
                          </button>
                        </div>
                      </div>
                      <div className="intro-illustration" aria-hidden="true">
                        <span className="illustration-code">
                          {"{"}
                          <span>you</span>
                          {"}"}
                        </span>
                        <span className="illustration-star">✳</span>
                        <div className="illustration-note">
                          <span className="status-dot" />a work in good company.
                        </div>
                        <div className="illustration-orbit" />
                      </div>
                    </section>
                  ) : page === "community" ? (
                    <CommunityHeader
                      community={community}
                      onCreate={() => create()}
                      user={user}
                      requireUser={authorized}
                      onRefresh={refresh}
                      go={go}
                    />
                  ) : (
                    <PageTitle
                      eyebrow="GOOD THINGS ARE WORTH KEEPING"
                      title="A little inspiration, saved."
                      description="Your reading list, second looks, and conversations to come back to."
                    />
                  )}
                  {page === "tag" && (
                    <div className="topic-follow-bar">
                      <span>
                        Follow this topic to hear about new public
                        conversations.
                      </span>
                      <FollowButton
                        key={id + ":" + user?.id}
                        kind="topic"
                        item={id}
                        user={user}
                        requireUser={authorized}
                        toast={setToast}
                      />
                    </div>
                  )}
                  <div className="content-layout">
                    <section className="feed-column">
                      <div className="feed-toolbar">
                        <div className="feed-tabs">
                          {[
                            ["Recent", Clock],
                            ["Active", Flame],
                            ["Needs help", HelpCircle],
                          ].map(([name, Icon]) => (
                            <button
                              key={name}
                              className={sort === name ? "selected" : ""}
                              onClick={() => {
                                setSort(name);
                                setListPage(1);
                              }}
                            >
                              <Icon size={15} />
                              {name}
                            </button>
                          ))}
                        </div>
                        <input
                          className="local-search"
                          aria-label="Search conversations"
                          placeholder="Search conversations…"
                          value={query}
                          onChange={(e) => {
                            setQuery(e.target.value);
                            setListPage(1);
                          }}
                        />
                        <label className="type-select">
                          <Select
                            aria-label="Filter by topic tag"
                            value={page === "tag" ? id : ""}
                            onChange={(e) =>
                              go(
                                e.target.value
                                  ? "tag/" + e.target.value
                                  : "feed",
                              )
                            }
                          >
                            <option value="">All topics</option>
                            {topics.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.name}
                              </option>
                            ))}
                          </Select>
                        </label>
                        <label className="type-select">
                          <SlidersHorizontal size={14} />
                          <Select
                            aria-label="Filter by post type"
                            value={typeFilter}
                            onChange={(e) => {
                              setTypeFilter(e.target.value);
                              setListPage(1);
                            }}
                          >
                            <option value="all">All types</option>
                            {Object.entries(types).map(([key, t]) => (
                              <option key={key} value={key}>
                                {t.label}
                              </option>
                            ))}
                          </Select>
                        </label>
                      </div>
                      {sort === "Needs help" && (
                        <p className="needs-help-note">
                          Open questions and code reviews without an accepted
                          solution — including those with replies.
                        </p>
                      )}
                      {feed.length ? (
                        <div className="post-list">
                          {feed.map((p) => (
                            <PostCard
                              key={p.id}
                              post={p}
                              topicName={topicName(p.topic)}
                              saved={has("post", p.id)}
                              onVote={() => vote(p)}
                              onSave={() => membership("post", p.id)}
                              onOpen={() => go("post/" + p.id)}
                              onMember={() => go("member/" + p.user_id)}
                            />
                          ))}
                        </div>
                      ) : (
                        <Empty
                          icon={MessagesSquare}
                          title={
                            query
                              ? "Nothing here matches that search."
                              : page === "saved"
                                ? "Your good-find collection starts here."
                                : "A good place for the first word."
                          }
                          description={
                            query
                              ? "Try another phrase or clear your filters."
                              : page === "saved"
                                ? "Bookmark a conversation to find it here later."
                                : "Ask a question, share an idea, or show what you’re working on."
                          }
                          action={
                            query
                              ? "Clear search"
                              : page === "saved"
                                ? "Explore the feed"
                                : "Start a conversation"
                          }
                          onClick={() =>
                            query
                              ? setQuery("")
                              : page === "saved"
                                ? go("feed")
                                : create()
                          }
                        />
                      )}
                      <Pagination
                        meta={posts.pagination}
                        label="conversations"
                        onPage={setListPage}
                      />
                    </section>
                    <RightRail
                      topics={topics}
                      communities={joinedCommunities}
                      events={
                        user?.preferences?.show_event_reminders === false
                          ? []
                          : myEvents
                      }
                      showReminders={
                        user?.preferences?.show_event_reminders !== false
                      }
                      go={go}
                      create={create}
                    />
                  </div>
                </>
              )}
              {page === "communities" && (
                <CommunityDirectory
                  items={communities}
                  query={query}
                  onSearch={setQuery}
                  go={go}
                  onRefresh={refresh}
                  onPage={setListPage}
                  requireUser={authorized}
                  user={user}
                />
              )}
              {page === "projects" && (
                <>
                  <PageTitle
                    eyebrow="SMALL EXPERIMENTS. BIG POSSIBILITIES."
                    title="Built by someone like you."
                    description="Discover work in progress. Give thoughtful feedback. Help an idea find its feet."
                    action="Share your project"
                    onClick={() => authorized(() => setProjectForm(true))}
                  />
                  <div className="projects-banner">
                    <FolderGit2 size={29} />
                    <div>
                      <strong>
                        Less “check out my product”. More “help me make it
                        better”.
                      </strong>
                      <p>
                        Every project starts with a specific question. A useful
                        response can go a long way.
                      </p>
                    </div>
                    <ArrowUpRight size={22} />
                  </div>
                  <input
                    className="directory-search"
                    aria-label="Search projects"
                    placeholder="Search projects…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                  <div className="projects-grid">
                    {projects
                      .filter((p) =>
                        (p.name + " " + p.description + " " + p.stack)
                          .toLowerCase()
                          .includes(query.toLowerCase()),
                      )
                      .map((p) => (
                        <article className="project-card" key={p.id}>
                          <Carousel images={p.screenshots} />
                          <div className="project-card-top">
                            <span
                              className={
                                "project-monogram " + (p.logo ? "has-logo" : "")
                              }
                            >
                              {p.logo ? (
                                <img
                                  src={"/api/uploads/" + p.logo}
                                  alt={p.name + " logo"}
                                />
                              ) : (
                                p.name.slice(0, 2).toUpperCase()
                              )}
                            </span>
                            <span className="stage-badge">
                              <span className="tiny-dot" />
                              {p.stage}
                            </span>
                          </div>
                          <a href={"#post/" + p.post_id}>
                            <h2>
                              {p.name}
                              <ArrowUpRight size={18} />
                            </h2>
                          </a>
                          <p>{p.description}</p>
                          <div className="stack-tags">
                            {tags(p.stack).map((t) => (
                              <span key={t}>{t}</span>
                            ))}
                          </div>
                          {!!p.team?.length && (
                            <div className="project-team compact">
                              {p.team.map((m) => (
                                <button
                                  key={m.user_id}
                                  onClick={() => go("member/" + m.user_id)}
                                >
                                  <Avatar
                                    name={m.name || "Builder"}
                                    size="small"
                                  />
                                  <span>
                                    {m.name}
                                    <small>{m.role}</small>
                                  </span>
                                </button>
                              ))}
                            </div>
                          )}
                          <div className="project-request">
                            <span className="eyebrow">
                              LOOKING FOR A FRESH PERSPECTIVE
                            </span>
                            <p>{p.help}</p>
                          </div>
                          <div className="project-footer">
                            <button onClick={() => go("member/" + p.user_id)}>
                              <Avatar name={p.founder_name} size="small" />
                              {p.founder_name}
                            </button>
                            <a href={"#post/" + p.post_id}>
                              <MessageCircle size={14} />
                              {p.feedback_count} feedback
                            </a>
                          </div>
                        </article>
                      ))}
                  </div>
                  {!projects.filter((p) =>
                    (p.name + " " + p.description + " " + p.stack)
                      .toLowerCase()
                      .includes(query.toLowerCase()),
                  ).length && (
                    <Empty
                      icon={FolderGit2}
                      title={
                        query
                          ? "No projects match that search."
                          : "Your side project deserves a second pair of eyes."
                      }
                      description={
                        query
                          ? "Try another project name or technology."
                          : "Introduce your project and tell the community exactly what kind of feedback would help."
                      }
                      action={
                        query ? "Clear search" : "Share the first project"
                      }
                      onClick={() =>
                        query
                          ? setQuery("")
                          : authorized(() => setProjectForm(true))
                      }
                    />
                  )}
                </>
              )}
              {page === "projects" && (
                <Pagination
                  meta={projects.pagination}
                  label="projects"
                  onPage={setListPage}
                />
              )}
              {page === "events" && (
                <>
                  <PageTitle
                    eyebrow="MAKE ROOM FOR A GOOD CONVERSATION"
                    title="See you on the other side."
                    description="Meetups, workshops, and the occasional “wait, how did you build that?”"
                    action="Create an event"
                    onClick={() => authorized(() => setEventForm(true))}
                  />
                  <div className="events-toolbar">
                    <div className="feed-tabs">
                      {["Recent", "Upcoming", "Past"].map((t) => (
                        <button
                          className={sort === t ? "selected" : ""}
                          onClick={() => setSort(t)}
                          key={t}
                        >
                          {t === "Recent" ? "All events" : t}
                        </button>
                      ))}
                    </div>
                    <span>
                      <Globe size={14} />
                      Times shown in {localZone}
                    </span>
                  </div>
                  <div className="event-filters">
                    <Select
                      aria-label="Event topic"
                      value={eventTopic}
                      onChange={(e) => setEventTopic(e.target.value)}
                      searchable
                      options={[
                        { value: "", label: "Every topic" },
                        ...topics.map((t) => ({ value: t.id, label: t.name })),
                      ]}
                    />
                    <Select
                      aria-label="Sort events by date"
                      value={eventOrder}
                      onChange={(e) => setEventOrder(e.target.value)}
                      options={[
                        { value: "soonest", label: "Date · earliest first" },
                        { value: "latest", label: "Date · latest first" },
                      ]}
                    />
                    <input
                      type="date"
                      aria-label="Events on date"
                      title={"Events starting on this date · " + localZone}
                      value={eventDate}
                      onChange={(e) => setEventDate(e.target.value)}
                    />
                    <input
                      aria-label="Search events"
                      placeholder="Search events…"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </div>
                  <div className="events-grid">
                    {events
                      .filter(
                        (e) =>
                          (e.title + " " + e.description)
                            .toLowerCase()
                            .includes(query.toLowerCase()) &&
                          (sort === "Upcoming"
                            ? !e.cancelled_at && new Date(e.end_at) > new Date()
                            : sort === "Past"
                              ? new Date(e.end_at) < new Date()
                              : true),
                      )
                      .map((e, index) => (
                        <EventCard
                          key={e.id}
                          event={e}
                          index={index}
                          joined={has("event", e.id)}
                          user={user}
                          onJoin={() => membership("event", e.id)}
                          onEdit={() => setEventForm(e)}
                          onChange={async (action) => {
                            await api(`/events/${e.id}/lifecycle`, {
                              method: "POST",
                              body: { action, revision: e.revision },
                            });
                            await refresh();
                            setToast(
                              action === "cancel"
                                ? "Event cancelled. Attendees have been notified."
                                : "Event restored. Attendees have been notified.",
                            );
                          }}
                          onMember={() => go("member/" + e.user_id)}
                          topic={topicName(e.topic)}
                        />
                      ))}
                  </div>
                  {!events.filter(
                    (e) =>
                      (e.title + " " + e.description)
                        .toLowerCase()
                        .includes(query.toLowerCase()) &&
                      (sort === "Upcoming"
                        ? !e.cancelled_at && new Date(e.end_at) > new Date()
                        : sort === "Past"
                          ? new Date(e.end_at) < new Date()
                          : true),
                  ).length && (
                    <Empty
                      icon={CalendarDays}
                      title={
                        query
                          ? "No events match that search."
                          : "Something to look forward to starts with you."
                      }
                      description="Bring a few builders together for a conversation, a demo, or a live code review."
                      action="Create an event"
                      onClick={() => authorized(() => setEventForm(true))}
                    />
                  )}
                </>
              )}
              {page === "events" && (
                <Pagination
                  meta={events.pagination}
                  label="events"
                  onPage={setListPage}
                />
              )}
              {page === "post" &&
                (detailError ? (
                  <Empty
                    title="We couldn’t open this conversation."
                    description={detailError}
                    action="Back to the feed"
                    onClick={() => go("feed")}
                  />
                ) : detail ? (
                  <PostDetail
                    post={detail}
                    user={user}
                    topic={topicName(detail.topic)}
                    saved={has("post", detail.id)}
                    onVote={() => vote(detail)}
                    onSave={() => membership("post", detail.id)}
                    requireUser={authorized}
                    refresh={reloadPost}
                    toast={setToast}
                    go={go}
                  />
                ) : (
                  <div className="loading-state">
                    <span className="spinner" />
                    Opening conversation…
                  </div>
                ))}
              {(page === "profile" || page === "member") &&
                (page === "profile" && !user ? (
                  <Empty
                    icon={Code2}
                    title="Your corner is waiting for you."
                    description="A profile, your projects, the people you meet, and the conversations you’ll come back to."
                    action="Join the community"
                    onClick={() => setAuth("signup")}
                  />
                ) : detailError ? (
                  <Empty title="Member not found" description={detailError} />
                ) : page === "member" && !member ? (
                  <div className="loading-state">
                    <span className="spinner" />
                    Opening developer profile…
                  </div>
                ) : (
                  <Profile
                    person={page === "profile" ? user : member}
                    own={page === "profile" || member?.id === user?.id}
                    user={user}
                    posts={page === "profile" ? posts : member.posts}
                    allPosts={posts}
                    onPage={setListPage}
                    events={events}
                    projects={projects}
                    communities={communities}
                    has={has}
                    go={go}
                    edit={() => setEditor(true)}
                    logout={async () => {
                      try {
                        await api("/logout", { method: "POST" });
                        clearAccountData();
                        accountIdentity.current = null;
                        setUser(null);
                        await refresh();
                        go("feed");
                        setToast("You’re signed out. See you soon.");
                      } catch (e) {
                        setToast(e.message);
                      }
                    }}
                  />
                ))}
              {page === "moderation" && (
                <Moderation
                  key={id || "all"}
                  user={user}
                  go={go}
                  scope={
                    id === "public"
                      ? "public"
                      : id === "communities"
                        ? "communities"
                        : "all"
                  }
                />
              )}
              {![
                "moderation",
                "feed",
                "tag",
                "community",
                "communities",
                "projects",
                "events",
                "post",
                "profile",
                "member",
                "saved",
              ].includes(page) && (
                <Empty
                  title="A little off the beaten path."
                  description="This page doesn’t exist. There’s plenty happening back in the feed."
                  action="Back to the feed"
                  onClick={() => go("feed")}
                />
              )}
            </>
          )}
          <footer>
            <span>
              <img src="/devdevian-logo.png" alt="" />
              <strong>devdevian.</strong>
              <span>A work in good company.</span>
            </span>
            <span>
              <a href="/privacy">Privacy &amp; Security</a>
              <a href="/terms">Terms of Use</a>
              Stay curious. Build together.
              <button
                onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
                aria-label="Back to top"
              >
                <ArrowUp size={15} />
              </button>
            </span>
          </footer>
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={17} />
          <span>{toast}</span>
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={15} />
          </button>
        </div>
      )}
      {user?.username_locked === 0 && <ChooseUsername done={refresh} />}
      {auth && (
        <Auth
          mode={auth}
          setMode={setAuth}
          close={closeAuth}
          done={async (u) => {
            ++requestVersion.current;
            clearAccountData();
            accountIdentity.current = u?.id ?? null;
            setUser(u);
            setAuth(null);
            if (auth === "signup" && u.email_verified) setEditor(true);
            await refresh();
            setToast("Good to have you here, " + u.name.split(" ")[0] + ".");
          }}
        />
      )}
      {composer && (
        <Composer
          key={String(user?.id) + ":" + (composer.community_id || "public")}
          user={user}
          communities={joinedCommunities}
          topics={topics}
          communityId={composer.community_id}
          defaultKind={composer.kind}
          defaultTopic={composer.topic}
          close={closeComposer}
          done={async (p) => {
            setComposer(null);
            await refresh();
            go("post/" + p.id);
            setToast("Your conversation is live.");
          }}
        />
      )}
      {projectForm && (
        <ProjectForm
          communities={topics}
          close={closeProject}
          done={async (p) => {
            setProjectForm(false);
            await refresh();
            go("post/" + p.post_id);
            setToast("Your project has a home. Let the feedback begin.");
          }}
        />
      )}
      {eventForm && (
        <EventForm
          communities={topics}
          event={eventForm === true ? undefined : eventForm}
          close={closeEvent}
          done={async () => {
            setEventForm(false);
            await refresh();
            go("events");
            setToast("Your event is ready. Invite your people.");
          }}
        />
      )}
      {editor && user && (
        <ProfileEditor
          user={user}
          close={closeEditor}
          done={(u) => {
            setUser(u);
            setEditor(false);
            setToast("Your profile is up to date.");
          }}
        />
      )}
    </div>
  );
}
function PostCard({
  post: p,
  topicName,
  saved,
  onVote,
  onSave,
  onOpen,
  onMember,
}) {
  const t = types[p.kind] || types.discussion;
  return (
    <article className="post-card">
      <div className="post-card-header">
        <div className="post-community">
          <span className={"type-dot " + t.color} />
          <a href={"#tag/" + p.topic}>{topicName}</a>
          <span>·</span>
          <span className="post-type-label">{t.label}</span>
        </div>
        <div className="post-card-meta">
          {(p.archived_at || p.locked_at) && (
            <span className="kind-badge violet">
              {p.locked_at ? "Replies paused" : "Archived"}
            </span>
          )}
          <span className="post-date">
            {dateOnly(p.created) + (p.updated_at ? " · edited" : "")}
          </span>
        </div>
      </div>
      <button className="post-title" onClick={onOpen}>
        <h2>{p.title}</h2>
        {p.status === "resolved" && (
          <span className="resolved-badge">
            <CheckCircle2 size={12} />
            {p.kind === "review" ? "Review addressed" : "Resolved"}
          </span>
        )}
      </button>
      <p className="post-excerpt">
        {p.body
          .split("```")[0]
          .replace(/[#*\[\]]/g, "")
          .slice(0, 240)}
        {p.body.length > 240 ? "…" : ""}
      </p>
      {p.kind === "review" && (
        <button className="code-preview" onClick={onOpen}>
          <Code2 size={14} />
          <code>
            {p.stack || "Code review"} <span>— open the conversation</span>
          </code>
          <ArrowUpRight size={14} />
        </button>
      )}
      <span className="audience-label">
        {p.community_id ? "Private · " + p.community_name : "Public feed"}
      </span>
      <Attachments files={p.attachments} compact />
      <div className="post-tags">
        {tags(p.stack)
          .slice(0, 4)
          .map((t) => (
            <span key={t}>#{t.toLowerCase().replace(/\s/g, "")}</span>
          ))}
      </div>
      <div className="post-card-footer">
        <button className="post-author" onClick={onMember}>
          <Avatar name={p.name} image={p.author_avatar} size="small" />
          <span>{p.name}</span>
        </button>
        <div className="post-actions">
          <button
            className={"vote-button " + (p.voted ? "voted" : "")}
            onClick={onVote}
            aria-label={p.voted ? "Remove upvote" : "Upvote conversation"}
          >
            <ArrowUp size={15} />
            {p.vote_count}
          </button>
          <button onClick={onOpen} aria-label="Open replies">
            <MessageCircle size={15} />
            {p.reply_count}
            <span className="reply-word"> replies</span>
          </button>
          <button
            className={saved ? "is-saved" : ""}
            onClick={onSave}
            aria-label={saved ? "Remove bookmark" : "Save conversation"}
          >
            <Bookmark size={16} fill={saved ? "currentColor" : "none"} />
          </button>
        </div>
      </div>
    </article>
  );
}
function RightRail({
  communities,
  topics = [],
  events,
  go,
  create,
  showReminders = true,
}) {
  return (
    <aside className="right-rail">
      <section className="rail-about">
        <span className="rail-asterisk">✳</span>
        <span className="eyebrow">A GOOD PLACE TO START</span>
        <h3>
          You don’t have to
          <br />
          figure it out alone.
        </h3>
        <p>
          Ask the question. Share the messy first version. Someone here gets it.
        </p>
        <button className="text-button" onClick={() => create("question")}>
          Ask for a hand
          <ArrowUpRight size={15} />
        </button>
      </section>
      <section className="rail-section">
        <div className="rail-heading">
          <h3>Explore public topics</h3>
        </div>
        <div className="topic-links">
          {topics.map((t) => (
            <a href={"#tag/" + t.id} key={t.id}>
              #{t.short || t.name}
            </a>
          ))}
        </div>
      </section>
      <section className="rail-section">
        <div className="rail-heading">
          <h3>Find your people</h3>
          <button
            onClick={() => go("communities")}
            aria-label="All communities"
          >
            <ArrowUpRight size={15} />
          </button>
        </div>
        {communities.slice(0, 4).map((c) => (
          <a href={"#community/" + c.id} className="rail-community" key={c.id}>
            <span
              className={
                "community-symbol mini " + c.color + (c.logo ? " has-logo" : "")
              }
            >
              {c.logo ? (
                <img
                  className="entity-logo"
                  src={"/api/uploads/" + c.logo}
                  alt=""
                />
              ) : (
                c.symbol
              )}
            </span>
            <span>
              <strong>{c.name}</strong>
              <small>{c.posts} conversations</small>
            </span>
            <ChevronRight size={13} />
          </a>
        ))}
      </section>
      {showReminders && (
        <section className="rail-section build-note">
          <div className="rail-heading">
            <h3>Your upcoming events</h3>
            <CalendarDays size={15} />
          </div>
          {events
            .filter((e) => !e.cancelled_at && new Date(e.end_at) > new Date())
            .slice(0, 2)
            .map((e) => (
              <button
                className="rail-event"
                key={e.id}
                onClick={() => go("events/" + e.id)}
              >
                <strong>{e.title}</strong>
                <span>{dateTime(e.start_at)}</span>
              </button>
            ))}
          {!events.some(
            (e) => !e.cancelled_at && new Date(e.end_at) > new Date(),
          ) && (
            <p>
              No upcoming events joined yet.
              <br />
              Join an event to see it here.
            </p>
          )}
          <button className="text-button" onClick={() => go("events")}>
            Explore events
            <ArrowRight size={14} />
          </button>
        </section>
      )}
      <div className="rail-manifesto">
        Less noise.
        <br />
        More <span>“oh, that helped.”</span>
        <span className="manifesto-line" />
      </div>
    </aside>
  );
}
function PostDetail({
  post: p,
  user,
  topic,
  saved,
  onVote,
  onSave,
  requireUser,
  refresh,
  toast,
  go,
}) {
  const [body, setBody] = useState(""),
    [replyTo, setReplyTo] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [replyModal, setReplyModal] = useState(false),
    [report, setReport] = useState(false),
    [reportBusy, setReportBusy] = useState(false);
  const [replyFiles, setReplyFiles] = useState([]),
    [uploadingReply, setUploadingReply] = useState(false);
  const [editing, setEditing] = useState(null),
    [updating, setUpdating] = useState(false);
  const closeEdit = useCallback(() => setEditing(null), []),
    closeUpdate = useCallback(() => setUpdating(false), []);
  const closeReport = useCallback(() => setReport(false), []);
  const t = types[p.kind] || types.discussion;
  async function solve(reply) {
    try {
      await api(`/posts/${p.id}/solution`, {
        method: "PATCH",
        body: { reply_id: p.accepted_reply_id === reply.id ? null : reply.id },
      });
      await refresh();
      toast(
        p.accepted_reply_id === reply.id
          ? "Question reopened."
          : "Solution marked. The conversation can continue.",
      );
    } catch (e) {
      toast(e.message);
    }
  }
  return (
    <div className="detail-layout">
      <a
        href={p.community_id ? "#community/" + p.community_id : "#feed"}
        className="back-link"
      >
        <ArrowLeft size={15} />
        {p.community_id ? p.community_name : "Public feed"} · #{topic}
      </a>
      <article className="post-detail">
        <div className="detail-top">
          <span className={"kind-badge " + t.color}>{t.label}</span>
          {p.status === "resolved" && (
            <span className="resolved-badge">
              <CheckCircle2 size={13} />
              {p.kind === "review" ? "Review addressed" : "Resolved"}
            </span>
          )}
          <span>
            Started {dateOnly(p.created)}
            {p.updated_at ? " · edited " + dateOnly(p.updated_at) : ""}
          </span>
        </div>
        <h1>{p.title}</h1>
        <button
          className="detail-author"
          onClick={() => go("member/" + p.user_id)}
        >
          <Avatar name={p.name} image={p.author_avatar} />
          <span>
            {p.name}
            <small>{p.role || "Developer"}</small>
          </span>
        </button>
        {p.project && (
          <>
            <Carousel images={p.project.screenshots} />
            <EntityLinks links={p.project.links} />
            {p.project.tagline && <h3>{p.project.tagline}</h3>}
            {p.project.audience && (
              <section className="project-context">
                <span className="eyebrow">BUILT FOR</span>
                <MD>{p.project.audience}</MD>
              </section>
            )}
            {p.project.problem && (
              <section className="project-context">
                <span className="eyebrow">THE PROBLEM</span>
                <MD>{p.project.problem}</MD>
              </section>
            )}
            {!!p.project.team?.length && (
              <div className="project-team">
                {p.project.team.map((m) => (
                  <button
                    key={m.user_id}
                    onClick={() => go("member/" + m.user_id)}
                  >
                    <Avatar name={m.name || "Builder"} />
                    <span>
                      {m.name}
                      <small>{m.role}</small>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
        <MD>{p.body}</MD>
        {p.kind === "review" && (
          <section className="review-brief">
            <span className="eyebrow">REVIEW REQUEST</span>
            <h3>What to review</h3>
            <MD>{p.review_focus}</MD>
            {p.code && <MD>{"```\n" + p.code + "\n```"}</MD>}
            {p.repo_url && !p.links?.length && (
              <a
                className="text-button"
                href={p.repo_url}
                target="_blank"
                rel="noreferrer"
              >
                Open repository
                <ExternalLink size={14} />
              </a>
            )}
          </section>
        )}
        {p.kind === "showcase" && p.demo_url && !p.links?.length && (
          <a
            className="button secondary"
            href={p.demo_url}
            target="_blank"
            rel="noreferrer"
          >
            Try the demo
            <ExternalLink size={14} />
          </a>
        )}
        <EntityLinks links={p.links} />
        <Attachments files={p.attachments} />

        <div className="post-tags">
          {tags(p.stack).map((t) => (
            <span key={t}>{t}</span>
          ))}
        </div>
        {p.resolved_at && (
          <p className="resolution-note">
            <CheckCircle2 size={14} />
            {p.kind === "review" ? "Review addressed" : "Solution marked"}{" "}
            {dateOnly(p.resolved_at)}. New replies are welcome.
          </p>
        )}
        <div className="detail-actions">
          <button
            className={"vote-button " + (p.voted ? "voted" : "")}
            onClick={onVote}
          >
            <ArrowUp size={16} />
            {p.vote_count}
            <span>Useful</span>
          </button>
          <button onClick={onSave} className={saved ? "is-saved" : ""}>
            <Bookmark size={16} fill={saved ? "currentColor" : "none"} />
            {saved ? "Saved" : "Save"}
          </button>
          <FollowButton
            key={p.id + ":" + user?.id}
            kind="post"
            item={p.id}
            user={user}
            requireUser={requireUser}
            toast={toast}
          />
          <button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(location.href);
                toast("Conversation link copied.");
              } catch {
                toast(
                  "Copy the address from your browser to share this conversation.",
                );
              }
            }}
          >
            <LinkIcon size={16} />
            Share
          </button>
          {user?.id === p.user_id && !p.project && (
            <button onClick={() => setEditing({ content: p, reply: false })}>
              <PenLine size={15} />
              Edit post
            </button>
          )}
          <button
            className="report-button"
            onClick={() => requireUser(() => setReport(true))}
            aria-label="Report conversation"
          >
            <Flag size={15} />
          </button>
        </div>
      </article>
      {p.project && (
        <ProjectTimeline
          project={p.project}
          updates={p.updates || []}
          pagination={p.updates_pagination}
          onPage={refresh}
          owner={user?.id === p.project.user_id}
          onCreate={() => setUpdating(true)}
        />
      )}
      {p.accepted_reply_id && (
        <a
          className="text-button accepted-link"
          href={`#post/${p.id}/reply/${p.accepted_reply_id}`}
        >
          View {p.kind === "review" ? "addressed review" : "accepted answer"}
          <ArrowRight size={14} />
        </a>
      )}
      <PostControls post={p} user={user} refresh={refresh} toast={toast} />
      <div className="replies-title">
        <h2>
          {p.reply_count} {p.reply_count === 1 ? "reply" : "replies"}
        </h2>
        <span>Different perspectives welcome.</span>
      </div>
      <div className="replies-list">
        <ReplyThreads
          key={p.id}
          post={p}
          user={user}
          go={go}
          requireUser={requireUser}
          onEdit={setEditing}
          onSolve={solve}
          onReply={(r) => {
            setReplyTo(r);
            setReplyModal(true);
            document.getElementById("reply-body")?.focus();
            document
              .getElementById("reply-form")
              ?.scrollIntoView({ behavior: "smooth", block: "center" });
          }}
        />
      </div>
      {!p.reply_count && (
        <div className="first-reply">
          <MessageCircle size={20} />
          <p>
            A fresh pair of eyes could make all the difference.
            <br />
            Be the first to lend a hand.
          </p>
        </div>
      )}
      <div className="reply-dock">
        <span>Have something to add?</span>
        <button className="button primary" onClick={() => setReplyModal(true)}>
          Add your perspective <MessagesSquare size={14} />
        </button>
      </div>
      {replyModal && (
        <Modal
          title={replyTo ? "Reply to " + replyTo.name : "Add your perspective"}
          onClose={() => setReplyModal(false)}
          wide
        >
          <section id="reply-form" className="reply-form">
            <h3>
              {replyTo ? `Reply to ${replyTo.name}` : "Add your perspective"}
            </h3>
            {replyTo && (
              <div className="reply-context">
                <span>{replyTo.body.slice(0, 100)}</span>
                <button
                  onClick={() => setReplyTo(null)}
                  aria-label="Cancel nested reply"
                >
                  <X size={14} />
                </button>
              </div>
            )}
            {p.archived_at || p.locked_at ? (
              <div className="closed-replies">
                <MessagesSquare size={20} />
                <p>
                  New replies are paused. Existing replies and accepted
                  solutions remain available.
                </p>
              </div>
            ) : user ? (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  setBusy(true);
                  setError("");
                  try {
                    const createdReply = await api(`/posts/${p.id}/replies`, {
                      method: "POST",
                      body: {
                        body,
                        parent_id: replyTo?.id || null,
                        attachment_ids: replyFiles.map((f) => f.id),
                      },
                    });
                    setBody("");
                    setReplyFiles([]);
                    setReplyTo(null);
                    setReplyModal(false);
                    await refresh();
                    go(`post/${p.id}/reply/${createdReply.id}`);
                  } catch (e) {
                    setError(e.message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <MentionTextarea
                  id="reply-body"
                  aria-label="Your reply"
                  minLength={2}
                  maxLength={10000}
                  rows={5}
                  required
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Share what you know. A little context helps."
                />
                <AttachmentPicker
                  files={replyFiles}
                  onChange={setReplyFiles}
                  onBusy={setUploadingReply}
                />
                <div className="form-actions">
                  <span>
                    <Code2 size={13} />
                    Markdown supported
                  </span>
                  <button
                    className="button primary"
                    disabled={busy || uploadingReply}
                  >
                    {busy ? "Posting…" : "Post reply"}
                    <Send size={14} />
                  </button>
                </div>
                <ErrorMessage error={error} />
              </form>
            ) : (
              <div className="reply-signin">
                <p>Your perspective belongs here, too.</p>
                <button
                  className="button primary"
                  onClick={() => requireUser(() => {})}
                >
                  Join the conversation
                  <ArrowRight size={15} />
                </button>
              </div>
            )}
          </section>
        </Modal>
      )}
      {editing && (
        <EditContent
          {...editing}
          close={closeEdit}
          done={async () => {
            await refresh();
            setEditing(null);
            toast("Your changes are saved.");
          }}
        />
      )}
      {updating && p.project && (
        <ProjectUpdateForm
          project={p.project}
          close={closeUpdate}
          done={async () => {
            await refresh();
            setUpdating(false);
            toast("Project update shared with your readers.");
          }}
        />
      )}
      {report && (
        <Modal title="Report this conversation" onClose={closeReport}>
          <h2>Help keep this space useful.</h2>
          <p className="modal-description">
            {p.community_id
              ? "Reports go to this community’s owner and validators. They review the conversation and record a decision."
              : "Reports go to platform moderators. They review the conversation and record a decision."}
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setReportBusy(true);
              try {
                await api(`/posts/${p.id}/report`, {
                  method: "POST",
                  body: Object.fromEntries(new FormData(e.currentTarget)),
                });
                setReport(false);
                toast("Report saved for review. Thank you for the context.");
              } catch (e) {
                setError(e.message);
              } finally {
                setReportBusy(false);
              }
            }}
          >
            <Field label="What’s the issue?">
              <MentionTextarea
                name="reason"
                required
                minLength={5}
                maxLength={1000}
                rows={4}
                placeholder="Spam, harassment, misleading content…"
              />
            </Field>
            <ErrorMessage error={error} />
            <button className="button primary full" disabled={reportBusy}>
              {reportBusy ? "Saving…" : "Send to moderation"}
              <Flag size={15} />
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}
function EventCard({
  event: e,
  index,
  joined,
  user,
  onJoin,
  onMember,
  onEdit,
  onChange,
  topic,
}) {
  const past = new Date(e.end_at) < new Date();
  return (
    <article className="event-card" id={"event-" + e.id}>
      <div
        className={
          "event-art art-" + (index % 3) + (e.banner ? " has-banner" : "")
        }
      >
        {e.banner && (
          <img
            className="entity-banner"
            src={"/api/uploads/" + e.banner}
            alt=""
          />
        )}
        <span className="event-art-label">
          <Radio size={12} />
          {e.cancelled_at
            ? "CANCELLED"
            : past
              ? "PAST EVENT"
              : "ONLINE / " + topic.toUpperCase()}
        </span>
        <h2>{e.title}</h2>
        <span className="event-art-mark">
          {"{"} meet. build. repeat. {"}"}
        </span>
        <span className="event-art-star">✳</span>
      </div>
      <div className="event-card-content">
        <div className="event-date">
          <CalendarDays size={15} />
          {dateTime(e.start_at)}
        </div>
        <span className="event-end">Until {dateTime(e.end_at)}</span>
        <div className="organizer-time">
          Organizer time: {dateTime(e.start_at, e.timezone)} · {e.timezone}
        </div>
        <MD>{e.description}</MD>
        <EntityLinks links={e.links} />
        <button className="event-organizer" onClick={onMember}>
          <Avatar
            name={e.organizer_name}
            image={e.organizer_avatar}
            size="small"
          />
          <span>
            Hosted by <strong>{e.organizer_name}</strong>
          </span>
          <ArrowUpRight size={13} />
        </button>
        <div className="event-card-footer">
          <span>
            <Users size={14} />
            {e.attendee_count} attending
          </span>
          {!past && !e.cancelled_at && (
            <button
              className={"button compact " + (joined ? "secondary" : "primary")}
              onClick={onJoin}
            >
              {joined ? (
                <>
                  <Check size={14} />
                  Going
                </>
              ) : (
                <>
                  Count me in
                  <ArrowRight size={14} />
                </>
              )}
            </button>
          )}
          {(past || e.cancelled_at) && (
            <span className="past-label">
              {e.cancelled_at ? "Event cancelled" : "Event ended"}
            </span>
          )}
        </div>
        {!past &&
          !e.cancelled_at &&
          (joined || e.user_id === user?.id) &&
          e.url && (
            <a
              className="meeting-link"
              href={e.url}
              target="_blank"
              rel="noreferrer"
            >
              Open meeting
              <ExternalLink size={14} />
            </a>
          )}
        <EventControls
          event={e}
          user={user}
          onEdit={onEdit}
          onChange={onChange}
        />
      </div>
    </article>
  );
}
function Profile({
  person: p,
  own,
  user,
  posts,
  allPosts,
  onPage,
  events,
  projects,
  communities,
  has,
  go,
  edit,
  logout,
}) {
  const [tab, setTab] = useState("Conversations");
  const [confirmSignout, setConfirmSignout] = useState(false);
  const authored = posts.filter((post) => post.user_id === p.id);
  return (
    <>
      {confirmSignout && (
        <Modal title="Sign out?" onClose={() => setConfirmSignout(false)}>
          <h2>See you soon, builder.</h2>
          <p className="modal-description">
            You can sign back in to pick up your conversations.
          </p>
          <div className="form-actions">
            <button
              className="button secondary"
              onClick={() => setConfirmSignout(false)}
            >
              Stay here
            </button>
            <button className="button primary" onClick={logout}>
              Sign out
            </button>
          </div>
        </Modal>
      )}
      <section className="profile-hero">
        <div
          className="profile-cover"
          style={
            p.banner
              ? {
                  backgroundImage: `url(/api/uploads/${p.banner})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }
              : undefined
          }
        ></div>
        <div className="profile-info">
          <Avatar name={p.name} image={p.avatar} size="profile-size" />
          <div className="profile-main">
            <div>
              <h1>{p.name}</h1>
              {own && p.privacy === "hidden" && (
                <p className="profile-privacy-note">
                  Profile hidden from other accounts · visible to you
                </p>
              )}
              <span className="profile-handle">
                @{p.username || "builder_" + p.id}
              </span>
              <p>
                {p.role || "Developer"}
                {p.location && (
                  <>
                    <span>·</span>
                    <MapPin size={12} />
                    {p.location}
                  </>
                )}
              </p>
            </div>
            {own && (
              <button className="button secondary" onClick={edit}>
                <PenLine size={14} />
                Edit profile
              </button>
            )}
          </div>
          <p className="profile-bio">
            {p.bio ||
              "A curious mind, figuring things out one project at a time."}
          </p>
          <EntityLinks links={p.links} />
          <div className="profile-links">
            {p.github && (
              <a href={p.github} target="_blank" rel="noreferrer">
                <Github size={14} />
                GitHub
                <ArrowUpRight size={12} />
              </a>
            )}
            {p.website && (
              <a href={p.website} target="_blank" rel="noreferrer">
                <Globe size={14} />
                Website
                <ArrowUpRight size={12} />
              </a>
            )}
          </div>
          <div className="stack-tags">
            {tags(p.stack).map((t) => (
              <span key={t}>{t}</span>
            ))}
          </div>
        </div>
      </section>
      <div className="profile-tabs feed-tabs">
        {(own
          ? [
              "Conversations",
              "Participated",
              "Projects",
              "Events",
              "Communities",
            ]
          : ["Conversations", "Projects"]
        ).map((t) => (
          <button
            key={t}
            className={tab === t ? "selected" : ""}
            onClick={() => {
              setTab(t);
              onPage(1);
            }}
          >
            {t}
          </button>
        ))}
        {own && (
          <button
            className="logout-button"
            onClick={() => setConfirmSignout(true)}
          >
            <LogOut size={14} />
            Sign out
          </button>
        )}
      </div>
      {tab === "Conversations" &&
        (authored.length ? (
          <div className="profile-list">
            {authored.map((post) => (
              <button
                className="profile-list-item"
                key={post.id}
                onClick={() => go("post/" + post.id)}
              >
                <span
                  className={
                    "kind-badge " + (types[post.kind] || types.discussion).color
                  }
                >
                  {(types[post.kind] || types.discussion).label}
                </span>
                <span>
                  <strong>{post.title}</strong>
                  <small>
                    {dateOnly(post.created)} · {post.reply_count} replies
                  </small>
                </span>
                {post.status === "resolved" && (
                  <CheckCircle2 size={17} className="green-text" />
                )}
                <ArrowUpRight size={17} />
              </button>
            ))}
          </div>
        ) : (
          <Empty
            icon={MessagesSquare}
            title="A good conversation is only a question away."
            description={
              own
                ? "Your published posts will appear here."
                : "This developer hasn’t published a conversation yet."
            }
            action={own ? "Explore the feed" : null}
            onClick={() => go("feed")}
          />
        ))}
      {tab === "Participated" && <Participation user={user} go={go} />}
      {tab !== "Participated" && (
        <Pagination
          meta={
            tab === "Conversations"
              ? posts.pagination
              : tab === "Projects"
                ? projects.pagination
                : tab === "Events"
                  ? events.pagination
                  : communities.pagination
          }
          label={tab.toLowerCase()}
          onPage={onPage}
        />
      )}

      {tab === "Projects" &&
        (projects.filter((pr) => pr.user_id === p.id).length ? (
          <div className="profile-list">
            {projects
              .filter((pr) => pr.user_id === p.id)
              .map((pr) => (
                <button
                  className="profile-list-item"
                  key={pr.id}
                  onClick={() => go("post/" + pr.post_id)}
                >
                  <span
                    className={
                      "project-monogram small " + (pr.logo ? "has-logo" : "")
                    }
                  >
                    {pr.logo ? (
                      <img
                        src={"/api/uploads/" + pr.logo}
                        alt={pr.name + " logo"}
                      />
                    ) : (
                      pr.name.slice(0, 2).toUpperCase()
                    )}
                  </span>
                  <span>
                    <strong>{pr.name}</strong>
                    <small>
                      {pr.stage} · {pr.feedback_count} feedback
                    </small>
                  </span>
                  <ArrowUpRight size={17} />
                </button>
              ))}
          </div>
        ) : (
          <Empty
            icon={FolderGit2}
            title="Good things are in the making."
            description="Projects shared with the community will appear here."
            action={own ? "Explore projects" : null}
            onClick={() => go("projects")}
          />
        ))}
      {tab === "Events" &&
        (events.some((e) => e.user_id === p.id || has("event", e.id)) ? (
          <div className="profile-list">
            {events
              .filter((e) => e.user_id === p.id || has("event", e.id))
              .map((e) => (
                <button
                  className="profile-list-item"
                  key={e.id}
                  onClick={() => go("events")}
                >
                  <CalendarDays size={21} />
                  <span>
                    <strong>{e.title}</strong>
                    <small>
                      {dateTime(e.start_at)} ·{" "}
                      {e.user_id === p.id ? "Organizing" : "Attending"}
                    </small>
                  </span>
                  <ArrowUpRight size={17} />
                </button>
              ))}
          </div>
        ) : (
          <Empty
            icon={CalendarDays}
            title="Make a little room for good company."
            description="Events you host or join will appear here."
            action="Explore events"
            onClick={() => go("events")}
          />
        ))}
      {tab === "Communities" &&
        (communities.some((c) => c.is_member) ? (
          <div className="profile-list">
            {joinedCommunities
              .filter((c) => c.is_member)
              .map((c) => (
                <button
                  className="profile-list-item"
                  key={c.id}
                  onClick={() => go("community/" + c.id)}
                >
                  <span className={"community-symbol mini " + c.color}>
                    {c.symbol}
                  </span>
                  <span>
                    <strong>{c.name}</strong>
                    <small>
                      {c.members} members · {c.posts} conversations
                    </small>
                  </span>
                  <ArrowUpRight size={17} />
                </button>
              ))}
          </div>
        ) : (
          <Empty
            icon={Users}
            title="Your people are out there."
            description="Find a community that shares your curiosity."
            action="Find your community"
            onClick={() => go("communities")}
          />
        ))}
    </>
  );
}
function Participation({ user, go }) {
  const [page, setPage] = useState(1);
  const [items, setItems] = useState(null),
    [error, setError] = useState("");
  useEffect(() => {
    api("/participated?page=" + page)
      .then(setItems)
      .catch((e) => setError(e.message));
  }, [user.id, page]);
  if (error)
    return (
      <Empty title="Couldn’t load your conversations" description={error} />
    );
  if (!items)
    return (
      <div className="loading-state">
        <span className="spinner" />
        Finding your conversations…
      </div>
    );
  return items.length ? (
    <>
      <div className="profile-list">
        {items.map((p) => (
          <button
            className="profile-list-item"
            key={p.id}
            onClick={() => go("post/" + p.id)}
          >
            <MessageCircle size={20} />
            <span>
              <strong>{p.title}</strong>
              <small>
                {p.name} · {p.reply_count} replies
              </small>
            </span>
            <ArrowUpRight size={17} />
          </button>
        ))}
      </div>
      <Pagination
        meta={items.pagination}
        label="conversations"
        onPage={setPage}
      />
    </>
  ) : (
    <Empty
      icon={MessageCircle}
      title="Your perspective can make a difference."
      description="Conversations you reply to will appear here."
      action="Lend a hand"
      onClick={() => go("feed")}
    />
  );
}
if (!import.meta.env.SSR) {
  const root = document.getElementById("root");
  const page = ["/privacy", "/terms"].includes(window.location.pathname) ? (
    <PolicyPage type={window.location.pathname.slice(1)} />
  ) : window.location.pathname === "/" &&
    (!window.location.hash ||
      [
        "#possibilities",
        "#your-people",
        "#how-it-works",
        "#explore",
        "#community",
        "#open-source",
        "#faq",
      ].includes(window.location.hash)) ? (
    <Landing />
  ) : (
    <App />
  );
  const isPublic = page.type !== App;
  if (isPublic && root.dataset.prerender === location.pathname)
    hydrateRoot(root, page);
  else createRoot(root).render(page);
}
