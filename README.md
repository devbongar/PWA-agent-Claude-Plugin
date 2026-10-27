# Ph1world Claude Code Plugins

Internal Claude Code plugins for Ph1world Design and Construction.

## ph1-pwa-kit

A development team for building PWAs (web apps with mobile versions) with Claude Code.

| Agent | Role | Model |
|---|---|---|
| `frontend-developer` | Screens, components, styling, PWA features (manifest, offline, caching, sync, push, updates), edge-to-edge iPhone status bar | sonnet |
| `backend-developer` | APIs, database, auth, validation, offline-sync support | opus |
| `qa-engineer` | Tests against acceptance criteria on phone, tablet and desktop, plus offline and edge cases; reports bugs | sonnet |
| `code-reviewer` | Logic, security, code quality | opus |
| `ui-reviewer` | Mobile, tablet and desktop UI review | sonnet |

Command: `/ph1-pwa-kit:new-feature <describe the feature>` - plan (waits for approval), build frontend and backend in parallel, review, fix, QA, summary.

**Ship gate:** once `/ph1-pwa-kit:new-feature` runs in a session, commits, pushes, merges and PRs are blocked until `code-reviewer` has reviewed the feature and `qa-engineer` has tested the latest code changes. `/ph1-pwa-kit:ship-gate` shows the status; only you can run `/ph1-pwa-kit:ship-gate skip` (until the next code change) or `/ph1-pwa-kit:ship-gate off`.

### Bundled design skills

| Skill | Used by | When |
|---|---|---|
| `app-ui-craft` | frontend-developer, ui-reviewer | Always (preloaded). Short rule-numbered app UI standard; agents name the rules that apply before coding, answer its pre-delivery checklist and say which rule changed a decision |
| `apple-design` | frontend-developer, ui-reviewer | Loaded only for gestures, drag, sheets, springs or depth |
| `web-design-engineer` | frontend-developer, ui-reviewer | Loaded only for standalone mockups or prototypes, or a design critique |
| `landing-page-design` | frontend-developer, ui-reviewer | Landing pages and marketing sites only |

They appear as `/ph1-pwa-kit:apple-design` and so on. `apple-design`, `web-design-engineer` and `landing-page-design` are MIT-licensed third-party skills; `app-ui-craft` is distilled from the first two - see `plugins/ph1-pwa-kit/THIRD_PARTY_NOTICES.md` for sources and the small changes made.

If the same skills are also installed in your personal skills folder, both copies load. Remove the personal copies to avoid duplicates.

### Optional: Playwright plugin

If the **Playwright** plugin is installed, `ui-reviewer` takes real screenshots at phone, tablet and desktop sizes, and `qa-engineer` clicks through features in a real browser. Without it, both agents still work from the code and automated tests.

## ph1-office

A live pixel-art office pane. Each agent walks from the lounge to its desk when it starts working, shows what it's doing in a speech bubble, and walks back when it's done. Reopen it with `/ph1-office:open`. With ph1-brain installed, the brain (Library / Knowledge map) shows beneath the office. Needs Claude Code 2.1.299 or later.

One-click install in VS Code:

```
vscode://anthropic.claude-code/install-plugin?plugin=ph1-office&marketplace=devbongar/PWA-agent-Claude-Plugin
```

## ph1-brain

A company-wide second brain: drop anything into `raw/`, and a librarian agent builds a linked wiki in `wiki/` that every Claude session (and `/ph1-pwa-kit:new-feature`) uses. raw/ is protected from changes. `/ph1-brain:view` opens the Brain pane: a pixel-art Library and a Knowledge map, with a switch between them. See `plugins/ph1-brain/README.md`.

One-click install in VS Code:

```
vscode://anthropic.claude-code/install-plugin?plugin=ph1-brain&marketplace=devbongar/PWA-agent-Claude-Plugin
```

## Install

```bash
claude plugin marketplace add devbongar/PWA-agent-Claude-Plugin
claude plugin install ph1-pwa-kit@ph1world-plugins
```

Or inside Claude Code: `/plugin marketplace add devbongar/PWA-agent-Claude-Plugin`, then install from the `/plugin` menu.

For a private GitHub repo, each person needs access to the repo (signed in with `gh auth login` or git credentials).

## Update

1. Edit files under `plugins/ph1-pwa-kit/`.
2. Bump `version` in `plugins/ph1-pwa-kit/.claude-plugin/plugin.json`.
3. Run `claude plugin validate .` and push.
4. Team members update the marketplace and plugin from the `/plugin` menu.

## Use

- `/ph1-pwa-kit:new-feature Site Reports page with offline photos`
- "Run code-reviewer and ui-reviewer in parallel on my changes."
- `/agents` lists the agents; plugin agents appear as `ph1-pwa-kit:<name>`.

A project can override any agent by adding its own file with the same name in `.claude/agents/`.
