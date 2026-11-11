export const launchFilm = "https://www.youtube.com/watch?v=qjFs2yy5uz0";
// Public, curated release notes. npm milestones are independent of GitHub releases;
// only describe shipped behavior here, and keep planned work out of this timeline.
export const repository = "https://github.com/Tenyokj/devdevian";
export const updates = [
  {
    id: "devdevian-1-0",
    channel: "Browser",
    version: "1.0.0",
    title: "From conversation to contribution.",
    summary: "Devdevian V1 brings the forum, shared project work and GitHub context together in your browser and terminal.",
    points: [
      "Rooms, snapshot-based reviews, Contributions and My Work keep the next step beside the discussion.",
      "Choose project participation independently of visibility, and explore the dedicated documentation. CLI remains a separately versioned alpha.",
    ],
    link: launchFilm,
    label: "Watch the V1 film",
  },
  {
    id: "documentation-0-10",
    channel: "Browser",
    version: "0.10.0",
    title: "A field guide for people who build.",
    summary:
      "Searchable documentation for the forum, terminal, shared work and self-hosting.",
    points: [
      "25 crawlable guides with practical workflows, commands, section navigation and source links.",
      "Project contributor credits respect readable work; profile photos follow people across project, task and notification surfaces.",
    ],
    link: "/docs",
    label: "Open the documentation",
  },
  {
    id: "project-participation-0-9",
    channel: "Browser",
    version: "0.9.0",
    title: "Open to see. Clear about who can join.",
    summary:
      "Choose open work or approved contributors, independently of project visibility.",
    points: [
      "Owners manage contributor usernames with preview and version checks. Approval never grants private community access.",
      "Observers can follow the work; revocation releases active assignments and preserves published results and history.",
    ],
    link: repository + "/blob/main/docs/project-participation.md",
    label: "Project participation guide",
  },
  {
    id: "cli-participation-0-22",
    channel: "CLI",
    version: "0.22.0-alpha.1",
    title: "The right people. The same terminal.",
    summary:
      "Read project participation rules or manage an approved team from your workspace.",
    points: [
      "Project creation, Room actions and /participation share the same server-enforced permissions.",
      "Captured versions, explicit previews and database barriers keep old drafts from retaining revoked working access.",
    ],
    link: repository + "/blob/main/docs/project-participation.md#terminal",
    label: "Terminal controls",
  },
  {
    id: "my-work-0-8",
    channel: "Browser",
    version: "0.8.0",
    title: "A clear next step.",
    summary:
      "Reviews to answer, assigned tasks and results to review, together in My work.",
    points: [
      "Next up opens the exact review or task result. Project rooms and GitHub checks stay one explicit action away.",
      "Continue local drafts and recently opened conversations; current permissions are checked before recent titles return.",
    ],
    link: repository + "/blob/main/docs/my-work.md",
    label: "My work guide",
  },
  {
    id: "cli-my-work-0-21",
    channel: "CLI",
    version: "0.21.0-alpha.1",
    title: "Pick up where it matters.",
    summary:
      "Next up, Tasks, Results and Continue bring your working day into the terminal.",
    points: [
      "Open exact review requests and task results with Enter; read PR checks on demand.",
      "Resume local drafts and recent conversations for this account and directory. Existing Mine, Reviews, Saved and Following remain available.",
    ],
    link: repository + "/blob/main/docs/my-work.md#terminal",
    label: "Terminal workflow",
  },
  {
    id: "github-room-work-0-7",
    channel: "Browser",
    version: "0.7.0",
    title: "From an issue to work that moves.",
    summary:
      "Import GitHub issues into Rooms, connect task PRs to exact contribution revisions and follow current checks and reviews.",
    points: [
      "Private projects preserve their community audience, including their room and media. Private imports require explicit consent.",
      "Preview fingerprints, durable operation keys and permission rechecks protect task imports and PR links. Production CSP and early upload attempt limits strengthen the browser and API.",
    ],
    link: repository + "/blob/main/docs/github-room-work.md",
    label: "GitHub room work guide",
  },
  {
    id: "cli-github-room-work-0-20",
    channel: "CLI",
    version: "0.20.0-alpha.1",
    title: "Issue. Task. Pull request. One terminal.",
    summary:
      "Bring GitHub work into your room from live terminal actions or script commands.",
    points: [
      "Import issues, link task PRs and contribution revisions, then inspect current commit checks and review verdicts.",
      "Explicit private-sharing confirmation, project visibility choices and frozen previews keep the audience clear. Merging never accepts a contribution automatically.",
    ],
    link: repository + "/blob/main/docs/github-room-work.md#terminal",
    label: "Terminal workflow",
  },
  {
    id: "github-workspace-0-6",
    channel: "Browser",
    version: "0.6.0",
    title: "Your repository. A shared next step.",
    summary:
      "Connect selected GitHub repositories and inspect PRs, issues, changes and commit checks beside your project.",
    points: [
      "Separate GitHub App authorization preserves each viewer's own public/private repository access.",
      "Choose exact changes for a frozen review draft. Private code sharing requires a private community and explicit consent.",
    ],
    link: repository + "/blob/main/docs/github-app.md",
    label: "GitHub workspace guide",
  },
  {
    id: "cli-github-workspace-0-19",
    channel: "CLI",
    version: "0.19.0-alpha.1",
    title: "A GitHub workspace beside your code.",
    summary:
      "Browse installed repositories, private PRs, issues and checks in the live terminal or scripts.",
    points: [
      "Use /github, /connected-pr or --connected. GitHub tokens stay on the server.",
      "Existing diff selection and review baskets preserve commit provenance and private sharing boundaries.",
    ],
    link: repository + "/blob/main/docs/github-app.md#terminal",
    label: "Connected terminal guide",
  },
  {
    id: "contributions-0-5",
    channel: "Browser",
    version: "0.5.0",
    title: "Bring the work back.",
    summary:
      "Submit a result for an assigned task, get feedback and keep every revision with its decision.",
    points: [
      "Project owners accept a specific result or request changes. A new revision keeps the earlier history.",
      "Attach a checked public GitHub PR with pinned commits. New code never silently inherits an earlier verdict.",
    ],
    link: repository + "/blob/main/docs/contributions.md",
    label: "Contributions guide",
  },
  {
    id: "cli-contributions-0-18",
    channel: "CLI",
    version: "0.18.0-alpha.1",
    title: "From your editor to an accepted result.",
    summary:
      "Submit work and review contributions without leaving the terminal.",
    points: [
      "Use /contributions, task actions and matching script commands. Preview and confirm before publishing.",
      "Open an attached public PR, inspect the diff and keep the result history beside your code.",
    ],
    link: repository + "/blob/main/docs/contributions.md#terminal",
    label: "Terminal workflow",
  },
  {
    id: "rooms-0-4",
    channel: "Browser",
    version: "0.4.0",
    title: "A place for the next useful step.",
    summary:
      "Project rooms bring a shared task board, named assignees, pinned decisions and activity together.",
    points: [
      "Pick up work, move it forward and keep the reasons behind decisions with their edit history. Private work keeps its audience.",
      "Fresh project accents and syntax colors make states and code easier to read in both themes.",
    ],
    link: repository + "/blob/main/docs/rooms.md",
    label: "Explore Rooms",
  },
  {
    id: "cli-rooms-0-17",
    channel: "CLI",
    version: "0.17.0-alpha.1",
    title: "The room, right beside your code.",
    summary:
      "Open your project room from its bound directory. Pick up tasks, follow decisions and share progress from the terminal.",
    points: [
      "Use /room, /decisions and /room-activity; X offers actions permitted for the selected work.",
      "Preview changes before confirming. Tasks, decisions and version checks are shared with the browser.",
    ],
    link: repository + "/blob/main/docs/rooms.md#use-the-terminal",
    label: "Terminal Rooms guide",
  },
  {
    id: "review-flow-0-3",
    channel: "Browser",
    version: "0.3.0",
    title: "A person. A revision. A useful next step.",
    summary:
      "Invite a named reviewer, follow Waiting for me and publish an outcome for the exact code you inspected — in the browser or terminal.",
    points: [
      "Changes requested and No objections stay attached to their assigned revision. New code never inherits an earlier verdict.",
      "Link a newer revision to an earlier remark without silently resolving it. Project review activity follows existing private access.",
    ],
    link: repository + "/blob/main/docs/review-flow.md",
    label: "Review Flow guide",
  },
  {
    id: "cli-review-flow-0-16",
    channel: "CLI",
    version: "0.16.0-alpha.1",
    title: "Your next review is waiting.",
    summary:
      "Waiting, In review, Sent and History bring named review requests into your terminal workspace.",
    points: [
      "Accept, decline, inspect assigned code and preview an immutable review outcome before sharing it.",
      "Script commands and live forms use the same version checks and permissions as the browser.",
    ],
    link: repository + "/blob/main/docs/review-flow.md#terminal-workflow",
    label: "Terminal review workflow",
  },
  {
    id: "cli-workspaces-0-15",
    channel: "CLI",
    version: "0.15.0-alpha.1",
    title: "Your project. Your terminal. One workspace.",
    summary:
      "Link a directory to a project, follow its work requests and share another immutable review revision from selected files or Git changes.",
    points: [
      "Browse original snapshots and keep earlier feedback attached to its exact code.",
      "Preview every publication; drafts survive conflicts and interrupted creation is not silently replayed.",
    ],
    link: repository + "/blob/main/packages/cli/README.md#workspaces-02",
    label: "CLI Workspaces guide",
  },
  {
    id: "workspaces-0-2",
    channel: "Browser",
    version: "0.2.0",
    title: "Give your work a place to move forward.",
    summary:
      "Project workspaces bring requests, review iterations and their original feedback together in the browser and terminal.",
    points: [
      "Organize requests as Open, In progress or Ready without changing conversation visibility.",
      "Compare immutable revisions and open the original code behind an earlier remark. Private communities stay private.",
    ],
    link: repository + "/blob/main/docs/workspaces-0.2.md",
    label: "Explore Workspaces",
  },
  {
    id: "cli-0-14",
    channel: "CLI",
    version: "0.14.0-alpha.1",
    title: "Keep the review moving.",
    summary:
      "Review queue brings open requests and discussions awaiting your reply into the terminal, with version-aware remark totals and session reading continuity.",
    points: [
      "Open a waiting remark at its latest visible reply. Existing private access, paused and resolved states still apply.",
      "Return to your code position and selected remark within the session. Changed snippets and account resets discard stale positions.",
    ],
    link:
      repository +
      "/blob/main/packages/cli/README.md#review-queue-and-continuity",
    label: "Review queue guide",
  },
  {
    id: "browser-review-navigation",
    channel: "Browser",
    version: "0.1.9",
    title: "Follow the changes, file by file.",
    summary:
      "Browse published PR snapshots by file and change, with readable additions and removals on desktop and mobile.",
    points: [
      "Jump from line feedback back to its code, even across long patches. Published line numbers remain unchanged.",
      "Earlier-version remarks keep their saved quotes. File navigation works on the frozen snapshot without fetching GitHub.",
    ],
    link:
      repository +
      "/blob/main/docs/github-pr-reader.md#browser-review-workspace",
    label: "Browser review guide",
  },
  {
    id: "cli-0-13",
    channel: "CLI",
    version: "0.13.0-alpha.1",
    title: "Your work, with a little pumpkin glow.",
    summary:
      "Find your own conversations, review requests, bookmarks and followed conversations in My work. An optional Halloween theme brings warm orange accents and a terminal-native pumpkin.",
    points: [
      "Switch sections, page results and return to Inbox or local drafts without losing your place.",
      "Preview, save or disable the seasonal theme locally. Reduced motion, mascot hiding and existing privacy rules still apply.",
    ],
    link:
      repository + "/blob/main/packages/cli/README.md#my-work-and-halloween",
    label: "My work and Halloween guide",
  },
  {
    id: "cli-0-12",
    channel: "CLI",
    version: "0.12.0-alpha.1",
    title: "A clearer first few minutes.",
    summary:
      "A short interactive guide and read-only diagnostics help you find your way from installation to a first conversation.",
    points: [
      "Open /start to explore the feed, ask a question or review a public PR with guidance.",
      "Run devdevian doctor or /doctor to check your environment and connection. Settings and credentials stay unchanged.",
    ],
    link: repository + "/blob/main/docs/cli-diagnostics.md",
    label: "First launch and diagnostics",
  },
  {
    id: "cli-0-11",
    channel: "CLI",
    version: "0.11.0-alpha.1",
    title: "One PR. All the context that matters.",
    summary:
      "Bring selected changes from multiple PR files into one Devdevian review, with a shared frozen revision.",
    points: [
      "Collect up to ten files, preview the exact patch, and keep implementation and tests in one conversation.",
      "Saved drafts, per-file published line ranges and terminal navigation keep review comments anchored. Nothing is written back to GitHub.",
    ],
    link: repository + "/blob/main/docs/github-pr-reader.md",
    label: "Read the multi-file review guide",
  },
  {
    id: "browser-public-conversations",
    channel: "Browser",
    version: "0.1.7",
    title: "A conversation worth sharing.",
    summary:
      "Public conversations now have readable links with text and code rendered on the server, a social preview, and paginated replies.",
    points: [
      "Read without an account, then sign in on the same page to reply. Existing workspace links still work.",
      "Public sitemaps include eligible conversations; private and removed posts stay excluded.",
    ],
    link:
      repository +
      "/blob/main/docs/user-guide.md#sharing-and-reading-public-conversations",
    label: "Read the sharing guide",
  },
  {
    id: "site-guide",
    channel: "Browser",
    version: "Website update",
    title: "A clearer way into Devdevian.",
    summary:
      "A searchable FAQ, this update history, and a refreshed landing connect the forum, terminal workspace and project documentation.",
    points: [
      "Find answers about accounts, communities, privacy and the CLI.",
      "Browse browser and CLI milestones separately; npm versions do not require a separate GitHub release.",
    ],
    link: "/faq",
    label: "Explore the FAQ",
  },
  {
    id: "cli-0-10",
    channel: "CLI",
    version: "0.10.0-alpha.1",
    title: "From a pull request to a useful review.",
    summary:
      "Read a public GitHub PR diff, choose a file and specific changes, then preview and publish a code review in Devdevian.",
    points: [
      "Select complete diff hunks or a contiguous range of hunks.",
      "Base/head checks detect PR changes while a patch loads. Nothing is written back to GitHub.",
    ],
    link: repository + "/blob/main/docs/github-pr-reader.md",
    label: "Read the PR review guide",
  },
  {
    id: "cli-0-9",
    channel: "CLI",
    version: "0.9.0-alpha.1",
    title: "Public pull requests, inside your terminal.",
    summary:
      "Inspect a public PR’s status, author, branches, description and changed files without leaving your workspace.",
    points: [
      "Public GitHub reads do not require a Devdevian login.",
      "GitHub rate limits and unavailable resources are surfaced in the workspace.",
    ],
    link: repository + "/blob/main/docs/github-pr-reader.md",
    label: "Explore GitHub support",
  },
  {
    id: "cli-0-8",
    channel: "CLI",
    version: "0.8.0-alpha.1",
    title: "Give code feedback its GitHub context.",
    summary:
      "Optionally attach repository, branch, base commit, file path and a pull request link to your review.",
    points: [
      "Context is visible in both the browser and CLI.",
      "Repository metadata is opt-in; sign-in does not grant access to private repositories.",
    ],
    link: repository + "/blob/main/docs/github-context.md",
    label: "Understand review context",
  },
  {
    id: "cli-0-7",
    channel: "CLI",
    version: "0.7.0–0.7.2 alpha",
    title: "Less friction between an idea and a post.",
    summary:
      "Quick actions, clearer writing forms, local drafts and reading positions make everyday terminal use easier.",
    points: [
      "Demo and project links appear in conversation details.",
      "Multiline input keeps earlier text visible while you write.",
    ],
    link: repository + "/blob/main/packages/cli/VERSIONS.md",
    label: "See every CLI patch",
  },
  {
    id: "cli-0-6",
    channel: "CLI",
    version: "0.6.0–0.6.1 alpha",
    title: "Projects and events join the workspace.",
    summary:
      "Browse, search and manage projects and events, join an event and keep its calendar entry close by.",
    points: [
      "Publish and edit your own projects and events from the terminal.",
      "The CLI guide and branded help screen make commands easier to discover.",
    ],
    link: repository + "/blob/main/packages/cli/README.md",
    label: "Open the CLI guide",
  },
  {
    id: "cli-0-5",
    channel: "CLI",
    version: "0.5.0–0.5.1 alpha",
    title: "Make your terminal feel like yours.",
    summary:
      "Themes, accent colors, density and layout preferences give the live workspace its own character. Devi joins the welcome screen.",
    points: [
      "Choose midnight, nebula, daylight or contrast.",
      "Control motion and the welcome greeting locally.",
    ],
    link: repository + "/blob/main/packages/cli/README.md",
    label: "Customize your workspace",
  },
  {
    id: "cli-workspace",
    channel: "CLI",
    version: "0.2.0–0.4.1 alpha",
    title: "A live workspace, close to your code.",
    summary:
      "The interactive terminal gains navigation, a project file picker, local Git diff selection, inline review threads and a live inbox.",
    points: [
      "Only explicitly selected files and changes are previewed for publication.",
      "Reply editing and deletion follow the same ownership rules as the browser.",
    ],
    link: repository + "/blob/main/packages/cli/VERSIONS.md",
    label: "Follow the CLI history",
  },
  {
    id: "browser-0-1-6",
    channel: "Browser",
    version: "0.1.6 · API & browser",
    title: "One forum. Two ways to take part.",
    summary:
      "Browser and terminal clients share accounts, conversations and access rules, with device authorization and shared GitHub review context.",
    points: [
      "Approve terminal login in your browser and revoke a terminal in Settings.",
      "Review context and terminal publications are available in the browser too.",
    ],
    link: repository + "/blob/main/docs/authentication.md",
    label: "Read about authentication",
  },
  {
    id: "browser-feedback",
    channel: "Browser",
    version: "0.1.4–0.1.5",
    title: "Code feedback with room to follow up.",
    summary:
      "Focused code feedback and discussion tools keep review threads tied to the code and its context.",
    points: [
      "Discuss specific lines and resolve review threads.",
      "Accepted answers remain a separate choice made by the conversation author.",
    ],
    link: repository + "/blob/main/docs/user-guide.md",
    label: "Read the user guide",
  },
  {
    id: "browser-following",
    channel: "Browser",
    version: "0.1.2–0.1.3",
    title: "Keep up with the conversations that matter.",
    summary:
      "Local drafts, topic and conversation subscriptions, Following and in-app mentions help you pick up where you left off.",
    points: [
      "Notifications respect community access and your preferences.",
      "Dates include hours and minutes for clearer context.",
    ],
    link: "/faq#following",
    label: "Learn about follows",
  },
  {
    id: "browser-recovery",
    channel: "Browser",
    version: "0.1.1",
    title: "Recovery and reliability come first.",
    summary:
      "Email password recovery, clearer server errors, quotas and backup/restore tooling strengthen the early release.",
    points: [
      "Password reset uses an expiring email code.",
      "Backup tooling includes restore verification; its operation depends on the deployment’s configuration.",
    ],
    link: repository + "/blob/main/docs/reliability.md",
    label: "Read the reliability guide",
  },
  {
    id: "browser-start",
    channel: "Browser",
    version: "0.1.0",
    title: "The first public Devdevian.",
    summary:
      "An open-source forum for programming questions, discussions, code reviews, projects, events and private developer communities.",
    points: [
      "Email, Google and GitHub sign-in.",
      "A shared place for useful answers and the people behind them.",
    ],
    link: "/app",
    label: "Enter the forum",
  },
];

