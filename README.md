# signal-keeper

AI-powered GitHub PR reviewer with a terminal UI. Monitors PRs across configured orgs and repos, runs code reviews via Claude Code, and lets you act on results (merge, comment, close, autofix) from a keyboard-driven TUI.

## How it works

```
config.yaml → Daemon (polls GitHub) → Claude Code subprocess (reviews PR)
                                            ↓
                                       SQLite DB ←→ Terminal TUI (user actions)
                                            ↓
                                     macOS notifications
```

- **Daemon** — polls GitHub on a configurable interval, queues Claude reviews, stores results in SQLite
- **TUI** — reads the same SQLite DB, lets you navigate PRs and take actions
- **AI Review** — spawns `claude` CLI with structured JSON output; produces a category, summary, notes, and suggested changes
- **Autofix** — clones the repo, runs Claude with edit tools to apply suggested changes, pushes a branch, opens a follow-up PR

## Install

```bash
git clone https://github.com/platinummonkey/signal-keeper
cd signal-keeper
npm install
npm run build
npm link          # makes `signal-keeper` available in PATH
```

Requires:
- Node.js 20+
- [Claude Code CLI](https://claude.ai/code) (`claude` in PATH)
- [GitHub CLI](https://cli.github.com/) (`gh auth login` done, or a custom token command)

## Configuration

On first run, a template is written to `~/.signal-keeper/config.yaml`:

```yaml
github:
  tokenCommand: "gh auth token"   # any shell command that prints a GitHub token

pollIntervalSeconds: 300          # how often to poll (default: 5 min)

targets:
  # Watch all non-draft PRs in a repo
  - repo: my-company/backend
    filter: all

  # Watch only PRs authored by team members
  - org: my-company
    filter: team
    team: platform-eng            # GitHub team slug

  # Watch PRs assigned to you
  - repo: friend/oss-project
    filter: assigned

notifications:
  enabled: true
  categories: [needs-attention, needs-changes, block]

maxConcurrentReviews: 3           # parallel Claude subprocesses
maxReviewCostUsd: 0.50            # per-review budget cap
reviewModel: sonnet               # claude model to use
workDir: ~/.signal-keeper/repos  # clone location for autofix
```

## Usage

**Start the daemon** (polls GitHub + runs AI reviews in the background):

```bash
signal-keeper start
signal-keeper start --pretty          # pretty-print logs to stdout
signal-keeper start --log-level debug
signal-keeper start -c /path/to/config.yaml
```

**Open the TUI** (reads the same DB the daemon writes to):

```bash
signal-keeper tui
```

**Review a specific PR** (one-shot, prints JSON):

```bash
signal-keeper review https://github.com/owner/repo/pull/123
```

## TUI keyboard shortcuts

| Key | Action |
|-----|--------|
| `j` / `↓` | Move down |
| `k` / `↑` | Move up |
| `Enter` | Open PR detail |
| `m` | Merge (only enabled for `auto-merge` category) |
| `f` | Autofix — clone repo, apply AI fixes, open follow-up PR |
| `c` | Post a comment |
| `x` | Close PR |
| `p` | Re-review with a custom prompt |
| `r` | Trigger re-review |
| `0` | Show all PRs |
| `1` | Filter: auto-merge |
| `2` | Filter: needs-attention |
| `3` | Filter: needs-changes |
| `4` | Filter: block |
| `q` / `Esc` | Back / quit |

## Review categories

| Category | Meaning |
|----------|---------|
| `auto-merge` | Safe to merge — straightforward changes, follows patterns, no risk |
| `needs-attention` | Generally fine, worth a glance before merging |
| `needs-changes` | Issues found that should be addressed (bugs, missing tests, design concerns) |
| `block` | Serious problems — security issues, breaking changes, major bugs |

## Data location

All data is stored under `~/.signal-keeper/`:

| Path | Contents |
|------|----------|
| `config.yaml` | Configuration |
| `state.db` | SQLite database (PRs, reviews, decisions, autofix jobs) |
| `logs/daemon.log` | Daemon log file |
| `repos/` | Cloned repos used by autofix |

## Development

```bash
npm run build       # compile TypeScript → dist/
npm run dev         # watch mode
npm run typecheck   # type-check without emitting
npm test            # run tests
```
