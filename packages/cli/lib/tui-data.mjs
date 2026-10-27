import { createHash } from "node:crypto";
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
  ["search", "Search", "Find a conversation"],
  ["devices", "Connected terminals", "Manage CLI access"],
  ["help", "Help", "Keys & commands"],
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
  const get = (path) => api(path, { signal }),
    page = route.page || 1;
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
    let snippet_hash;
    if (route.tab === "feedback") {
      const feedback = await get(
        "/posts/" +
          route.id +
          "/code-reviews?page=" +
          page +
          (route.status ? "&status=" + route.status : ""),
      );
      assertSnippet(post.code, feedback.snippet_hash);
      snippet_hash = feedback.snippet_hash;
      items = feedback.items;
      pagination = feedback.pagination;
    }
    return {
      post,
      snippet_hash,
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
      subtitle: "Replying to " + (parent?.name || route.parent.name),
    };
  }
  if (route.view === "feedback") {
    const [post, notes] = await Promise.all([
      get("/posts/" + route.postId),
      get(`/posts/${route.postId}/code-reviews?target_id=${route.id}`),
    ]);
    assertSnippet(post.code, notes.snippet_hash);
    const note = notes.items.find((item) => item.id === Number(route.id));
    if (!note) throw Error("This feedback is no longer available.");
    const replies = await get(
      `/posts/${route.postId}/code-reviews/${route.id}/replies?page=${page}${route.targetReply ? "&target_id=" + route.targetReply : ""}`,
    );
    return {
      post,
      note,
      snippet_hash: notes.snippet_hash,
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
  if (route.view === "help")
    return [
      "A developer workspace, in your terminal.",
      "",
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
      "F                Filter remarks: all, open, resolved",
      "X / ?            Context actions (edit, delete, solution, live updates)",
      "Live updates     45s active / 3min idle; pause in X actions or --no-live",
      "C                Add feedback on code lines",
      "S                Resolve / reopen selected code feedback",
      "E / D            Edit / delete your own feedback or reply",
      "O                Open this conversation in your browser",
      "/                Focus the command / search bar",
      "Ctrl+E           Edit a multiline field in VISUAL / EDITOR",
      "Ctrl+L           Save a draft and reconnect an expired session",
      "Ctrl+S           Preview the current form",
      "Ctrl+O / Ctrl+G  Select a code file / Git diff in a review form",
      "/drafts          Restore locally saved drafts for this account/project",
      "Ctrl+C           Exit and restore the original terminal",
      "",
      "Commands: /feed  /inbox  /search words  /open 142",
      "          /ask  /review  /communities  /devices  /logout  /quit",
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
    if (p.links?.length)
      lines.push(
        "",
        "LINKS",
        ...p.links.map((link) => link.label + " · " + link.url),
      );
    if (p.archived_at || p.locked_at)
      lines.push("", "Replies are paused for this conversation.");
    return lines;
  }
  return [];
}
