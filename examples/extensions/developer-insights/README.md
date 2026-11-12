# Developer Insights

A first-party example of a real code extension: install it, open a developer profile, and explore recorded work in a profile dashboard. Requires Browser/API **1.6.0+**. No external network or storage capability is requested.

## Try it

In **Extensions → Upload extension**, choose **Load Developer Insights example**, review the source and permissions, then **Preview in my app**. Open **Your corner**. Stop preview to return to the preserved publication draft. For a lasting installation, publish the package and install its exact version from its listing, acknowledging its review status.

Build from source:

```sh
npm ci
npm run extension:pack -- examples/extensions/developer-insights developer-insights.devext.json
```

CLI 0.24 supports packing and publishing this package. Its older standalone playground lacks profile panels/insights; use the current repository's `extension:dev` forum sandbox or browser preview instead.

## Metrics and boundaries

- Calendar, daily chart, action breakdown, active-day percentage and streaks use the selected **30/90/365 UTC days**, including today. Days without recorded actions are zero. A current streak may end today or yesterday; both streaks are bounded by this window.
- Summary cards, contribution states, topics, declared technologies and project attribution use **retained lifetime records**, not the chart window.
- An activity is a conversation, reply, code remark, feedback reply, formal review outcome, contribution submission, task-state change or retained decision revision. Ordinary post edits and reading do not add actions. Several actions can occur on the same day.
- Accepted solutions reflect currently accepted replies. Contribution percentages use all retained submissions, including pending/withdrawn ones. Neither measures developer quality.
- Project attribution comes from ownership or recorded work: authored tasks, discussion/review, assignments, contributions or decision/task updates. Permission to participate alone is not work. Eight projects are returned per page.
- Technologies are author-supplied stack labels, counted once per authored post. They are not inferred skills or GitHub-wide contributions.
- Other profiles always receive **public-only** metrics, even for viewers sharing a private community. Only your own profile offers an explicit private-inclusive switch. It uses current access and resets when changing profiles.
- Personal saved/following/event RSVP/installed-extension counters appear only in your own private-inclusive view. Saved counts exclude removed/inaccessible posts; followed counts describe saved preferences.
- Hidden/deleted profiles stay unavailable to other viewers. Removed content, deleted replies/feedback and inaccessible project records are excluded. Deleted history cannot be reconstructed. This is a snapshot, not a permanent historical archive.

No reading time, visits, online hours or unrecorded actions are estimated. Data is refreshed on profile/filter changes or request, with no background polling.

## SDK integration

The extension uses `context().profile`, `onContext(callback)` and `panel.configure({placement:'profile',height:...})`. The host supplies a profile anchor only when that profile is actually rendered. `data.read` allows the bounded `/users/:id/insights` endpoint; server ACLs apply independently of extension code. `ui.navigate` opens project workspaces; `ui.commands` registers **Open my insights** (Alt+Shift+I).

All account/project/topic text is escaped before rendering. Charts use inline SVG, a daily table provides chart data, reduced motion is respected and light/dark modes follow the host. Source and bundle are inspectable; this example does not automatically receive an owner-reviewed badge.
