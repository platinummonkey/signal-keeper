# CLAUDE.md

## Project

**signal-keeper** — TypeScript/Node CLI that polls GitHub PRs, runs AI code reviews via Claude Code subprocess, and serves a browser UI backed by Express + Vite. Licensed MIT.

## Build & test

```bash
npm run build        # tsup (server → dist/) then vite build (client → dist/client/)
npm run dev          # tsx src/index.ts start --dev  (Vite middleware on :7777, HMR)
npm run typecheck    # tsc --noEmit && tsc -p src/client/tsconfig.json --noEmit
npm test             # vitest (65 tests)
npm link             # register signal-keeper bin in PATH (run once after build)
```

Build order matters: tsup runs first (clean: true wipes dist/), then vite adds dist/client/.

## Architecture

```
src/
├── index.ts              # CLI entry — commander: start | review | add repo | add org
├── daemon.ts             # Poll loop, review orchestration, external contributor flow, CI approval detection
├── config/               # Zod schema, YAML loader, types
├── github/               # Octokit wrapper, per-target poller, PR/CI/job actions
├── review/               # Claude CLI subprocess, prompt builders, output validator, session continuity
├── autofix/              # Clone → fix → branch → push → follow-up PR (review fix & CI fix)
├── state/                # SQLite (better-sqlite3): init, inline migrations, typed query wrappers
├── notifications/        # macOS desktop notifications via node-notifier
├── server/               # Express server, API routes, SSE event bus, Vite middleware (dev)
│   ├── server.ts         # Express setup; Vite middlewareMode in --dev
│   ├── api.ts            # REST routes: /api/prs, /api/prs/:id/*, /api/events (SSE)
│   ├── event-bus.ts      # Shared EventEmitter: daemon → SSE → browser
│   └── ui.ts             # "not built yet" fallback page
└── client/               # Vite SPA (TypeScript, no framework)
    ├── index.html
    ├── main.ts           # App state, rendering, actions
    ├── api.ts            # Typed fetch wrappers for all API endpoints
    ├── diff.ts           # Unified diff renderer
    ├── types.ts          # Shared API response types
    └── style.css
```

## Key conventions

- **ESM throughout** — imports use `.js` extensions even for `.ts` source files.
- **SQLite is the only IPC** — daemon writes, browser reads via the HTTP API. No sockets.
- **Claude runs as a subprocess** — never import the Anthropic SDK directly. The CLI subprocess gives tool use, `--resume`/`--fork-session` for session continuity, and `total_cost_usd` in JSON output.
- **No shell string interpolation** in subprocess calls — always `run(cmd, args[])`.
- **Vite in middlewareMode** in dev — one port (7777), no proxy, HMR works on the same connection.
- **tsup externals** — `better-sqlite3`, `node-notifier`, `express`, `vite` are never bundled.

## State DB schema (4 tables + migrations)

- `prs` — discovered open PRs; upserted each poll cycle
  - `is_external` (0/1), `external_stage`, `pending_approval` (0/1)
  - `body` — PR description from GitHub
- `reviews` — AI review results keyed by `(pr_id, head_sha, stage)`
  - `stage`: `full` | `initial` | `final`
  - `session_id` — Claude CLI session ID for resuming conversations
- `decisions` — user actions from the browser UI
- `autofix_jobs` — tracks clone/fix/push/PR pipeline status

Additive migrations run via try/catch `ALTER TABLE` on every startup (safe to re-run).

## Review output shape

```typescript
{
  category: "auto-merge" | "needs-attention" | "needs-changes" | "block",
  summary: string,
  notes: string[],
  suggestedChanges: { file, description, suggestion }[],
  confidence: number   // 0–1
}
```

Enforced via schema embedded in the prompt (Claude CLI has no reliable `--json-schema` flag). See `src/review/types.ts`.

## Claude subprocess patterns

**Review (read-only):**
```bash
claude --print --output-format json --dangerously-skip-permissions \
  --tools Read --model sonnet --max-budget-usd 0.50 "<prompt with schema>"
```

**Re-review (session fork):**
```bash
claude --print --output-format json --dangerously-skip-permissions \
  --tools Read --model sonnet --max-budget-usd 0.50 \
  --resume <session_id> --fork-session "<prompt>"
```

**Autofix / CI fix (write access):**
```bash
claude --print --output-format json --dangerously-skip-permissions \
  --tools Bash,Edit,Read --model sonnet --max-budget-usd 1.00 \
  --add-dir /path/to/repo [--resume <session_id> --fork-session] "<prompt>"
```

## CI pipeline

`GET /api/prs/:id/ci` fetches:
- Overall status (`pending` | `passed` | `failed` | `no_runs`) via `getCIStatus()`
- Workflow runs with per-job breakdown via `getWorkflowRunsForCommit()` + `getWorkflowRunJobs()`

The browser polls every 15 s while status is `pending` and stops automatically once terminal.

## External contributor flow

When `trustedOrgs` is configured, PRs from non-members follow stages in `prs.external_stage`:
1. `null` → initial review; if not `block`, advances to `awaiting_approval`
2. `awaiting_approval` → user clicks Approve CI → daemon calls `approveAllActionRequiredRuns()` → `ci_pending`
3. `ci_pending` → daemon polls CI until complete → final review → `complete`

`pending_approval` (0/1) is set separately for any PR with `action_required` workflow runs.

## Browser UI structure

```
#topbar          (status dot, live indicator, last poll time)
#main
  #sidebar       (filter buttons, repo dropdown, PR list with SSE live updates)
  #detail
    #detail-header   (title, meta badges)
    #action-bar      (Merge, Comment, AI Comment, Re-review, Autofix, Approve CI, Close)
    #tab-bar         (Review | Description | CI | Diff)
    #tab-content     (scrollable, swapped on tab click)
```

## Adding a new API endpoint

1. Add the route in `src/server/api.ts` — register specific routes (e.g. `/prs/:id/ci`) **before** the generic `/prs/:id` catch-all.
2. Add the typed fetch wrapper in `src/client/api.ts`.
3. Add request/response types in `src/client/types.ts` if needed.
4. Wire the UI in `src/client/main.ts`.

## Data directory

`~/.signal-keeper/` — config, DB, logs, cloned repos. Created automatically on first run.
Override config path with `-c /path/to/config.yaml` on any command.
