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

### Bundled design skills

| Skill | Used by | When |
|---|---|---|
| `apple-design` | frontend-developer, ui-reviewer | Always (preloaded) |
| `web-design-engineer` | frontend-developer, ui-reviewer | Always (preloaded); full prototype workflow only for mockups |
| `landing-page-design` | frontend-developer, ui-reviewer | Landing pages and marketing sites only |

They appear as `/ph1-pwa-kit:apple-design` and so on. All three are MIT-licensed third-party skills - see `plugins/ph1-pwa-kit/THIRD_PARTY_NOTICES.md` for sources and the small changes made.

If the same skills are also installed in your personal skills folder, both copies load. Remove the personal copies to avoid duplicates.

### Optional: Playwright plugin

If the **Playwright** plugin is installed, `ui-reviewer` takes real screenshots at phone, tablet and desktop sizes, and `qa-engineer` clicks through features in a real browser. Without it, both agents still work from the code and automated tests.

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
