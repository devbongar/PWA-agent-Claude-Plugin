---
name: new-feature
description: Builds a new PWA feature end to end using the project's agents - plan, build (frontend and backend), parallel review, fix, QA and summary.
argument-hint: [describe the feature]
disable-model-invocation: true
---
Build this new feature: $ARGUMENTS

If the description above is empty or too vague to plan from, ask me what the feature should do, who uses it, and how it should work on mobile and desktop before starting.

You are the project lead. Plan and coordinate; delegate the building, testing and reviewing to the agents below. They come from the ph1-pwa-kit plugin, so their full names are `ph1-pwa-kit:frontend-developer`, `ph1-pwa-kit:backend-developer`, `ph1-pwa-kit:qa-engineer`, `ph1-pwa-kit:code-reviewer` and `ph1-pwa-kit:ui-reviewer`. If a project defines its own agent with the same short name, use the project's version.

**Your job is the seams and the decisions,** not redoing the agents' work. You are the only one who sees across agents: check that their pieces fit together, re-check their claims, and decide. Don't run extra verification passes over something already proven.

## How to brief an agent

The brief is everything. "Review this" gets opinions; "here is what already broke, attack these four things" gets bugs. Every brief to an agent includes:

1. **Scope:** the exact files or area (small: one file or a few related ones).
2. **What already failed:** earlier bugs, stalls or incidents in this build, and relevant lessons from the second brain. One sentence about a past failure changes an agent's behaviour more than anything else, for example: "A previous agent stalled mid-mutation and left `REVOKE SELECT` in a migration that nearly reached git."
3. **What to attack:** specific claims to try to break, for example "treat the developer's tests as claims, not coverage" or "attack the guard test first".
4. **Disprove your own work:** ask it to show its work fails where it should (new tests run against the pre-change code must fail).
5. **Report back:** besides findings, ask for **what you assumed but couldn't verify** (this finds more problems than asking what it found) and **anything you did beyond the brief**.
6. **For UI work (frontend-developer, ui-reviewer):** concrete values and an existing component to copy (exact colours, widths, the screen to match), plus the app-ui-craft step: the rules that apply before coding, the **pre-delivery checklist** answered in the report, and **which skill rule changed a decision**. A report without the checklist is incomplete: send it back.

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
- **Ask for a test account for live browser testing.** In the same message as the plan, ask:
  > For live browser testing with Playwright, is there a test account? If yes, put its login in `.env.test.local` at the project root as `E2E_EMAIL=...` and `E2E_PASSWORD=...` (plus `E2E_BASE_URL=...` if the app isn't on the usual local dev URL), and make sure that file is git-ignored. If not, reply "no test account" and live browser testing will be skipped.
  - Never ask me to paste a password into the chat, and never print, log or commit the credentials. If I paste one anyway, put it in `.env.test.local` for me, add the file to `.gitignore`, and don't repeat it.
  - Never use a real customer or admin account. If I offer one, say it should be a dedicated test account.
- **Settle the test-login strategy now, not mid-build.** If there's no test account, offer concrete ways to get one before building (for example, a seeded test user in the local or staging database, or a sign-up flow QA can use). Without live testing, too much ends up as text assertions that prove little.
- **Stop and wait for my OK on the plan (and my answer about the test account) before writing code.**

**Live testing decision** (carry it through to steps 3 and 5):

- **Test account provided**: check that `.env.test.local` has `E2E_EMAIL` and `E2E_PASSWORD` (check that they're set without printing them). Tell ui-reviewer and qa-engineer that live browser testing is **on** and that they read the login from `.env.test.local`.
- **No test account, or no answer**: live browser testing is **off**. Tell ui-reviewer and qa-engineer not to use the Playwright browser tools or run end-to-end tests that need a login. Everything else (unit, API and server tests, edge cases, code review) still runs. List the skipped live checks as manual checks in the summary.

## 2. Build

- Give each developer the approved plan, the acceptance criteria and the API contract.
- **No agent reads files another agent is writing.** Separate file ownership isn't enough: an agent that reads half-edited files reports bugs that are already fixed. **Default to running them one after the other** (usually backend first, then frontend against the finished API). Parallel agents on coupled work produce seam bugs each author can't see; a serial pass is slower per step but faster overall. Run them in parallel only for truly independent work, where neither reads the other's files and the pieces don't touch. If the feature is frontend-only or backend-only, use just that one.
- When both finish, check the seams yourself: frontend and backend match the API contract, and every assumption an agent listed as unverified is checked against the other side (for example, a frontend hint about database behaviour). Resolve any mismatch before continuing.
- **Review the extras.** Agents sometimes do more than asked (an unrequested index, a deleted function). Keep what's right, but list each extra so the reviewers check it too: an unrequested index is still a schema change.

**Agent rules for every step:**

- **A mutation harness works on a copy, never on the repo file:** restore in a `finally`, and prove the repo is untouched with checksums (for example, md5 before and after) and `git diff`. A stall mid-mutation is worse than no run at all. After any agent that ran such a script, check `git diff` yourself before continuing.
- **Small briefs.** Give each agent one area, ideally one file or a few closely related files. Split a big review or QA job into several smaller runs instead of one big prompt.
- **Stalls and crashes** (including rate-limit deaths): if an agent makes no progress for about 10 minutes, stop it, check `git diff` for damage it left, and retry with a narrower scope. Tell the retry what happened to the previous run.
- **Write any file containing a regex or backslashes with the Write or Edit tool**, never shell heredocs or `echo`.
- **Disagreement is the value.** When an agent pushes back on the plan with reasons, weigh it seriously and tell me; don't overrule it silently. Invite it: ask agents to say if they think the plan is wrong.

## 3. Review

Start reviews only after every developer agent has finished, so reviewers never read files mid-edit. Run **code-reviewer** and **ui-reviewer** in parallel on all changes from this feature (skip ui-reviewer if there are no UI changes). For a large change, split the review into smaller runs by area. Brief the reviewers with what changed, any extras the developers added, and what already went wrong in this build. **Never act on a finding without re-checking it against the current file,** especially one from a parallel agent: agents are confidently wrong about stale state. Tell ui-reviewer whether live browser testing is on or off. Combine their findings into one list ranked by priority, removing duplicates.

## 4. Fix

- Send **Must fix** items to the developer agent who owns that code (frontend-developer or backend-developer).
- Show me the **Should fix** and **Suggestion** items and ask which ones to fix.
- If you disagree with a finding, explain why instead of fixing it.

## 5. QA (mandatory)

- **Always run qa-engineer.** Never skip this step, and never do QA yourself instead of calling the agent - even when the change looks small or you already ran some checks.
- Give it the acceptance criteria, whether live browser testing is on or off, other known blockers, and what already failed in this build. Tell it to treat the developers' tests as claims, not coverage.
- **A blocker on one kind of test is not a reason to skip QA.** If end-to-end browser tests are blocked (no credentials, no running app), qa-engineer still writes and runs everything else: unit tests for pure logic, API and server tests, and edge cases. Only the blocked part is skipped, and it is listed as manual checks.
- **Live evidence first.** Ask QA to verify against the running system where possible (live probes for access and grants, end-to-end flows). Text tests on source files need vacuity guards and are a regression net, not the gate.
- **Stop verifying once stronger evidence exists.** If something is applied and verified live, don't spend more rounds polishing a text assertion about it.
- Send bugs to the right developer agent to fix, then have qa-engineer re-test. Repeat until the acceptance criteria pass, or stop after two rounds and tell me what's still failing.
- Do not commit, push or open a PR before QA has run, unless I explicitly say to.

## 6. Summary

First **update the second brain** (see below), then finish with a short summary. Throughout the build, relay agent reports as decisions and facts, not transcripts.

- What was built (files created/changed, endpoints, migrations to run, new environment variables)
- Review findings and what was fixed
- QA results: **confirm qa-engineer ran**, acceptance criteria pass/fail, tests written and their results
- Whether live browser testing ran (test account provided) or was skipped (no test account)
- What QA could not cover and why (for example, "end-to-end login flow: no test account"), as a checklist of manual checks for me
- Which second-brain pages were updated (if a brain is set up)
- Anything left open or needing my decision

**Updating the second brain** (if the ph1-brain plugin is installed: your CLAUDE.md has a "Ph1 second brain" section with its path): create or update the project's page in its `wiki/projects/` folder with what was built, key decisions and why, the acceptance criteria result, lessons learned, and the PR or branch. Link related client, decision and topic pages, add a decision page for any decision that matters later, and add one line to `wiki/log.md`. Never write to its `raw/` folder.

Do not commit or push unless I ask.

## Ship gate (enforced)

Using this workflow turns on the ship gate for the session. `git commit`, `git push`, `git merge` and `gh pr create/merge` are **blocked** until code-reviewer has reviewed the feature and qa-engineer has tested the latest code changes. This includes small follow-up changes from my live feedback: after any round of changes, run review and QA before shipping. If a command is blocked, run the missing agents. Don't try to get around the gate, and never skip it on your own; only I can, by typing `/ph1-pwa-kit:ship-gate skip`.
