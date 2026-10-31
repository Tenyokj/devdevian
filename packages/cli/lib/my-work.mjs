// Reuse the account-scoped post API; no aggregate scans or new permissions.
export const workTabs = [
  ["mine", "Mine"],
  ["reviews", "Reviews"],
  ["saved", "Saved"],
  ["following", "Following"],
];
export function workQuery(section = "mine", page = 1) {
  if (!workTabs.some(([id]) => id === section))
    throw Error("Choose a My work section: mine, reviews, saved or following.");
  if (!Number.isSafeInteger(page) || page < 1)
    throw Error("Choose a positive page number.");
  const filters = {
    mine: "author=me",
    reviews: "author=me&kind=review",
    saved: "saved=1",
    following: "following=1",
  };
  return `/posts?limit=12&page=${page}&${filters[section]}`;
}
