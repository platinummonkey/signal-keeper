# signal-keeper

AI-powered GitHub PR reviewer. Monitors pull requests across configured orgs and repos, runs code reviews via Claude Code, shows CI status per job, and lets you act on results — merge, comment, autofix, CI fix — from a browser UI.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## How it works

```
config.yaml → Daemon (polls GitHub) → Claude Code subprocess (reviews PR)
                                            ↓
                                       SQLite DB ←→ Browser UI (http://localhost:7777)
                                            ↓
                                     macOS notifications
```

- **Daemon** — polls GitHub on a configurable interval, queues Claude reviews, stores results in SQLite
- **Browser UI** — served by Express on the same port; Vite middleware in dev mode for HMR
- **AI Review** — spawns `claude` CLI with structured JSON output; produces a category, summary, notes, and suggested changes
- **Autofix** — clones the repo, runs Claude with edit tools to apply suggested changes, pushes a branch, opens a follow-up PR
- **CI Fix** — for each failing CI job, forks the review session and runs Claude to fix the failure

## Install

```bash
git clone https://github.com/platinummonkey/signal-keeper
cd signal-keeper
npm install
npm run build
npm link          # makes `signal-keeper` available in PATH
```

**Requirements:**
- Node.js 20+
- [Claude Code CLI](https://claude.ai/code) (`claude` in PATH, authenticated)
- [GitHub CLI](https://cli.github.com/) (`gh auth login` done, or a custom token command)

## Quick start

```bash
# 1. Add your first repo target
signal-keeper add repo owner/my-repo

# 2. Start the daemon + open browser UI
signal-keeper start
```

## Configuration

On first run a template is written to `~/.signal-keeper/config.yaml`:

```yaml
github:
  tokenCommand: "gh auth token"   # any shell command that prints a GitHub token

pollIntervalSeconds: 300          # how often to poll (default: 5 min)

targets:
  # Watch all open PRs in a specific repo
  - repo: my-org/backend
    filter: all

  # Watch PRs by team members across an entire org
  - org: my-org
    filter: team
    team: platform-eng             # GitHub team slug

  # Watch PRs assigned to you
  - repo: friend/oss-project
    filter: assigned

# PRs from authors not in these orgs go through an extra safety review
# before CI is approved (initial review → approve CI → final review)
trustedOrgs: []                   # e.g. [DataDog, datadog-labs, ddoghq]

notifications:
  enabled: true
  categories: [needs-attention, needs-changes, block]

maxConcurrentReviews: 3           # parallel Claude subprocesses
maxReviewCostUsd: 0.50            # per-review budget cap
reviewModel: sonnet               # claude model
workDir: ~/.signal-keeper/repos   # clone location for autofix
port: 7777                        # browser UI port
```

### Adding targets from the CLI

```bash
signal-keeper add repo owner/repo               # watch a repo (filter: all)
signal-keeper add repo owner/repo --filter assigned
signal-keeper add org my-org                    # watch all repos in an org
signal-keeper add org my-org --filter team --team platform-eng
```

## Usage

```bash
signal-keeper start                   # daemon + browser UI (opens automatically)
signal-keeper start --no-open         # start without opening the browser
signal-keeper start --log-level debug # verbose logging
signal-keeper start -c /path/to/config.yaml

signal-keeper review https://github.com/owner/repo/pull/123  # one-shot review, prints JSON
```

**Dev mode** (Vite HMR, no build step needed):
```bash
npm run dev
```

## Browser UI

The UI runs at `http://localhost:7777` (or whatever `port` is set to).

### PR list sidebar
- Filter by review category (All / Auto-merge / Attention / Changes / Block)
- Filter by repository via dropdown
- Live updates via Server-Sent Events — no manual refresh needed
- `⏸` badge when a PR's CI workflows need approval

### PR detail panel

**Action bar** (always visible at top):
| Button | Action |
|--------|--------|
| Merge | Merge the PR (squash). Only enabled for `auto-merge` category. |
| Comment | Post a GitHub comment |
| ✨ AI Comment | Claude drafts a comment from the review session, posts it |
| Re-review | Trigger a fresh review |
| Custom prompt… | Re-review with extra instructions |
| Autofix | Clone → Claude applies fixes → push branch → open PR |
| Approve CI | Approve pending workflow runs (appears when needed) |
| Close | Close the PR |

**Tabs:**

| Tab | Contents |
|-----|---------|
| Review | Category badge, confidence, summary, notes, suggested changes |
| Description | Full PR body |
| CI | Overall status badge + per-workflow-run job breakdown with `Fix` button on failures |
| Diff | Unified diff with line numbers, file stats, truncation warning for large diffs |

**CI Fix button** — on any failed CI job, click Fix to:
1. Fork the review's Claude session (Claude already has PR context)
2. Apply the minimal fix to make the job pass
3. Push a `ci-fix/pr-N-job-name` branch and open a follow-up PR

## Review categories

| Category | Meaning |
|----------|---------|
| `auto-merge` | Safe to merge — straightforward, follows patterns, no risk |
| `needs-attention` | Generally fine, worth a glance |
| `needs-changes` | Issues found: bugs, missing tests, design concerns |
| `block` | Serious problems — security issues, breaking changes, major bugs |

## External contributor workflow

When `trustedOrgs` is configured, PRs from non-members go through a three-stage flow:

1. **Initial review** — safety-focused: is this safe to approve CI for?
2. **Approve CI** — click `Approve CI` in the browser after reviewing. Approves all `action_required` workflow runs.
3. **Final review** — full review including CI results once checks complete.

## Data location

All data is stored under `~/.signal-keeper/`:

| Path | Contents |
|------|----------|
| `config.yaml` | Configuration |
| `state.db` | SQLite database (PRs, reviews, decisions, autofix jobs) |
| `logs/daemon.log` | Daemon log file |
| `repos/` | Cloned repos used by autofix / CI fix |

## Development

```bash
npm run dev          # Vite dev server with HMR on :7777
npm run build        # tsup (server) + vite (client) → dist/
npm run typecheck    # tsc --noEmit for both server and client
npm test             # vitest unit tests
npm link             # register signal-keeper bin in PATH (run once after build)
```

## License

[MIT](LICENSE) © 2026 Cody Lee
