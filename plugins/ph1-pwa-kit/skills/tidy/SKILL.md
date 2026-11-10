---
name: tidy
description: Cheap, tool-driven clean-up of an existing project - finds duplicated code, dead code, oversized files and heavy bundles with free tools, then fixes the top few items in small, behaviour-preserving batches.
argument-hint: [optional: a folder to focus on, or how many items, e.g. "src/features 3"]
disable-model-invocation: true
---
Tidy this project: $ARGUMENTS

Goal: make the code leaner **without changing what it does**, while spending as few tokens as possible. Free tools find the problems; you only open the files they point to. Never read the whole codebase.

## 1. Measure (tools, not reading)

Run these from the project root (or the folder I named), with `npx`, without adding them to package.json. Keep only the summaries, not full output:

- **Dead code:** `npx --yes knip@5 --no-exit-code` - unused files, exports and packages.
- **Duplication:** `npx --yes jscpd@4 <source folder> --min-lines 10 --min-tokens 70 --silent --reporters json --output .jscpd` - read the json for the biggest clones.
- **Big files:** list source files by line count (the 10 largest), with a one-line shell command.
- **Bundle size** (if the project builds quickly): build, then the 10 largest JS files in the output, gzipped.

Delete the `.jscpd` folder afterwards. If a tool fails to run, skip it and say so; don't try to fix the tooling.

## 2. Pick the top items

From the results, pick **at most 5 items** (or the number I gave), ranked by value for effort:

1. Unused packages and unused files (cheap, safe, and they shrink installs and builds)
2. Large duplicated blocks (one shared function instead of copies)
3. Unused exports and dead functions
4. One oversized file or component, split by responsibility
5. The heaviest bundle import, replaced or lazy-loaded

Show me the list in a few lines (item, files, expected gain) and **wait for my OK**. Leave out anything risky: public APIs, database migrations, auth, payments, or code without tests around it (list those separately as "needs tests first").

## 3. Fix in small batches

- One item at a time. Open only the files involved.
- **Behaviour stays the same.** Run the project's tests (and type check and lint) before the first change, so you know the baseline, and after each item. If something goes red, undo that item and say so.
- Before deleting anything knip reports as unused, search for dynamic uses (string imports, config files, route files, scripts in package.json). When unsure, leave it and list it.
- Follow the agents' "keep it lean" rules: reuse, smallest change, no new abstractions.

## 4. Review and QA (quick track)

When the batch is done, run **code-reviewer** (`model: sonnet`) and **qa-engineer** in parallel, as in `/ph1-pwa-kit:quick-change`: the reviewer checks the diff for behaviour changes; QA confirms the tests and the main flows still pass. One fix round at most. The ship gate is on, as for any change.

## 5. Report (short)

- What changed, per item, and the gain (lines removed, packages removed, KB saved)
- What was left out and why ("needs tests first", unsure if unused)
- The next items for another `/ph1-pwa-kit:tidy` run

If the brain is set up, add one line to the project's page ("tidy: removed N lines, M packages") and to `wiki/log.md`.

Don't commit or push unless I ask.
