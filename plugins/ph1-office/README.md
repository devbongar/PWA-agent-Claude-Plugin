# ph1-office (Ph1 Agent Office)

A live pixel-art office for your Claude Code agents. Each ph1-pwa-kit agent has its own desk and character. When an agent starts working, its character walks from the lounge to its desk, the monitor switches on, and a speech bubble shows what it's doing (coding, running, browsing, screenshot...). When it finishes, it walks back to the lounge with a "done!" bubble. Other agent types (Explore, general-purpose and so on) use the two hot desks. The Lead (Claude) desk shows what the main session is doing.

- Opens automatically as a pane each session; reopen it with `/ph1-office:open`.
- VS Code and the desktop app show the animated office; the terminal shows a text list.
- Needs Claude Code 2.1.299 or later.

Characters: Frontend (blue, headphones), Backend (green hoodie), QA (orange, cap), Code Review (purple, glasses), UI Review (pink, beret), Lead (navy, red tie).

## Brain beneath the office

If the ph1-brain plugin is installed, the office pane also shows the brain underneath: a **Library / Knowledge map** switch and the selected view. It reads what ph1-brain shares in `~/.claude/ph1-brain/view.json` (updated within about 10 seconds). Without ph1-brain the section doesn't appear.
