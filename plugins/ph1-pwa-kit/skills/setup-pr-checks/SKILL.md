---
name: setup-pr-checks
description: Adds GitHub Actions PR checks to this project - secret scan (gitleaks), lint, type check, tests, build and dependency audit - adjusted to the project's own scripts.
disable-model-invocation: true
---
Set up GitHub Actions PR checks for this project, starting from the template next to this skill: `${CLAUDE_SKILL_DIR}/pr-checks.yml`. Every step that says `SETUP` is a place to adjust.

## 1. Look at the project

- `package.json`: which scripts exist (`lint`, `typecheck` or `type-check`, `test`, `build`), the package manager (`package-lock.json` = npm, `pnpm-lock.yaml` = pnpm, `yarn.lock` = yarn, `bun.lockb` = bun), and the Node version (`.nvmrc`, `.node-version`, `engines.node`).
- Whether there's a `tsconfig.json`.
- What the build needs: environment variables it reads at build time (for example `VITE_*`, `NEXT_PUBLIC_*`), and whether it fails without them.
- What `npm test` runs. If it runs Playwright or other tests that need a live login, a running server or a real database, don't run those in CI: use the unit-test script instead (for example `vitest run`), or leave the test step out and say so.
- If `.github/workflows/` already has workflows, read them. Don't duplicate checks that already run; if one already covers lint or tests, only add what's missing.
- If this isn't a Node project, keep the secret scan job and adapt the other jobs to the stack (or leave them out and say so).

## 2. Write the workflow

- Create `.github/workflows/pr-checks.yml` from the template, with every `SETUP` point resolved for this project: Node version, package manager (install, cache and audit commands; for pnpm add `pnpm/action-setup@v4` before `setup-node`), the real script names, and placeholder build variables if the build needs them.
- **Never put a real key, password or URL with credentials in the workflow.** For build variables use harmless placeholders, or `${{ secrets.NAME }}` and tell me which repository secrets to add (Settings > Secrets and variables > Actions).
- Remove the `SETUP` comments once each point is resolved; keep the other comments.
- Keep the secret scan job as it is.
- **Lean-code steps** (knip, jscpd, bundle size, optional Lighthouse) are warnings only (`continue-on-error`): they never fail a PR; results appear on the run's summary page. Set the jscpd source folder, the build output folder, and the bundle budget: build locally once, measure today's gzipped JavaScript total, and set the budget about 10% above it. Turn on the Lighthouse step only for a static build (for example a Vite PWA's `dist`); leave it commented out otherwise. Don't add these tools to package.json; they run with `npx`.
- Write the file with the Write tool (it contains `${{ }}` expressions and shell quoting), not a shell heredoc.

## 3. Check it

- Check the YAML parses (for example `npx --yes yaml-lint .github/workflows/pr-checks.yml`, or Python's `yaml.safe_load`).
- Run the same commands locally that the workflow will run (install, lint, type check, tests, build, audit), so the first PR isn't red for a reason we could see now. Report any that fail, and whether that's a real problem in the project or a workflow setting to fix. Don't change app code to make checks pass without asking me.
- If the audit finds high or critical issues today, tell me: the check will be red until they're fixed. Offer to fix them separately, or to set `--audit-level=critical` for now.
- Optional, if I want a CI-side safety net for false alarms: a `.gitleaks.toml` with an `[allowlist]` for specific test fixtures. Only add it when needed.

## 4. Tell me

In a few lines:

- The checks added, and anything left out (and why)
- Repository secrets I need to add, if any
- How to see it working: push a branch and open a pull request; the checks appear near the merge button within a minute or two. The Actions tab shows each run's log.
- Optional: to make the checks **required before merging**, add a branch protection rule (Settings > Branches, or Rules > Rulesets) for the main branch with "Require status checks to pass" and pick these checks. On a private repository this may need a paid GitHub plan; without it the checks still run and show red or green.

Don't commit or push unless I ask. When I do, the ship gate's commit scan checks the new file like any other.
