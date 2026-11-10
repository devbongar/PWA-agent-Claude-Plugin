---
name: catch-up
description: Record shipped work the brain missed - lists this project's merged PRs since its wiki page was last updated and writes one short entry for them. Cheap - reads PR titles and descriptions, not code.
argument-hint: [optional: since when, e.g. "2026-11-01" or "last week"]
disable-model-invocation: true
---
Bring this project's page in the second brain up to date with the work shipped since it was last updated. $ARGUMENTS

The brain is at `${user_config.brain_path}` (`~` is the user's home folder; your CLAUDE.md's "Ph1 second brain" section has the full path). Never write to its `raw/` folder.

Keep it cheap: work from PR titles, descriptions and commit messages. **Don't read the code.**

## 1. Find the page and the starting point

- The project name is the git repository's folder name (lower-case, dashes for spaces). Its page is `wiki/projects/<name>.md`. If it doesn't exist, look in `wiki/index.md` for a page about this project under another name; otherwise create it with a short heading and a one-line description from the README.
- The starting point is the date I gave, or else the newest date or PR number already on the page, or else the last 30 days.

## 2. List what shipped (one or two commands)

- With the GitHub CLI: `gh pr list --state merged --search "merged:>=YYYY-MM-DD" --json number,title,mergedAt,headRefName,body --limit 50`. Skip PRs already on the page.
- Also note open PRs: `gh pr list --state open --json number,title,headRefName --limit 20`.
- Without `gh` (or not signed in): `git log --first-parent --since=YYYY-MM-DD --format="%h %ad %s" --date=short` on the main branch.

Use only the first few lines of each PR description.

## 3. Write it

- On the project page, under a `## Changes` heading (create it if missing, newest first), add **one dated entry** for this catch-up: group related PRs ("Gantt chart: planned bar thinner, year above months (#86, #87)"), one line per group, with PR numbers. Mention open PRs or branches as "in progress".
- Note a **decision** only if a PR description states one, with its reason; if it matters later, also add a page under `wiki/decisions/` and link it.
- Link related pages that already exist (client, topics), Obsidian style: `[[clients/acme]]`.
- Add one line to `wiki/log.md`: `- YYYY-MM-DD catch-up <project>: N PRs (#a-#b)`.

## 4. Tell me

In two or three lines: how many PRs were recorded, the page updated, and anything you couldn't tell from the PR text.
