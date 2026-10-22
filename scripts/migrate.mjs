// Explicit additive schema migration, outside the request execution time limit.
// Do not load production credentials implicitly: the operator selects the env.
process.env.VERCEL = "1";
const { createApp } = await import("../server.mjs");
try {
  await createApp({ migrationOnly: true });
  console.log("Database schema is current. No application data was reset.");
} catch (error) {
  const { reportFailure } = await import("../observability.mjs");
  reportFailure(error, { event: "migration_failed" });
  process.exitCode = 1;
}
