# CLAUDE.md

## Project

`signal-keeper` — TypeScript/Node CLI that polls GitHub PRs, runs AI code reviews via Claude Code subprocess, and exposes a keyboard-driven Ink TUI for acting on results.

## Build & test

```bash
npm run build       # tsup → dist/ (also chmod +x dist/index.js)
npm run typecheck   # tsc --noEmit
npm test            # vitest
npm link            # register `signal-keeper` bin in PATH (run once after build)
```

## Architecture

```
src/
├── index.ts              # CLI entry — commander: start | tui | review <url>
├── daemon.ts             # Poll loop + review orchestration + concurrency limiter
├── config/               # Zod schema, YAML loader, types
├── github/               # Octokit wrapper, per-target poller, PR actions (merge/comment/close)
├── review/               # Claude CLI subprocess, prompt builder, output validator
├── autofix/              # Clone → fix → branch → push → follow-up PR
├── state/                # SQLite (better-sqlite3): init, migrations, typed query wrappers
├── notifications/        # macOS desktop notifications via node-notifier
├── tui/                  # Ink (React) app: screens, components, hooks
└── utils/                # pino logger, XDG paths, child process helper
```

## Key conventions

- **Imports use `.js` extensions** even for `.ts` source files — required for ESM with Node's module resolution.
- **SQLite is the only IPC** between daemon and TUI. No sockets, no events. TUI polls DB every 2 s.
- **Claude is spawned as a subprocess** via `src/utils/process.ts:run()`. Never import the Anthropic SDK directly — the CLI subprocess approach gives us tool use, cost tracking, and the `--json-schema` flag for structured output.
- **No shell string interpolation** for subprocess calls. Always use `spawn`/`run(cmd, args[])` with a separate args array to prevent injection.

## State DB schema (4 tables)

- `prs` — discovered open PRs, upserted each poll cycle
- `reviews` — AI review results keyed by `(pr_id, head_sha)` — one row per SHA
- `decisions` — user actions taken from the TUI (merged, commented, closed, re-reviewed)
- `autofix_jobs` — tracks clone/fix/push/PR pipeline status

## Review output shape

```typescript
{
  category: "auto-merge" | "needs-attention" | "needs-changes" | "block",
  summary: string,
  notes: string[],
  suggestedChanges: { file, description, suggestion }[],
  confidence: number   // 0-1
}
```

Enforced via `--json-schema` passed to the `claude` subprocess. See `src/review/types.ts`.

## Claude subprocess flags (review)

```bash
claude --print --output-format json --dangerously-skip-permissions \
  --tools Read --model sonnet --max-budget-usd 0.50 \
  --json-schema '{...}' "<prompt>"
```

## Claude subprocess flags (autofix)

```bash
claude --print --output-format json --dangerously-skip-permissions \
  --tools Bash,Edit,Read --model sonnet --max-budget-usd 1.00 \
  --add-dir /path/to/repo "<prompt>"
```

## Adding a new TUI screen

1. Create `src/tui/screens/my-screen.tsx` — export a React component, use `useInput` for keys
2. Add the screen name to the `Screen` union in `src/tui/app.tsx`
3. Add a render branch in `App` and wire it to an existing action handler

## Config location

`~/.signal-keeper/config.yaml` — created from template on first run if missing.
Override with `-c /path/to/config.yaml` on any command.
