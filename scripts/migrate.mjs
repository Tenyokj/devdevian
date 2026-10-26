// Explicit additive schema migration, outside the request execution time limit.
// Do not load production credentials implicitly: the operator selects the env.
process.env.VERCEL = "1";
const { createApp } = await import("../server.mjs");
try {
  if (process.argv.includes("--prepare-cli")) {
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
    await createApp({ migrationOnly: true });
    console.log("Database schema is current. No application data was reset.");
  }
} catch (error) {
  const { reportFailure } = await import("../observability.mjs");
  reportFailure(error, { event: "migration_failed" });
  process.exitCode = 1;
}
