// Explicit additive schema migration, outside the request execution time limit.
// Do not load production credentials implicitly: the operator selects the env.
process.env.VERCEL = "1";
process.env.DEVDEVIAN_EXPLICIT_ENV = "1";
try {
  const actions = new Set([
    "--prepare-contributions",
    "--prepare-rooms",
    "--prepare-review-flow",
    "--prepare-workspaces",
    "--prepare-cli",
    "--prepare-feedback",
    "--prepare-code-reviews",
    "--prepare-subscriptions",
  ]);
  const args = process.argv.slice(2);
  if (args.length > 1 || args.some((arg) => !actions.has(arg)))
    throw Error(
      "Use no argument to finalize, or one supported --prepare-* action. No migration was run.",
    );
  if (process.argv.includes("--prepare-contributions")) {
    const { openDatabase } = await import("../database.mjs");
    const { prepareContributions } = await import("../contributions.mjs");
    const db = await openDatabase();
    try {
      if (
        db.prepare("SELECT version FROM app_schema WHERE id=1").get()
          ?.version !== 7
      )
        throw Error("Contributions requires schema v7.");
      prepareContributions(db);
    } finally {
      db.close();
    }
    console.log("Contributions prepared; global schema preserved.");
  } else if (process.argv.includes("--prepare-rooms")) {
    const { openDatabase } = await import("../database.mjs");
    const { prepareRooms } = await import("../rooms.mjs");
    const db = await openDatabase();
    try {
      if (
        db.prepare("SELECT version FROM app_schema WHERE id=1").get()
          ?.version !== 7
      )
        throw Error("Prepare Rooms requires schema v7.");
      prepareRooms(db);
    } finally {
      db.close();
    }
    console.log("Rooms prepared; global schema preserved.");
  } else if (process.argv.includes("--prepare-review-flow")) {
    const { openDatabase } = await import("../database.mjs");
    const { prepareReviewFlow } = await import("../review-flow.mjs");
    const db = await openDatabase();
    try {
      if (
        db.prepare("SELECT version FROM app_schema WHERE id=1").get()
          ?.version !== 7
      )
        throw Error("Prepare Review Flow requires schema v7.");
      prepareReviewFlow(db);
    } finally {
      db.close();
    }
    console.log("Review Flow prepared; active schema marker preserved.");
  } else if (process.argv.includes("--prepare-workspaces")) {
    const { openDatabase } = await import("../database.mjs");
    const { prepareWorkspaces } = await import("../review-revisions.mjs");
    const db = await openDatabase();
    try {
      if (
        ![6, 7].includes(
          db.prepare("SELECT version FROM app_schema WHERE id=1").get()
            ?.version,
        )
      )
        throw Error("Prepare workspaces requires schema v6 or v7.");
      prepareWorkspaces(db);
    } finally {
      db.close();
    }
    console.log(
      "Workspace tables and retained review snapshots prepared; active schema marker preserved.",
    );
  } else if (process.argv.includes("--prepare-cli")) {
    const { openDatabase } = await import("../database.mjs");
    const { prepareCli } = await import("../cli-auth.mjs");
    const db = await openDatabase();
    try {
      if (
        ![5, 6].includes(
          db.prepare("SELECT version FROM app_schema WHERE id=1").get()
            ?.version,
        )
      )
        throw Error("Prepare CLI requires schema v5 or v6.");
      prepareCli(db);
    } finally {
      db.close();
    }
    console.log("CLI tables prepared; active schema marker preserved.");
  } else if (process.argv.includes("--prepare-feedback")) {
    const { openDatabase } = await import("../database.mjs");
    const { prepareFeedback } = await import("../feedback-discussion.mjs");
    const db = await openDatabase();
    try {
      if (
        ![4, 5].includes(
          db.prepare("SELECT version FROM app_schema WHERE id=1").get()
            ?.version,
        )
      )
        throw Error("Prepare feedback requires schema v4 or v5.");
      prepareFeedback(db);
    } finally {
      db.close();
    }
    console.log("Feedback prepared; active schema marker preserved.");
  } else if (process.argv.includes("--prepare-code-reviews")) {
    const { openDatabase } = await import("../database.mjs");
    const { prepareCodeReviews } = await import("../code-reviews.mjs");
    const db = await openDatabase();
    try {
      const version = db
        .prepare("SELECT version FROM app_schema WHERE id=1")
        .get()?.version;
      if (![3, 4].includes(version))
        throw Error("Prepare code reviews requires schema v3 or v4.");
      prepareCodeReviews(db);
    } finally {
      db.close();
    }
    console.log(
      "Code reviews prepared. Active release schema marker preserved.",
    );
  } else if (process.argv.includes("--prepare-subscriptions")) {
    const { openDatabase } = await import("../database.mjs");
    const { prepareSubscriptions } = await import("../subscriptions.mjs");
    const db = await openDatabase();
    try {
      const version = db
        .prepare("SELECT version FROM app_schema WHERE id=1")
        .get()?.version;
      if (![2, 3].includes(version))
        throw Error("Prepare subscriptions requires schema v2 or v3.");
      prepareSubscriptions(db);
    } finally {
      db.close();
    }
    console.log(
      "Subscriptions prepared. Existing schema marker preserved for the active release.",
    );
  } else {
    const { createApp } = await import("../server.mjs");
    await createApp({ migrationOnly: true });
    console.log("Database schema is current. No application data was reset.");
  }
} catch (error) {
  const { reportFailure } = await import("../observability.mjs");
  reportFailure(error, { event: "migration_failed" });
  process.exitCode = 1;
}
