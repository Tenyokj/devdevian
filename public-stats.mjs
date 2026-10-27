// Only public, non-removed conversations contribute. Private activity stays private.
export function registerPublicStats(app, db) {
  let cached = null,
    expires = 0;
  app.get("/api/public-stats", (req, res) => {
    if (!cached || Date.now() >= expires) {
      const row = db
        .prepare(
          "SELECT COUNT(*) conversations FROM posts WHERE community_id IS NULL AND removed_at IS NULL",
        )
        .get();
      cached = {
        conversations: Number(row.conversations),
        updated_at: new Date().toISOString(),
      };
      expires = Date.now() + 15000;
    }
    res
      .set(
        "Cache-Control",
        "public, max-age=0, s-maxage=15, stale-while-revalidate=30",
      )
      .json(cached);
  });
}
