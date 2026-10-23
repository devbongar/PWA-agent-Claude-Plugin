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

## 5. QA

- Run **qa-engineer** with the acceptance criteria. It writes and runs tests (unit, API, end-to-end on phone, tablet and desktop, and offline if relevant) and reports bugs.
- Send bugs to the right developer agent to fix, then have qa-engineer re-test. Repeat until the acceptance criteria pass, or stop after two rounds and tell me what's still failing.

## 6. Summary

Finish with a short summary:

- What was built (files created/changed, endpoints, migrations to run, new environment variables)
- Review findings and what was fixed
- QA results: acceptance criteria pass/fail, test results
- Anything left open or needing my decision

Do not commit or push unless I ask.
