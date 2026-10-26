---
name: lint
description: Health check of the company second brain - finds and fixes contradictions, outdated facts, broken links, orphan pages, missing citations and gaps in the wiki.
disable-model-invocation: true
---
Run a health check on the second brain's wiki.

Use the **ph1-brain:librarian** agent, with the brain folder (`${user_config.brain_path}`, where `~` is the user's home folder; full path in your CLAUDE.md's "Ph1 second brain" section) as its working directory, and ask it to run its **lint** procedure on the whole wiki.

When it finishes, give me a short summary:

- What it fixed
- What needs my input (these are also in `wiki/_meta/questions.md`)

Never change anything in `raw/`.
