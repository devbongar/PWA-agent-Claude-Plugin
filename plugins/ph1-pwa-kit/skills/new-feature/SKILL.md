---
name: new-feature
description: Builds a new PWA feature end to end using the project's agents - plan, build (frontend and backend), parallel review, fix, QA and summary.
argument-hint: [describe the feature]
disable-model-invocation: true
---
Build this new feature: $ARGUMENTS

If the description above is empty or too vague to plan from, ask me what the feature should do, who uses it, and how it should work on mobile and desktop before starting.

You are the project lead. Plan and coordinate; delegate the building, testing and reviewing to the agents below. They come from the ph1-pwa-kit plugin, so their full names are `ph1-pwa-kit:frontend-developer`, `ph1-pwa-kit:backend-developer`, `ph1-pwa-kit:qa-engineer`, `ph1-pwa-kit:code-reviewer` and `ph1-pwa-kit:ui-reviewer`. If a project defines its own agent with the same short name, use the project's version.

## 1. Plan

- Read the relevant parts of the codebase so the plan fits the existing structure.
- Show me:
  - What the feature does, as a list of **acceptance criteria**
  - Frontend work: screens and components, how they look on mobile and desktop, offline behaviour
  - Design direction (for UI work): which existing design system and components to follow, or - for new looks or landing pages - a short proposed direction (colours, typography, layout, motion). This is the design approval the frontend developer relies on.
  - Backend work: endpoints, database changes
  - The **API contract**: each endpoint's method, path, request and response shape, and error cases
  - Files to create or change, and any open questions
- **Stop and wait for my OK before writing code.**

## 2. Build

- Give each developer the approved plan, the acceptance criteria and the API contract.
- Run **backend-developer** and **frontend-developer** in parallel when they touch separate files. If the feature is frontend-only or backend-only, use just that one.
- When both finish, check that the frontend and backend match the API contract. Resolve any mismatch before continuing.

## 3. Review

Run **code-reviewer** and **ui-reviewer** in parallel on all changes from this feature (skip ui-reviewer if there are no UI changes). Combine their findings into one list ranked by priority, removing duplicates.

## 4. Fix

- Send **Must fix** items to the developer agent who owns that code (frontend-developer or backend-developer).
- Show me the **Should fix** and **Suggestion** items and ask which ones to fix.
- If you disagree with a finding, explain why instead of fixing it.

## 5. QA (mandatory)

- **Always run qa-engineer.** Never skip this step, and never do QA yourself instead of calling the agent - even when the change looks small or you already ran some checks.
- Give it the acceptance criteria and tell it about any known blockers (for example, no test login available).
- **A blocker on one kind of test is not a reason to skip QA.** If end-to-end browser tests are blocked (no credentials, no running app), qa-engineer still writes and runs everything else: unit tests for pure logic, API and server tests, and edge cases. Only the blocked part is skipped, and it is listed as manual checks.
- Send bugs to the right developer agent to fix, then have qa-engineer re-test. Repeat until the acceptance criteria pass, or stop after two rounds and tell me what's still failing.
- Do not commit, push or open a PR before QA has run, unless I explicitly say to.

## 6. Summary

Finish with a short summary:

- What was built (files created/changed, endpoints, migrations to run, new environment variables)
- Review findings and what was fixed
- QA results: **confirm qa-engineer ran**, acceptance criteria pass/fail, tests written and their results
- What QA could not cover and why (for example, "end-to-end login flow: no test credentials"), as a checklist of manual checks for me
- Anything left open or needing my decision

Do not commit or push unless I ask.
