---
name: new-feature
description: Builds a new PWA feature end to end using the project's agents - plan, build, review and QA together, one fix round, summary. Picks the quick track for small changes and the full team for risky ones.
argument-hint: [describe the feature]
disable-model-invocation: true
---
Build this new feature: $ARGUMENTS

If the description above is empty or too vague to plan from, ask me what the feature should do, who uses it, and how it should work on mobile and desktop before starting.

You are the project lead. Plan and coordinate; delegate the building, testing and reviewing to the agents below. They come from the ph1-pwa-kit plugin, so their full names are `ph1-pwa-kit:frontend-developer`, `ph1-pwa-kit:backend-developer`, `ph1-pwa-kit:qa-engineer`, `ph1-pwa-kit:code-reviewer` and `ph1-pwa-kit:ui-reviewer`. If a project defines its own agent with the same short name, use the project's version.

**Your job is the seams and the decisions,** not redoing the agents' work. You are the only one who sees across agents: check that their pieces fit together, re-check their claims, and decide. Don't run extra verification passes over something already proven.

## 0. Pick the track (speed)

Decide first, and tell me which track and why in one line. I can override ("full", "quick").

- **Quick track** - small, low-risk changes: UI tweaks, copy, styling, a small component, a contained bug fix, a change to one or two files. **Follow `/ph1-pwa-kit:quick-change` instead of the steps below** (you build it yourself, then one combined review and QA).
- **Full track** - anything touching the **database or migrations, auth, permissions, grants or row-level security, payments, sync/offline data, or more than a few files**, or a new screen plus new API. Use the steps below.

When in doubt, choose full. If a quick change turns out to touch anything on the full-track list, stop and switch to full.

## How to brief an agent

The brief is everything. "Review this" gets opinions; "here is what already broke, attack these four things" gets bugs. Every brief to an agent includes:

1. **Scope:** the exact files or area (small: one file or a few related ones).
2. **What already failed:** earlier bugs, stalls or incidents in this build, and relevant lessons from the second brain. One sentence about a past failure changes an agent's behaviour more than anything else, for example: "A previous agent stalled mid-mutation and left `REVOKE SELECT` in a migration that nearly reached git."
3. **What to attack:** specific claims to try to break, for example "treat the developer's tests as claims, not coverage" or "attack the guard test first".
4. **Disprove your own work:** ask it to show its work fails where it should (new tests run against the pre-change code must fail).
5. **Report back:** besides findings, ask for **what you assumed but couldn't verify** (this finds more problems than asking what it found) and **anything you did beyond the brief**. Keep reports short.
6. **For UI work (frontend-developer, ui-reviewer):** concrete values and an existing component to copy (exact colours, widths, the screen to match), plus the app-ui-craft step: the rules that apply before coding, the **pre-delivery checklist** answered in the report, and **which skill rule changed a decision**. A report without the checklist is incomplete: send it back.
7. **Only what applies:** tell each agent what to skip (see "Skip what doesn't apply" below), so it doesn't spend time on checks that can't matter here.

## Models (speed)

The agents' default models are set for the full track. For **small or low-risk parts**, start the agent with `model: sonnet` to save time: for example, code-reviewer on a change of a few files with no security, data or permission impact, or backend-developer on a simple endpoint. Keep the default (opus) for migrations, auth, permissions and anything security-related.

## 1. Plan

- Read the relevant parts of the codebase so the plan fits the existing structure.
- **Check the second brain** (if the ph1-brain plugin is installed: your CLAUDE.md has a "Ph1 second brain" section with its path): read its `wiki/index.md`, then the pages for this project and client and any related decisions or topics. Use past decisions, requirements and lessons in the plan, and list the wiki pages you used.
- Show me:
  - What the feature does, as a list of **acceptance criteria**
  - Frontend work: screens and components, how they look on mobile and desktop, offline behaviour
  - Design direction (for UI work): which existing design system and components to follow, or - for new looks or landing pages - a short proposed direction (colours, typography, layout, motion). This is the design approval the frontend developer relies on.
  - Backend work: endpoints, database changes
  - The **API contract**: each endpoint's method, path, request and response shape, and error cases
  - Files to create or change, and any open questions
  - **Which checks apply** (UI review, mutation testing, live probes) and which are skipped and why
