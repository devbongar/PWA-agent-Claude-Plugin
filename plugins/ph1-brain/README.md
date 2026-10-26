# ph1-brain (Ph1 Brain)

A company-wide second brain for Claude, in two folders:

- `raw/` - drop anything here (notes, PDFs, screenshots, briefs, transcripts). Never changed by Claude.
- `wiki/` - a linked Markdown wiki the **librarian** agent builds and maintains: a summary per source, pages for clients, projects, topics, decisions and people, an index and a log.

## The three rules

1. **Never touch raw/** - enforced: edits, moves, renames and deletes inside raw/ are blocked.
2. **Build summaries + links in wiki/** - every fact links back to its source.
3. **Never make you organize** - you just drop files; the librarian files everything.

## What happens automatically

- First run creates the brain folder (default `~/Videos/ph1-brain`; change it in `/config` under ph1-brain).
- New files in raw/ are ingested in the background at session start and every 5 minutes.
- A short marked "Ph1 second brain" section is kept in your personal `~/.claude/CLAUDE.md`, so every session is told where the brain is (turn off in `/config`), and reads the wiki when a request touches clients, projects or past decisions.
- `/ph1-pwa-kit:new-feature` reads the brain before planning and updates the project's wiki page when done.

## Commands

- `/ph1-brain:status` - where the brain is and what's waiting
- `/ph1-brain:ingest` - process new raw files now
- `/ph1-brain:ask <question>` - answer from the wiki, with sources
- `/ph1-brain:lint` - health check: contradictions, broken links, gaps

Works in VS Code and the Claude desktop app's Code tab. Browse the wiki in any Markdown viewer; Obsidian shows the links as a graph.
