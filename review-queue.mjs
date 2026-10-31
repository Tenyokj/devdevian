// The authenticated ID comes from the server session, never a query parameter.
// Keep the predicate identical for pagination and the selected discussion target.
export function awaitingReviewSQL(userId) {
  if (!Number.isSafeInteger(userId) || userId < 1)
    throw Error("Invalid account");
  return `c.post_id=p.id AND c.deleted_at IS NULL AND c.resolved=0
    AND (p.user_id=${userId} OR c.user_id=${userId} OR EXISTS(
      SELECT 1 FROM code_review_replies mine WHERE mine.review_id=c.id AND mine.user_id=${userId} AND mine.deleted_at IS NULL))
    AND COALESCE((SELECT last.user_id FROM code_review_replies last
      WHERE last.review_id=c.id AND last.deleted_at IS NULL ORDER BY last.id DESC LIMIT 1),c.user_id)<>${userId}`;
}
