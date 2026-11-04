import { connectedGitHubReader, githubList } from "./github-connected.mjs";
import { contributionRoot, requireContributions } from "./contributions.mjs";
import { loadRoom, requireRoom } from "./rooms.mjs";
import { flowPage, requireFlow } from "./review-flow.mjs";
import {
  loadWorkspace,
  requireWorkspace,
  revisionFileRanges,
} from "./project-workspace.mjs";
import { loadReviewQueue } from "./review-queue.mjs";
import { workQuery } from "./my-work.mjs";
import { starterChoices } from "./doctor.mjs";
import { githubReader, pullRequestLines } from "./github-reader.mjs";
import { loadCatalog, isCatalog } from "./catalog.mjs";
import { createHash } from "node:crypto";
import { githubContextLines } from "./github-context.mjs";
import { conversationLinks } from "./conversation-links.mjs";
export function assertSnippet(code, hash) {
  if (
    createHash("sha256")
      .update(code || "")
      .digest("hex") !== hash
  )
    throw Error(
      "Code changed while loading. Press Shift+R to refresh before reviewing.",
    );
}
export const navigation = [
  ["inbox", "Inbox", "Replies & mentions"],
  ["feed", "Public feed", "Developer commons"],
  ["open", "Open conversation", "Jump to a post"],
  ["ask", "Ask a question", "Find a way forward"],
  ["review", "Request code review", "Another pair of eyes"],
  ["drafts", "Local drafts", "Resume your writing"],
  ["communities", "Communities", "Your private spaces"],
  ["projects", "Projects", "Build in the open"],
  ["events", "Events", "Meet, learn and build"],
  ["search", "Search", "Find a conversation"],
  ["devices", "Connected terminals", "Manage CLI access"],
  ["appearance", "Appearance", "Themes & layout"],
  ["github-pr", "GitHub PR", "Read a public pull request"],
  ["help", "Help", "Keys & commands"],
  ["start", "Getting started", "Your first few minutes"],
  ["work", "My work", "Your conversations & reviews"],
  ["reviews", "Review queue", "Open requests & awaiting you"],
  ["workspace", "Project workspace", "Linked directory & work requests"],
  ["assigned", "Waiting for me", "Named review requests"],
  [
    "github-app",
    "GitHub workspace",
    "Installed repositories, issues & private PRs",
  ],
];
export async function notificationRoute(api, item) {
  if (item.code_review_id)
    return {
      view: "feedback",
      postId: item.post_id,
      id: item.code_review_id,
      page: 1,
      targetReply: item.feedback_reply_id || null,
    };
  if (!item.reply_id)
    return { view: "post", id: item.post_id, tab: "overview", page: 1 };
  const post = await api(`/posts/${item.post_id}?reply_id=${item.reply_id}`);
  const target = post.reply_path?.at(-1);
  if (!target || post.reply_target_missing)
    throw Object.assign(Error("The linked reply is no longer available."), {
      status: 404,
    });
  return target.parent_id
    ? {
        view: "thread",
        postId: item.post_id,
        parent: { id: target.parent_id },
        page: target.page,
        targetReply: item.reply_id,
      }
    : {
        view: "post",
        id: item.post_id,
        tab: "replies",
        page: target.page,
        targetReply: item.reply_id,
      };
}
export async function loadPage(api, route, signal) {
  const github = route.connected ? connectedGitHubReader(api) : githubReader;
  if (
    [
      "github-app",
      "github-repositories",
      "github-pulls",
      "github-issues",
    ].includes(route.view)
  )
    return githubList(
      api,
      {
        "github-app": "installations",
        "github-repositories": "repositories",
        "github-pulls": "pulls",
        "github-issues": "issues",
      }[route.view],
      {
        repository: route.repository,
        installation: route.installation,
        page: route.page || 1,
        signal,
      },
    );
  if (route.view === "github-checks") {
    const reader = connectedGitHubReader(api),
      pr = await reader.load(route.url, { signal, fresh: true });
    if (route.commit && pr.pull.commit !== route.commit)
      throw Error("PR changed. Refresh before inspecting checks.");
    const root =
      "/repos" +
      new URL(pr.pull.repository).pathname +
      "/commits/" +
      pr.pull.commit;
    const [runs, states] = await Promise.all([
      api(
        "/github/read?" +
          new URLSearchParams({ path: root + "/check-runs?per_page=20" }),
        { signal },
      ),
      api(
        "/github/read?" +
          new URLSearchParams({ path: root + "/status?per_page=20" }),
        { signal },
      ),
    ]);
    const after = await reader.load(route.url, { signal, fresh: true });
    if (after.pull.commit !== pr.pull.commit)
      throw Error("PR changed while loading checks. Refresh first.");
    return {
      title: "GitHub checks",
      subtitle: "Head " + pr.pull.commit,
      items: [
        ...(runs.data.check_runs || []).map((r) => ({
          id: "run-" + r.id,
          title: r.name,
          state: r.conclusion || r.status,
        })),
        ...(states.data.statuses || []).map((r) => ({
          id: "status-" + r.id,
          title: r.context,
          state: r.state,
        })),
      ],
    };
  }

  if (["contributions", "contribution-history"].includes(route.view)) {
    const root = contributionRoot(route.id);
    const d = requireContributions(
      await api(
        root +
          (route.view === "contribution-history"
            ? `/${route.contributionId}/history`
            : "") +
          `?page=${route.page || 1}`,
        { signal },
      ),
    );
    const room = requireRoom(
      await api(`/projects/${route.id}/room`, { signal }),
    );
    return {
      ...d,
      room,
      title:
        route.view === "contributions"
          ? "Contributions"
          : "Contribution history",
      subtitle: `${room.project.name} · Enter history · X actions · /room ${route.id}`,
    };
  }

  if (route.view === "room")
    return loadRoom(api, route.id, {
      state: route.state || "",
      page: route.page || 1,
      mine: route.mine,
      signal,
    });
  if (
    ["room-decisions", "room-activity", "room-decision-history"].includes(
      route.view,
    )
  ) {
    const suffix =
      route.view === "room-activity"
        ? "activity"
        : route.view === "room-decision-history"
          ? `decisions/${route.decisionId}/history`
          : "decisions";
    const data = requireRoom(
      await api(
        `/projects/${route.id}/room/${suffix}?page=${route.page || 1}&archived=${route.archived ? "1" : "0"}`,
        { signal },
      ),
    );
    const room = requireRoom(
      await api(`/projects/${route.id}/room`, { signal }),
    );
    return {
      ...data,
      room,
      title:
        route.view === "room-activity"
          ? "Room activity"
          : route.view === "room-decision-history"
            ? "Decision history"
            : "Pinned decisions",
      subtitle: `${room.project.name} · X actions · /room ${route.id}`,
    };
  }
  if (route.view === "assigned")
    return {
      ...(await flowPage(
        api,
        route.section || "waiting",
        route.page || 1,
        signal,
      )),
      title: "Waiting for me",
      subtitle:
        "Named requests · Enter opens reviewers · X actions · ← → sections",
    };
  if (route.view === "reviewers") {
    const [post, data] = await Promise.all([
      api(`/posts/${route.id}`, { signal }),
      api(
        `/posts/${route.id}/review-flow?page=${route.page || 1}${route.targetRequest ? "&target_id=" + route.targetRequest : ""}`,
        { signal },
      ),
    ]);
    requireFlow(data);
    return {
      ...data,
      post,
      title: "Reviewers · " + post.title,
      subtitle:
        "Requests belong to an exact snapshot · X accept / decline / outcome · I invite",
    };
  }
  if (route.view === "flow-links")
    return {
      ...requireFlow(
        await api(`/posts/${route.id}/revision-links?page=${route.page || 1}`, {
          signal,
        }),
      ),
      title: "Revisions linked to remarks",
      subtitle:
        "Author-provided links do not resolve remarks · Enter opens the revision",
    };
  if (route.view === "review-activity")
    return {
      ...requireFlow(
        await api(
          `/projects/${route.id}/review-activity?page=${route.page || 1}`,
          { signal },
        ),
      ),
      title: "Project review activity",
      subtitle: "Only currently visible linked work requests appear here.",
    };
  if (route.view === "workspace")
    return loadWorkspace(api, route.id, {
      page: route.page || 1,
      state: route.state,
      query: route.query,
      signal,
    });
  if (route.view === "versions") {
    const history = requireWorkspace(
      await api(`/posts/${route.postId}/revisions?page=${route.page || 1}`, {
        signal,
      }),
      "review_revisions",
    );
    return {
      ...history,
      title: "Review revisions",
      subtitle: "Immutable snapshots · Enter opens exact original code",
    };
  }
  if (route.view === "snapshot") {
    const snapshot = await api(`/posts/${route.postId}/revisions/${route.id}`, {
      signal,
    });
    return {
      snapshot,
      items: [],
      title: `Revision v${snapshot.number}`,
      subtitle: "Immutable original · read only · Esc returns",
    };
  }
  if (route.view === "start")
    return { title: "Getting started", items: starterChoices };
  if (route.view === "pr-diff")
    return github.loadDiff(route.url, {
      page: route.page || 1,
      path: route.path,
      signal,
    });
  if (route.view === "pr-files") {
    const data = await github.load(route.url, {
      page: route.page || 1,
      signal,
    });
    return {
      ...data,
      title: "PR changed files",
      items: data.files.map((f) => ({ ...f, id: f.path })),
    };
  }
  if (route.view === "pr")
    return github.load(route.url, { page: route.page || 1, signal });
  if (isCatalog(route)) return loadCatalog(api, route, signal);
  const get = (path) => api(path, { signal }),
    page = route.page || 1;
  if (route.view === "reviews")
    return {
      ...(await loadReviewQueue(api, route.tab || "open", page, signal)),
      title: "Review queue",
      subtitle:
        "Open requests · Awaiting you: involved open remarks last answered by someone else.",
    };
  if (route.view === "work")
    return {
      ...(await get(workQuery(route.tab || "mine", page))),
      title: "My work",
      subtitle:
        "Your account, same access rules. I opens Inbox · D opens local drafts.",
    };
  if (route.view === "feed")
    return {
      ...(await get("/posts?limit=12&page=" + page)),
      title: "Public feed",
      subtitle: "Questions, ideas and code worth discussing.",
    };
  if (route.view === "inbox")
    return {
      ...(await get("/notifications?page=" + page)),
      title: "Inbox",
      subtitle: "Your replies, mentions and review updates.",
    };
  if (route.view === "communities")
    return {
      ...(await get("/communities?limit=12&page=" + page)),
      title: "Communities",
      subtitle: "Private spaces, shared context. Enter opens a community.",
    };
  if (route.view === "search")
    return {
      ...(await get(
        "/search?type=" +
          (route.type || "posts") +
          "&q=" +
          encodeURIComponent(route.query || "") +
          "&page=" +
          page,
      )),
      title: "Search",
      subtitle: route.query
        ? "Results for “" + route.query + "”"
        : "Press / and type /search followed by your query.",
    };
  if (route.view === "devices")
    return {
      ...(await get("/cli/sessions")),
      title: "Connected terminals",
      subtitle: "Enter to revoke a terminal. Revoking this one signs it out.",
    };
  if (route.view === "community") {
    const community = await get("/communities/" + encodeURIComponent(route.id));
    const posts = community.is_member
      ? await get(
          "/posts?limit=12&community=" +
            encodeURIComponent(route.id) +
            "&page=" +
            page,
        )
      : { items: [] };
    return {
      ...posts,
      community,
      title: community.name,
      subtitle: community.is_member
        ? "Members-only conversations. N creates a conversation here."
        : community.requested
          ? "Your access request is pending."
          : "Private community. J requests access.",
    };
  }
  if (route.view === "post") {
    const post = await get(
      "/posts/" +
        route.id +
        (route.targetReply
          ? "?reply_id=" + route.targetReply
          : "?reply_page=" + page),
    );
    let items = post.replies,
      pagination = post.reply_pagination;
    let snippet_hash, summary, revision_id, revision_files;
    if (route.tab === "feedback") {
      const feedback = await get(
        "/posts/" +
          route.id +
          "/code-reviews?page=" +
          page +
          (route.status ? "&status=" + route.status : "") +
          (route.version ? "&version=" + route.version : "") +
          (route.targetReview ? "&target_id=" + route.targetReview : ""),
      );
      assertSnippet(post.code, feedback.snippet_hash);
      snippet_hash = feedback.snippet_hash;
      summary = feedback.summary;
      if (
        feedback.post_revision !== undefined &&
        feedback.post_revision !== post.revision
      )
        throw Error("Code changed while loading. Refresh before reviewing.");
      revision_id = feedback.revision_id;
      revision_files = feedback.files;
      items = feedback.items;
      pagination = feedback.pagination;
    }
    return {
      post,
      snippet_hash,
      summary,
      revision_id,
      revision_files,
      ...(revision_files
        ? {
            post: {
              ...post,
              review_revision_id: revision_id,
              review_files: revisionFileRanges({ files: revision_files }),
            },
          }
        : {}),
      items,
      pagination,
      title: post.title,
      subtitle:
        (post.community_id ? "Private community" : "Public feed") +
        " · " +
        post.kind +
        " · by " +
        post.name,
    };
  }
  if (route.view === "thread") {
    const post = await get(
      "/posts/" + route.postId + "?reply_id=" + route.parent.id,
    );
    const target = post.reply_path?.at(-1);
    let parent = post.replies?.find((r) => r.id === route.parent.id);
    if (!parent && target) {
      const siblings = await get(
        `/posts/${route.postId}/replies?parent_id=${target.parent_id || ""}&page=${target.page}`,
      );
      parent = siblings.items.find((r) => r.id === route.parent.id);
    }
    const replies = await get(
      `/posts/${route.postId}/replies?parent_id=${route.parent.id}&page=${page}`,
    );
    return {
      post,
      ...replies,
      items: [
        ...(parent ? [{ ...parent, entryType: "parent" }] : []),
        ...replies.items,
      ],
      title: "Reply thread",
      subtitle:
        "Reply #" +
        route.parent.id +
        " · " +
        (parent?.name || route.parent.name) +
        " · " +
        post.title,
    };
  }
  if (route.view === "feedback") {
    const [post, notes] = await Promise.all([
      get("/posts/" + route.postId),
      get(`/posts/${route.postId}/code-reviews?target_id=${route.id}`),
    ]);
    assertSnippet(post.code, notes.snippet_hash);
    if (
      notes.post_revision !== undefined &&
      notes.post_revision !== post.revision
    )
      throw Error("Code changed while loading. Refresh before reviewing.");
    const note = notes.items.find((item) => item.id === Number(route.id));
    if (!note) throw Error("This feedback is no longer available.");
    const replies = await get(
      `/posts/${route.postId}/code-reviews/${route.id}/replies?page=${page}${route.targetReply ? "&target_id=" + route.targetReply : ""}`,
    );
    return {
      post: {
        ...post,
        review_revision_id: notes.revision_id,
        review_files: revisionFileRanges(notes),
      },
      revision_id: notes.revision_id,
      revision_files: notes.files,
      note,
      snippet_hash: notes.snippet_hash,
      summary: notes.summary,
      items: [
        { ...note, entryType: "note" },
        ...replies.items.map((item) => ({
          ...item,
          entryType: "feedbackReply",
        })),
      ],
      pagination: replies.pagination,
      title: "Code feedback",
      subtitle: `Lines ${note.start_line}–${note.end_line} · ${note.resolved ? "resolved" : "open"}`,
    };
  }
  return { items: [], title: "Your workspace", subtitle: "" };
}
export function contentLines(route, data) {
  if (route.view === "pr") return pullRequestLines(data);
  if (route.view === "snapshot" && data.snapshot)
    return [
      `Revision v${data.snapshot.number} · ${data.snapshot.created}`,
      data.snapshot.review_focus || "",
      "",
      ...data.snapshot.files.flatMap((f) => [
        f.path + ` · lines ${f.start_line}–${f.end_line}`,
        ...f.code
          .split("\n")
          .map((line, i) => String(f.start_line + i).padStart(4) + "  " + line),
        "",
      ]),
    ];
  if (route.view === "help")
    return [
      "A developer workspace, in your terminal.",
      "",
      "Ctrl+K / /actions Search quick actions, sections and recent views",
      "/room [ID]       Project room tasks; uses the directory binding",
      "/decisions [ID]  Pinned decisions · X edit/history/archive",
      "/room-activity [ID] Tasks, decisions and reviews",
      "/pin             Pin a decision in the current room (owner)",
      "/assigned        Waiting / In review / Sent / History · ← → sections",
      "/reviewers ID    Named reviewers and outcomes for a conversation",
      "/invite ID @user Request a reviewer · confirmation required",
      "/flow-links ID   Revisions explicitly linked to earlier remarks",
      "/review-activity ID  Review events for a project",
      "/workspace [ID]  Project work requests; uses this directory’s explicit binding",
      "/bind ID         Associate this directory locally (confirmation required)",
      "/unbind          Remove only the local association",
      "/request ID      Link an existing conversation to the open workspace",
      "/state ID ready  Change linked request state (open/in_progress/ready)",
      "/versions ID     Immutable history; Enter opens a snapshot",
      "/revision ID     Preview and publish a new file/diff revision",
      "H / U in review History / share revision · B on old remark opens original",
      "/reviews         Open review requests / Awaiting you · ← → sections",
      "Review summary   Current open/resolved and earlier remarks · G version filter",
      "/work            Mine / Reviews / Saved / Following · ← → tabs · I inbox · D drafts",
      "/start           Getting-started guide and safe first actions",
      "/doctor          Read-only environment and connection checks",
      "/pr URL          Read a public GitHub PR and paginate changed files",
      "PR diff          A adds hunks; R reviews basket; U removes; Z clears",
      "Review files     { / } switches files in a published review",
      "Tab              Switch navigation / content / command bar",
      "↑ ↓              Select a section, conversation or reply",
      "Enter            Open the selected item",
      "Esc              Back / leave an input",
      "← →              Switch conversation tabs",
      "Page Up / Down   Scroll a conversation or list",
      "N / A            New conversation / ask a question",
      "R                Reply in a conversation; refresh a list",
      "V / W            Open review workspace / switch code and discussion",
      "Space / C        Select a line range / comment on selected code",
      "F                Filter remarks or the Projects / Events catalog",
      "N / E            Create / edit your project or event in its section",
      "J                Join / leave an event (confirmation required)",
      "X in catalogs    Links, project conversation, calendar and event management",
      "X / ?            Context actions (edit, delete, solution, live updates)",
      "Live updates     45s active / 3min idle; pause in X actions or --no-live",
      "C                Add feedback on code lines",
      "S                Resolve / reopen selected code feedback",
      "E / D            Edit / delete your own feedback or reply",
      "O                Open this conversation in your browser",
      "/                Focus the command / search bar",
      "Ctrl+E           Edit a multiline field in VISUAL / EDITOR",
      "Ctrl+L           Save a draft and reconnect an expired session",
      "Ctrl+N / Ctrl+P  Next / previous step in conversation/project/event forms",
      "Ctrl+S           Validate all steps and preview the current form",
      "Full text        / finds text; n/N cycles; Home/End; Esc remembers position",
      "Ctrl+O / Ctrl+G  Select a code file / Git diff in a review form",
      "Ctrl+O           Pick a workspace image on logo/banner/screenshot fields",
      "/drafts          Restore locally saved drafts for this account/project",
      "/appearance      Preview and save local themes and layout",
      "Ctrl+C           Exit and restore the original terminal",
      "",
      "Commands: /feed  /inbox  /search words  /open 142",
      "          /ask  /review  /communities  /projects  /events  /devices  /logout  /quit",
      "",
      "Text fields: arrows move the caret; Home/End move within a line.",
      "Multiline fields: Enter adds a line; Tab changes field.",
      "Nothing is published until you confirm the preview.",
      "A -> Z: your browser account and this terminal use the same data.",
    ];
  if (route.view === "community" && !data.community?.is_member)
    return [
      data.community?.description || "",
      "",
      data.community?.requested
        ? "Access requested. The owner or validators will review it."
        : "Press J to request access.",
    ];
  if (route.view === "post" && (!route.tab || route.tab === "overview")) {
    const p = data.post;
    if (!p) return [];
    const lines = [p.body || ""];
    if (p.review_focus) lines.push("", "REVIEW FOCUS", p.review_focus);
    if (p.code)
      lines.push(
        "",
        "CODE SNIPPET",
        ...p.code
          .split("\n")
          .map((line, index) => String(index + 1).padStart(4) + "  " + line),
      );
    lines.push(...githubContextLines(p.github_context));
    const links = conversationLinks(p);
    if (links.length)
      lines.push(
        "",
        "LINKS",
        ...links.map((link) => link.label + " · " + link.url),
      );
    if (p.archived_at || p.locked_at)
      lines.push("", "Replies are paused for this conversation.");
    return lines;
  }
  return [];
}
