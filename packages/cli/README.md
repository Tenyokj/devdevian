# Devdevian CLI · Alpha

An official terminal client for [Devdevian](https://devdevian.vercel.app), the open-source developer forum. Use the same account, discussions and community permissions as the web app. Requires **Node.js 24 or newer**.

```sh
npm install -g @tenyokjs/devdevian-cli@alpha
devdevian open     # a separate terminal window
# or: devdevian tui  (the current terminal)
```

Login opens a browser. Compare the code shown in the terminal, sign in to Devdevian, then authorize the terminal. Google, GitHub and email login happen on the website; no provider credentials are collected by this package. Use `--no-open` to open the printed address yourself, including when connecting over SSH.

## Live workspace

The default `devdevian` command and `devdevian tui` open an alternate terminal screen. Navigation, conversations, inline forms, previews and search update in that screen; exiting restores your normal terminal. The blue and purple layout adapts to the terminal size, with compact navigation below 90 columns. Minimum size: 60 columns × 18 rows.

- **Tab** switches between navigation, content and the command bar. **↑/↓** select; **Enter** opens; **Esc** goes back.
- **/** focuses search and commands: `/feed`, `/inbox`, `/search query`, `/open 142`, `/ask`, `/review`, `/drafts`, `/communities`, `/devices`, `/help`, `/logout`, `/quit`.
- **←/→** switch conversation tabs; **Space** reads the selected reply/remark in full. **[ / ]** paginate; **Page Up/Down** scroll.
- **N** creates a conversation (a community on the Communities screen); **A** asks a question; **R** replies inside a conversation; **Shift+R** refreshes.
- **C** comments on snippet lines; **E/D** edit/delete your own ordinary replies or code feedback; **S** resolves/reopens a code remark as the publication author; **!** reports selected code feedback.
- In forms, **Tab/Shift+Tab** change fields, arrows choose options or move the text cursor, **Enter** adds a line, **Ctrl+S** opens the preview. Publication requires a separate confirmation; Escape asks before discarding a draft. Drafts auto-save locally after a short pause and can be restored from **Local drafts** or `/drafts`.
- **Ctrl+C** exits. With an unsent draft, confirm saving and leaving or press Ctrl+C again to force exit.

`devdevian open` launches Terminal on macOS, Windows Terminal on Windows, or GNOME Terminal/Konsole/xterm on a Linux desktop. A graphical desktop and an installed supported terminal are required; over SSH and inside an editor, use `devdevian tui`. Window launchers still need platform-specific user testing; terminal rendering and input are covered by macOS/Linux pseudo-terminal checks.

Pages have a bounded 30-second in-memory cache. Refresh explicitly with Shift+R. Network errors stay inside the workspace; failed writes are never automatically retried. Existing web permissions and server validation apply to every operation.

Ordinary reply deletion replaces your text with a placeholder and preserves nested replies. Its attachments become unavailable. Deleting an accepted answer reopens the question. D/d works on a selected reply or while reading it in full; confirmation is required.

## Project files and Git changes

Start inside your project (`cd PROJECT1 && devdevian tui`) or use `devdevian tui --project /path/to/PROJECT1`. `devdevian open --project /path/to/PROJECT1` carries the same project into a new terminal window. The project root stays fixed for the session.

In a **Code review** form:

1. Press **Ctrl+O** to browse project files, or **Ctrl+G** to browse Git changes. These shortcuts work from any review field. Enter on an empty Code file field also opens the explorer.
2. **↑/↓** select entries; **Enter** opens a directory or previews a file; **←/Backspace** goes to the parent directory. **/** filters names in the current directory, **H** shows hidden files and **G** switches Files/Git changes. Wide terminals show the file list next to the preview; compact terminals use the available width for code.
3. In a file preview, use **↑/↓** or **Page Up/Down** to move. **Space** starts a line selection; move to extend it, or press Space again to reset. **←/→** scroll long lines horizontally. **Enter** uses the file/range; **Esc** returns to the list.
4. In Git changes, **T** switches **unstaged/staged**. The preview initially includes all hunks for one file; **[ / ]** choose the whole patch or an individual hunk. **Enter** uses that selection. Untracked files are selected through Files; binary diffs/submodules are excluded.
5. Fill in title, focus and context. **Ctrl+S** shows the exact code and audience to publish. Publication requires a separate confirmation.

The explorer excludes `.git`, dependency/build directories, symlinks, common environment/credential/key filenames and (inside Git repositories) ignored paths. No content scanner can identify every secret: inspect the publication preview before confirming. Git is required for changes and `.gitignore` detection; ordinary file selection also works without Git. Git reads disable external diff/textconv/fsmonitor helpers and never stage, commit, reset or execute project code.

File previews accept UTF-8 text up to **512 KiB**; a published snippet/patch is **10–20,000 characters**. Large files can be narrowed to a range and large patches to one hunk. Git patches appear as ordinary review snippets on the website; review line numbers count the **published patch including headers**, not the original source file. Source paths are relative to the project. If the selected patch changes before the publication preview, selection must be repeated. Publication uses the confirmed preview snapshot.

## Local drafts

Publication, reply, feedback, edit and community forms save locally after a **450 ms** pause. Explicit draft discard removes that draft; successful publication removes it too. `/drafts` lists saved drafts for the current **server, account and project directory**. Nothing is uploaded by autosave. Switching accounts or projects does not expose another scope's drafts.

Draft files live under the CLI credentials directory in `drafts/<scope>/`, with Unix file permissions `0600` and new directories `0700`. They contain your text and file/diff selection descriptors, **not copies of selected source files or patches**. They are local JSON files, not encrypted; protect your OS account and do not commit/share this directory. The history retains up to **20 drafts per scope for 30 days**. An abrupt termination may lose the most recent input before autosave; these drafts are not a backup service.

Restoring a review rereads the local source at the publication preview. Changed Git selections require reselection. A private audience that is no longer accessible is preserved as unavailable until you explicitly choose an available audience; it never silently becomes public.

## Everyday commands

```sh
devdevian whoami
devdevian inbox --page 1
devdevian feed --topic web
devdevian search "bounded retries"
devdevian conversation open 142
devdevian ask --title "How should I retry requests?" --body-file question.md --topic web
devdevian reply 142 --editor
devdevian review create --file src/retry.ts --lines 20:65 --title "Review my retry strategy" --focus "Timeouts, retries and idempotency" --editor
devdevian review list 142 --status open
devdevian review comment 142 --start-line 2 --end-line 4 --body "Handle the timeout here."
devdevian review thread 142 12
devdevian review reply 142 12 --body "Would a deadline address this?"
devdevian review resolve 142 12
devdevian review reopen 142 12
devdevian communities
devdevian logout
```

Commands are examples; replace IDs, file paths and topic IDs with your own. Run `devdevian --help` for flags. Selected file ranges are published as standalone snippets; subsequent review line numbers refer to that published snippet, beginning at 1.

A selected file is read only when explicitly named. Before publication, the client previews the payload and audience and asks for confirmation. Use `--community ID` for an approved private community, `--json` for machine-readable API output and `--yes` to explicitly publish without a prompt. Noninteractive publishing requires the relevant text flags and `--yes`. No repository discovery or background file collection runs.

`--editor` uses `$VISUAL`, then `$EDITOR`, then `vi` (`notepad` on Windows). The editor is launched without a shell. File, body and API limits also apply in the terminal. This client uses ordinary HTTPS API calls, not a direct database connection, and sends no background polling traffic when idle. Device login polls every five seconds for at most ten minutes.

## Connected devices and credentials

Access expires after 30 days. Revoke a terminal from **Settings → Connected terminals** or run `devdevian logout`. Password reset revokes CLI sessions alongside browser sessions. Terminal authorization requests approved before a password change cannot mint a new session afterwards.

The credential file is `~/.config/devdevian/credentials.json`, with mode `0600` and a new directory with mode `0700` on Unix. This alpha uses a local token file rather than an OS keychain. On Windows, protect your user profile with appropriate account permissions; Unix permission bits are not equivalent to Windows ACLs. Do not share or commit the credential file. Tokens are never printed by login, including with `--json`.

For local development use `devdevian login --host http://127.0.0.1:4173`. Remote origins require HTTPS. Credentials stay bound to the selected origin; a different `--host` cannot reuse them. HTTP redirects are rejected instead of forwarding credentials. `DEVDEVIAN_CONFIG_DIR` overrides the local credentials directory for isolated testing. `NO_COLOR=1` disables terminal accents.

## Alpha scope

This alpha covers login/logout, inbox, paginated feeds and search, discussions and replies, questions, code review creation, line feedback and feedback threads/status, and community discovery, creation and private publication. Profile/media editing, events administration and moderation remain available in the browser. There is no offline mode or automatic GitHub repository synchronization.

Source, contributions and issue reporting: [Tenyokj/devdevian](https://github.com/Tenyokj/devdevian). Report security issues through the repository's [security policy](https://github.com/Tenyokj/devdevian/blob/main/SECURITY.md), not a public issue containing private data. Licensed GPL-3.0-only.
