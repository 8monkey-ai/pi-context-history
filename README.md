# pi-context-history

A [Pi](https://github.com/earendil-works/pi-coding-agent) extension that keeps long-running conversations lean and focused.

In long sessions, the context window fills with old messages and tool output the model no longer needs. This extension removes what's stale and keeps a rolling summary so earlier context isn't lost.

Everything is on by default and works once installed. Each feature can be disabled independently.

## Install

```bash
pi install npm:@8monkey/pi-context-history
```

## Features

- **Trim history.** Drops messages older than `PI_HISTORY_DAYS` (60 by default) on each context rebuild.
- **Strip tool history.** Removes tool calls and results from turns before the current one, leaving the in-progress turn untouched.
- **Compact.** Keeps a rolling summary of your sessions in `~/.pi/agent/compact.md` and folds it into the system prompt, so the model continues with prior context. The summary regenerates during session start when you resume a session after it has gone stale. Run `/compact-session` to regenerate on demand.
- **Append message.** Adds a user or assistant message to the end of the history with `/add-user-message` and `/add-assistant-message`.

## Commands

| Command | What it does |
|---|---|
| `/compact-session` | Write a fresh summary of the current session now, ignoring the staleness window. |
| `/add-user-message <text>` | Add a message to the conversation as if you had typed it. |
| `/add-assistant-message <text>` | Add a message as if the assistant had said it. Requires a selected model. |

Appended messages are persisted immediately but only enter the live context on the next rebuild (resume or branch).

## Configuration

All configuration is via environment variables, and all of it is optional.

### Feature toggles

Each feature is on by default. Set its variable to `false` to disable it.

| Variable | Feature |
|---|---|
| `PI_TRIM_HISTORY` | Trim history |
| `PI_STRIP_TOOL_HISTORY` | Strip tool history |
| `PI_COMPACT` | Compact (generation and injection) |
| `PI_APPEND_MESSAGE` | The append-message commands |

### Settings

| Variable | Default | Description |
|---|---|---|
| `PI_HISTORY_DAYS` | `60` | Maximum age, in days, of messages kept in context. |
| `PI_COMPACT_STALENESS_DAYS` | `3` | How old the summary may get before it's regenerated on resume. |

### Compact prompt

Override the built-in prompt with a file at `prompts/compact.md`, read from the project `.pi/` first, then `~/.pi/`. It must contain the `{conversation_history}` placeholder.

## Development

No runtime dependencies. Pi loads the TypeScript directly, so there's no build step, and it runs under Node or Bun.

```bash
node --test        # run tests
npm run typecheck
```

## License

MIT