export const categories = [
  "Getting started",
  "Conversations",
  "CLI & GitHub",
  "Privacy & community",
];
// Stable IDs are public deep links. Keep them when wording or categories change.
export const questions = [
  {
    id: "what-is-devdevian",
    category: categories[0],
    question: "What is Devdevian?",
    answer:
      "Devdevian is an open-source forum for programmers: questions, discussions, human code feedback, projects and events. You can use the browser or the official terminal client with the same account. The project is live and actively developed.",
    href: "/app",
    label: "Open the forum",
  },
  {
    id: "who-is-it-for",
    category: categories[0],
    question: "Is it only for experienced developers?",
    answer:
      "No. Beginners, experienced engineers, maintainers and people building their first project are welcome. A focused question with context is a good starting point, whatever your stack.",
  },
  {
    id: "sign-in",
    category: categories[0],
    question: "How do I create an account or sign in?",
    answer:
      "Public conversation pages can be read without signing in. To take part, use verified email registration, Google or GitHub in the browser. An existing account with the same email may require a one-time email confirmation to connect a new provider. Choose your permanent @username carefully; it must be unique.",
  },
  {
    id: "password",
    category: categories[0],
    question: "What if I forget my password?",
    answer:
      "Use the password recovery option in the sign-in form. Email accounts can reset their password with an expiring verification code. Check spam if the message does not arrive. Google and GitHub sign-in are also available when connected to your account.",
  },
  {
    id: "free-and-open",
    category: categories[0],
    question: "Is Devdevian open source? Can I contribute?",
    answer:
      "Yes. The application is published under GPL-3.0-only. Code, documentation, design improvements and reproducible bug reports are welcome through the contribution and review process. The software license does not automatically relicense content posted by users.",
    href: repository + "/blob/main/CONTRIBUTING.md",
    label: "Contribution guidelines",
  },
  {
    id: "post-types",
    category: categories[1],
    question: "What can I publish?",
    answer:
      "Start a Question, Discussion, Code review or Show & tell. Add a topic and relevant technologies, Markdown, code, labeled links and supported attachments. Use Projects to present your work and Events to arrange a meetup or session.",
  },
  {
    id: "accepted-answer",
    category: categories[1],
    question: "Who can mark an accepted answer?",
    answer:
      "The author of a Question or Code review can mark a reply as the accepted answer and undo that choice. This is a real product feature shared by the browser and CLI. Resolving an inline review thread is a separate action.",
  },
  {
    id: "archive",
    category: categories[1],
    question: "What does Archive conversation do?",
    answer:
      "Archiving closes the conversation to new replies while keeping its existing content available to people who can access it. It does not delete the conversation. Author actions remain subject to moderation restrictions.",
  },
  {
    id: "following",
    category: categories[1],
    question: "How do Following, subscriptions and mentions work?",
    answer:
      "Follow a topic for new public conversations, or subscribe to a conversation for replies. Following collects relevant conversations; saved posts are separate bookmarks. @mentions can create in-app notifications. Private content still requires community membership, and notification preferences apply to future alerts.",
  },
  {
    id: "drafts",
    category: categories[1],
    question: "Are my drafts synchronized between devices?",
    answer:
      "No. Browser drafts are stored locally for the account and entry point for up to 30 days. CLI drafts are local to that installation. Neither is a cloud backup, and selected attachment files are not saved as part of a browser draft.",
  },
  {
    id: "files",
    category: categories[1],
    question: "Which files can I attach?",
    answer:
      "Supported uploads include images, PDFs, ZIP archives and selected text/code formats, with a 4 MB file limit. Executable HTML and SVG uploads are rejected. Only share code and files you have permission to publish; remove secrets and personal information first.",
  },
  {
    id: "events",
    category: categories[1],
    question: "How do event dates and meeting links work?",
    answer:
      "Events are scheduled in the organizer’s timezone, stored as UTC and displayed in the viewer’s timezone. The event date filter selects a single date. Meeting links are available to attendees and the organizer; downloaded calendar entries omit the private meeting URL.",
  },
  {
    id: "cli-install",
    category: categories[2],
    question: "How do I install the CLI?",
    answer:
      "Install Node.js 24 or newer, then run npm install -g @tenyokjs/devdevian-cli@alpha and launch devdevian tui. It runs inside your current terminal, including the VS Code integrated terminal. devdevian open opens a separate terminal window on supported systems.",
    href: repository + "/blob/main/packages/cli/README.md",
    label: "Installation and command reference",
  },
  {
    id: "cli-account",
    category: categories[2],
    question: "Does the terminal use the same account and forum?",
    answer:
      "Yes. Approve terminal authorization in your browser. Posts, replies, projects and events are shared with the browser application, with the same visibility and ownership rules. Revoke terminal access in Settings. Appearance and local drafts belong to the terminal installation.",
  },
  {
    id: "local-files",
    category: categories[2],
    question: "Does the CLI upload my whole project?",
    answer:
      "No. The file picker starts from the working directory or an explicit project path. You select a file, line range or Git diff and preview the content before publishing. Browsing files is not permission to publish the project. Review the preview for credentials and unrelated changes.",
  },
  {
    id: "github-access",
    category: categories[2],
    question: "Does GitHub sign-in grant repository access?",
    answer:
      "No. GitHub sign-in identifies your account; it does not grant the application access to your private repositories. The current PR reader uses public GitHub resources and is subject to GitHub’s rate limits. Optional repository metadata gives a review context, not repository permissions.",
  },
  {
    id: "pr-review",
    category: categories[2],
    question: "Can I turn a GitHub pull request diff into a review?",
    answer:
      "Yes, for supported public PRs. Choose complete hunk ranges from up to ten files: A adds each selection to the basket and R composes one review. Preview the exact patch before publishing. Files must share one base/head revision; the saved draft remains a frozen snapshot if GitHub changes later. Reviews and comments stay in Devdevian; nothing is written back to GitHub.",
    href: repository + "/blob/main/docs/github-pr-reader.md",
    label: "Public PR workflow and limits",
  },
  {
    id: "cli-versions",
    category: categories[2],
    question: "Why are CLI versions different from browser versions?",
    answer:
      "The browser/API and npm client have independent version numbers. CLI alpha patches can be published between combined GitHub releases. The CLI version log records each package milestone and compatibility notes; What’s new summarizes product changes.",
    href: "/updates",
    label: "See what’s new",
  },
  {
    id: "topics-communities",
    category: categories[3],
    question: "What is the difference between a topic and a community?",
    answer:
      "Topics organize the public feed. Communities are separate private spaces for approved members. A topic subscription does not grant community membership. Community owners and validators handle membership and moderation within their community.",
  },
  {
    id: "moderation",
    category: categories[3],
    question: "Who moderates Devdevian?",
    answer:
      "Community owners and appointed validators moderate their own community. Platform moderators handle public-forum reports. Seeing a moderation page does not grant moderator permissions; the server checks access to each queue and action.",
    href: repository + "/blob/main/docs/moderation.md",
    label: "Moderation roles explained",
  },
  {
    id: "private-content",
    category: categories[3],
    question: "Are private communities end-to-end encrypted?",
    answer:
      "No. Membership checks restrict access to community conversations and their attachments, but this is not end-to-end encryption. Authorized maintainers and infrastructure providers may be able to access stored data. Do not use the forum to store secrets.",
    href: "/privacy",
    label: "Privacy & Security",
  },
  {
    id: "delete-account",
    category: categories[3],
    question: "Can I delete my account and data?",
    answer:
      "Account deletion is available in Settings with username confirmation. Transfer communities you own first. Deletion anonymizes contributions where appropriate and does not mean that every published conversation disappears. For a data request, contact dv842449@gmail.com.",
    href: "/privacy",
    label: "Deletion and retention details",
  },
  {
    id: "report-bug",
    category: categories[3],
    question: "Where should I report a bug or security problem?",
    answer:
      "Use a GitHub issue for a reproducible non-sensitive bug. Report vulnerabilities privately using SECURITY.md or dv842449@gmail.com. Never put passwords, access tokens, private messages or production database exports in a public issue.",
    href: repository + "/blob/main/SECURITY.md",
    label: "Security reporting",
  },
  {
    id: "backups",
    category: categories[3],
    question: "Can I rely on Devdevian as my only backup?",
    answer:
      "Keep your own copy of important work. The project provides backup, recovery and restore-check tooling, but service availability and backup operation depend on deployment configuration. This is an early release, without an independent security audit.",
    href: repository + "/blob/main/docs/reliability.md",
    label: "Recovery and operating limits",
  },
];
