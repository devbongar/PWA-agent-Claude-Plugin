---
name: ingest
description: Process new or changed files in the Ph1 second brain's raw/ folder into the wiki now, instead of waiting for the automatic run.
disable-model-invocation: true
---
Call the `mcp__ph1-brain__ingest` tool (load it with ToolSearch first if it isn't loaded), then tell me in one or two sentences what it started: how many files the librarian is processing, or that nothing is waiting.

The librarian works in the background. Don't wait for it, don't read or process the raw files yourself, and never change anything in `raw/`.