- **Test account for live browser testing.** If `.env.test.local` already has `E2E_EMAIL` and `E2E_PASSWORD` (check they're set without printing them), live testing is on: don't ask. Otherwise, in the same message as the plan, ask:
  > For live browser testing with Playwright, is there a test account? If yes, put its login in `.env.test.local` at the project root as `E2E_EMAIL=...` and `E2E_PASSWORD=...` (plus `E2E_BASE_URL=...` if the app isn't on the usual local dev URL), and make sure that file is git-ignored. If not, reply "no test account" and live browser testing will be skipped.
  - Never ask me to paste a password into the chat, and never print, log or commit the credentials. If I paste one anyway, put it in `.env.test.local` for me, add the file to `.gitignore`, and don't repeat it.
  - Never use a real customer or admin account. If I offer one, say it should be a dedicated test account.
  - **Settle the test-login strategy now, not mid-build.** If there's no test account, offer concrete ways to get one (for example, a seeded test user in the local or staging database, or a sign-up flow QA can use).
- **Stop and wait for my OK on the plan (and my answer about the test account) before writing code.**

**Live testing decision** (carry it through to step 3):

- **Test account available**: tell ui-reviewer and qa-engineer that live browser testing is **on** and that they read the login from `.env.test.local`.
- **No test account, or no answer**: live browser testing is **off**. Tell ui-reviewer and qa-engineer not to use the Playwright browser tools or run end-to-end tests that need a login. Everything else still runs. List the skipped live checks as manual checks in the summary.

## 2. Build

- Give each developer the approved plan, the acceptance criteria and the API contract.
- **No agent reads files another agent is writing.** Separate file ownership isn't enough: an agent that reads half-edited files reports bugs that are already fixed. **Default to running them one after the other** (usually backend first, then frontend against the finished API). Parallel agents on coupled work produce seam bugs each author can't see. Run them in parallel only for truly independent work, where neither reads the other's files and the pieces don't touch. If the feature is frontend-only or backend-only, use just that one.
- When both finish, check the seams yourself: frontend and backend match the API contract, and every assumption an agent listed as unverified is checked against the other side (for example, a frontend hint about database behaviour). Resolve any mismatch before continuing.
- **Review the extras.** Agents sometimes do more than asked (an unrequested index, a deleted function). Keep what's right, but list each extra so the reviewers check it too: an unrequested index is still a schema change.

**Agent rules for every step:**

- **A mutation harness works on a copy, never on the repo file:** restore in a `finally`, and prove the repo is untouched with checksums (for example, md5 before and after) and `git diff`. A stall mid-mutation is worse than no run at all. After any agent that ran such a script, check `git diff` yourself before continuing.
- **Small briefs.** Give each agent one area, ideally one file or a few closely related files.
- **Stalls and crashes** (including rate-limit deaths): if an agent makes no progress for about 10 minutes, stop it, check `git diff` for damage it left, and retry with a narrower scope. Tell the retry what happened to the previous run.
- **Write any file containing a regex or backslashes with the Write or Edit tool**, never shell heredocs or `echo`.
- **Disagreement is the value.** When an agent pushes back on the plan with reasons, weigh it seriously and tell me; don't overrule it silently.

## 3. Review and QA, together

Once **every developer agent has finished** (nobody is editing app code any more), run these **in parallel, in one go**:

- **code-reviewer** on all changes from this feature
- **ui-reviewer**, only if something visual changed (skip it for backend-only or non-visual changes)
- **qa-engineer** (mandatory), with the acceptance criteria, whether live testing is on or off, known blockers and what already failed. Tell it to treat the developers' tests as claims, not coverage. QA writes test files only; it never edits app code, so it can safely run beside the reviewers.

Brief them with what changed, any extras the developers added, and what already went wrong in this build. Tell ui-reviewer and qa-engineer whether live browser testing is on or off.

**Never act on a finding without re-checking it against the current file**: agents are confidently wrong about stale state. Combine all findings into one list ranked by priority, removing duplicates.

**Skip what doesn't apply** (say what you skipped in the summary):

- **UI review**: only when something visual changed.
- **Mutation testing**: only when the change adds or changes rules - SQL grants, row-level security, permission checks, validation. Not for UI, copy or plain logic.
- **Live probes**: only for access, permissions and data rules. For a UI change, live browser checks (when on) are enough.
- **Offline and PWA checks**: only when the change touches caching, the service worker, offline data or the manifest.
- **Stop verifying once stronger evidence exists.** If something is applied and verified live, don't spend more rounds polishing a text assertion about it.

## 4. Fix (one round)

- Send **Must fix** items (bugs, security, failed acceptance criteria) to the developer agent who owns that code. Fix them in one batch per developer.
- Then **one re-check**, in parallel: qa-engineer re-tests the fixes and their acceptance criteria only (the ship gate needs QA after the last change), and code-reviewer re-checks only the fixed items, if any were security or logic fixes.
- If something still fails after that re-check, **stop and tell me** what's still failing rather than starting another round.
- **Should fix** and **Suggestion** items are not fixed automatically: list them for me in the summary, and I'll pick.
- If you disagree with a finding, explain why instead of fixing it.
- Do not commit, push or open a PR before QA has run, unless I explicitly say to.

## 5. Summary

First **update the second brain** (see below), then finish with a short summary. Throughout the build, relay agent reports as decisions and facts, not transcripts.

- Track used (quick or full)
- What was built (files created/changed, endpoints, migrations to run, new environment variables)
- Must-fix findings and what was fixed
- QA results: **confirm qa-engineer ran**, acceptance criteria pass/fail and how each was proven, tests written and their results
- Whether live browser testing ran or was skipped
- Checks skipped as not applicable
- What QA could not cover and why, as a checklist of manual checks for me
- **Should fix and Suggestion items**, for me to choose from
- Which second-brain pages were updated (if a brain is set up)
- Anything left open or needing my decision

**Updating the second brain** (if the ph1-brain plugin is installed: your CLAUDE.md has a "Ph1 second brain" section with its path): create or update the project's page in its `wiki/projects/` folder with what was built, key decisions and why, the acceptance criteria result, lessons learned, and the PR or branch. Link related client, decision and topic pages, add a decision page for any decision that matters later, and add one line to `wiki/log.md`. Never write to its `raw/` folder.

Do not commit or push unless I ask.

## Ship gate (enforced)

Using this workflow turns on the ship gate for the session. `git commit`, `git push`, `git merge` and `gh pr create/merge` are **blocked** until code-reviewer has reviewed the feature and qa-engineer has tested the latest code changes. This includes small follow-up changes from my live feedback: after any round of changes, run review and QA before shipping. If a command is blocked, run the missing agents. Don't try to get around the gate, and never skip it on your own; only I can, by typing `/ph1-pwa-kit:ship-gate skip`.
