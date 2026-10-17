# Landing screenshots

Add real application screenshots here, then set their paths in `src/landing-media.json`.

| Key | Suggested file | Capture |
| --- | --- | --- |
| `feed` | `/landing/feed.webp` | Public feed, with 3–4 realistic posts and visible topic/type controls |
| `conversation` | `/landing/conversation.webp` | A code-review conversation with a short snippet, a useful reply, and an accepted answer |
| `community` | `/landing/community.webp` | A community header, its logo/banner, topic controls, and a few conversations |
| `project` | `/landing/project.webp` | A project with screenshots, team, and its feedback entry point |

Use dark theme, 100% browser zoom, and a viewport around 1440×900. Capture only the page content, without browser chrome, personal data, open menus, toasts, or unrelated windows. PNG or WebP at 1440–1920 px wide works well. Prefer a consistent aspect ratio around 16:10; images retain their natural proportions.

Example configuration:

```json
{
  "feed": "/landing/feed.webp",
  "conversation": "/landing/conversation.webp",
  "community": "/landing/community.webp",
  "project": "/landing/project.webp"
}
```

Keep a value `null` to retain its labeled placeholder. No screenshot is fabricated or presented as a real product capture. Images are rendered directly with a soft glow, without a browser frame or heavy border. Rebuild after adding images or changing configuration.
