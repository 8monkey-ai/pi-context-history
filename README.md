# pi-context-history

A [Pi](https://github.com/earendil-works/pi-coding-agent) extension that manages conversation context end-to-end. It trims old history, strips stale tool chatter from earlier turns, keeps a rolling session summary, folds that summary back into the system prompt, and lets you append messages to the history by hand — so long-running conversations stay lean, focused, and continuous.

Each feature is independent and can be turned off individually, so you can run the whole pipeline or just the parts you want.

## Features

| Feature | Hook | What it does |
|---|---|---|
| **Trim history** | `context` | Drops messages older than a configurable age from the context. |
| **Strip tool history** | `context` | Removes tool calls and results from prior turns, keeping the current turn's tool interactions intact. |
| **Generate summary** | `session_start` | Regenerates a stale rolling summary in the background when a session resumes; also available on demand via `/summarize-session`. |
| **Inject summary** | `before_agent_start` | Folds the rolling summary into the system prompt so the model continues with prior context. |
| **Append message** | command | Adds a user or assistant message to the end of the history via `/add-user-message` and `/add-assistant-message`. |

The summary features are a producer/consumer pair: **Generate summary** writes `~/.pi/agent/summary.md`, and **Inject summary** reads it.

## Install

```bash
pi install npm:@8monkey/pi-context-history
```

## How it works

- **Trim history.** On each `context` event the message list is filtered to those whose `timestamp` is within `PI_HISTORY_DAYS`. Messages exactly at the cutoff are kept.
- **Strip tool history.** Tool calls and results from earlier turns are removed; the current turn is left untouched. At the start of each agent loop the extension marks where the current turn begins (scanning back past the latest tool exchange) and holds that mark steady across the loop, so a running turn is never stripped mid-flight. Before the mark, tool results are dropped and assistant messages lose their tool-call blocks (if nothing else remains, the message goes too).
- **Generate summary.** When you resume a session whose summary has gone stale — older than `PI_SUMMARY_STALENESS_DAYS`, with a first message older than the window too — the extension rebuilds `~/.pi/agent/summary.md` by shelling out to `pi -p` (extensions, context files, and skills disabled). New and empty sessions are skipped. To override the built-in prompt, drop your own at `prompts/session-summary.md` (project `.pi/` wins over `~/.pi/`); it must contain the `{conversation_history}` placeholder.
- **Inject summary.** Before each agent run, when `~/.pi/agent/summary.md` exists, its contents are wrapped in a `<summary date="…">` block (the date is the file's modified time) followed by an `<additional_context>` note telling the model to maintain continuity and match the existing language and tone.
- **Append message.** `/add-user-message <text>` and `/add-assistant-message <text>` write a message with the matching role to the end of the session history. The entry is persisted immediately but enters the live context on the next rebuild (resume or branch), since Pi has no public way to inject into a running turn. Appending an assistant message requires a model to be selected, as the message records its identity.

Zero runtime dependencies. Pi loads the TypeScript directly, so there's no build step. Runs under Node or Bun.

## Commands

| Command | Description |
|---|---|
| `/add-assistant-message <text>` | Append an assistant message to the end of the history. Persisted immediately; enters context on the next rebuild. Available only when the **Append message** feature is enabled. |
| `/add-user-message <text>` | Append a user message to the end of the history. Persisted immediately; enters context on the next rebuild. Available only when the **Append message** feature is enabled. |
| `/summarize-session` | Regenerate the current session's summary on demand, ignoring the staleness window. Writes `~/.pi/agent/summary.md` and reports success, failure, or an empty session. Available only when the **Generate summary** feature is enabled. |

## Configuration

All configuration is via environment variables.

### Feature toggles

Every feature is **on by default** and switched off by setting its flag to `false` or `0`:

| Variable | Default | Feature |
|---|---|---|
| `PI_TRIM_HISTORY` | on | Trim history |
| `PI_STRIP_TOOL_HISTORY` | on | Strip tool history |
| `PI_GENERATE_SUMMARY` | on | Generate summary |
| `PI_INJECT_SUMMARY` | on | Inject summary |
| `PI_APPEND_MESSAGE` | on | Append message |

### Settings

| Variable | Default | Description |
|---|---|---|
| `PI_HISTORY_DAYS` | `60` | Maximum age, in days, of messages kept in the context. |
| `PI_SUMMARY_STALENESS_DAYS` | `3` | How many days old a summary (and the session's first message) must be before automatic regeneration kicks in on session start. |

| File | Default | Description |
|---|---|---|
| `prompts/session-summary.md` | built-in default | Optional override for the summary prompt. Read from project `.pi/` first, then `~/.pi/`. Must contain the `{conversation_history}` placeholder. |

## Development

```bash
node --test       # run tests
npm run typecheck
```

## License

MIT
