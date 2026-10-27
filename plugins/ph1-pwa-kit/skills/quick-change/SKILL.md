---
name: quick-change
description: Fast track for small, low-risk PWA changes - UI tweaks, copy, styling, a small component or a contained bug fix. You build it, then code review and QA run together, one fix round.
argument-hint: [describe the change]
disable-model-invocation: true
---
Make this change: $ARGUMENTS

This is the **quick track**: small, low-risk changes only. You (the lead) make the change yourself instead of starting developer agents, then code review and QA run together.

## 0. Check it really is quick

It is **not** quick if it touches the **database or migrations, auth, permissions, grants or row-level security, payments, sync/offline data**, or more than a few files, or needs a new API. If it does, say so in one line and switch to `/ph1-pwa-kit:new-feature` (full track). If it starts quick and turns out to touch any of these, stop and switch.

## 1. Short plan (no waiting)

In 2 to 4 lines, tell me: what you'll change, which files, and 1 to 3 acceptance criteria. Then go ahead without waiting for my OK, unless something is unclear or there's a real design choice to make (then ask one short question).

- Live testing: on if `.env.test.local` has `E2E_EMAIL` and `E2E_PASSWORD` (check they're set without printing them); otherwise off. Don't ask for a test account on this track.
- If the second brain is set up and the change relates to a client or project decision, check its wiki page quickly.

## 2. Build it yourself

- Make the change directly. Match the existing code and components.
- For UI work, follow `ph1-pwa-kit:app-ui-craft`: name the rules that apply (by ID) before you edit, and answer its pre-delivery checklist before review. Keep the iPhone status-bar rules for screens.
- Write files containing regexes or backslashes with the Write or Edit tool, not shell heredocs.

## 3. Review and QA together (one go, in parallel)

When your edits are done, start these at the same time:

- **code-reviewer** with `model: sonnet` (small change), briefed with the files changed, what the change should do, and anything you're unsure about. Use the default model if anything touches security.
- **qa-engineer** with the acceptance criteria and whether live testing is on. Scope: the change only. No mutation testing and no offline checks unless the change touches rules or caching. Ask it to show its new tests fail against the old code.

Skip ui-reviewer: on this track, code-reviewer covers the code and QA checks the screens live (when on) at phone, tablet and desktop sizes. If the change is mostly visual and live testing is off, add **ui-reviewer** (with `model: sonnet`) to the same parallel batch instead.

Re-check every finding against the current file before acting on it.

## 4. One fix round

- Fix **Must fix** items yourself, in one batch.
- Re-run **qa-engineer** once on the fixes (the ship gate needs QA after the last change). Add code-reviewer to that re-run only if a fix was a logic or security change.
- Still failing after that? Stop and tell me.
- Should fix and Suggestion items: list them for me; don't fix them unasked.

## 5. Summary (short)

- What changed (files)
- Review: must-fix items and what was fixed
- QA: acceptance criteria pass/fail and how proven; live testing ran or skipped
- Should fix / Suggestion items for me to choose
- Manual checks, if any

If the second brain is set up and the change matters later (a decision, a client request), add a line to the project's wiki page and to `wiki/log.md`. Never write to `raw/`.

Do not commit or push unless I ask. The ship gate is on: commits, pushes and PRs are blocked until code-reviewer and qa-engineer have run on the latest changes. Only I can skip it, with `/ph1-pwa-kit:ship-gate skip`.
