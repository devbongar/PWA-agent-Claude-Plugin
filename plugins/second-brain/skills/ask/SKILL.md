---
name: ask
description: Answer a question from the company second brain (wiki), with links to the pages and sources used. Use when the person asks what was decided, what a client wants, how something was done before, or anything the brain may know.
argument-hint: [your question]
---
Answer this question from the second brain: $ARGUMENTS

The brain's location is in your instructions under "Second brain" (configured as `${user_config.brain_path}`, where `~` is the user's home folder).

1. Read `wiki/index.md`, then the pages relevant to the question. Follow links to related pages as needed. Search the wiki (Grep) if the index doesn't point to an answer.
2. Answer clearly and briefly. After each key fact, cite the wiki page it came from, e.g. `(wiki/projects/site-reports-app.md)`. Mention the original raw source when it matters.
3. If the wiki doesn't know, say so plainly; don't guess. If unprocessed files in `raw/` might hold the answer, say so and suggest `/brain-ingest`.
4. If pages disagree, show both versions with their dates and sources.
5. If the answer pulls several pages together in a way worth keeping, save it as a new page in `wiki/topics/` (or the best-fitting section), link it from the related pages and the index, and add a line to `wiki/log.md`. Tell the person you saved it.

Never change anything in `raw/`. Never ask the person to organize anything.
