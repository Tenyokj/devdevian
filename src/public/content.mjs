// Public, curated release notes. npm milestones are independent of GitHub releases;
// only describe shipped behavior here, and keep planned work out of this timeline.
export const repository = "https://github.com/Tenyokj/devdevian";
export const updates = [
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
      "Select complete diff hunks or a contiguous range of changed lines.",
      "Commit checks catch outdated selections before publishing. Nothing is written back to GitHub.",
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
      "Yes, for supported public PRs. Open the PR, select a file and complete hunks or a contiguous changed-line range, then preview and publish a Devdevian code review. Commit checks catch stale selections. This creates a conversation in Devdevian; it does not post a review or modify code on GitHub.",
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
