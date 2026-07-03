# ok-pr-review

PR review suite for Claude Code: summary, standard review, deep review, system-level impact review, domain profiling, and comment posting.

## Commands

| Command | Model | Description |
|---------|-------|-------------|
| `/ok-pr-review:summary` | sonnet | Quick pre-flight orientation - key areas, risks, reviewer/author guidance |
| `/ok-pr-review:review` | opus | Standard code review - correctness, security, quality, performance |
| `/ok-pr-review:deep-review` | opus | Deep analysis - design quality, anti-patterns, testing rigor |
| `/ok-pr-review:impact` | opus | System-level review - supply chain, RBAC, ops, compatibility |
| `/ok-pr-review:learn-repo` | sonnet | Study a repo and write a reusable domain profile |
| `/ok-pr-review:comment` | sonnet | Aggregate findings and post to GitHub as a review (pending draft or submitted) |

## Workflow

```
/ok-pr-review:learn-repo owner/repo          (once per repo)
    |
    v
/ok-pr-review:summary owner/repo#123        (quick orientation)
    |
    v
/ok-pr-review:review owner/repo#123         (required first)
    |
    +---> /ok-pr-review:deep-review          (optional, needs review first)
    +---> /ok-pr-review:impact               (optional, needs review first)
    |
    v
/ok-pr-review:comment                        (aggregates all findings)
```

`summary` and `learn-repo` are independent. `deep-review` and `impact` both require `review` to run first. `comment` reads whichever findings files exist and aggregates them.

## Data Storage

Review artifacts are stored at `~/.claude/ok-pr-review/repos/{owner}/{repo}/`:
- `profile.md` - domain profile (from `learn-repo`)
- `{pr}-summary.md` - pre-flight summary
- `{pr}-review.md` - standard review findings
- `{pr}-deep-review.md` - deep review findings
- `{pr}-impact.md` - system-level findings
- `{pr}-comment.md` - prepared comments

This path is stable across plugin updates.

## CI Workflow (Non-Interactive)

The `ci` workflow runs the full review pipeline deterministically and posts comments to GitHub automatically. No user interaction needed.

```
fetch → summary → review → deep-review + impact (parallel) → post comments
```

Invoke via the Workflow tool or from a CI pipeline:

```bash
claude -p "Run the ci workflow for owner/repo#123"
```

The workflow:
- Fetches all PR data upfront (deterministic, not agent-driven)
- Runs all review stages in order with parallel deep-review + impact
- Auto-posts comments to GitHub as a submitted review
- Returns a structured verdict

A PreToolUse hook prevents review agents from modifying source code — they can only write findings files.

### Interactive Mode (flow workflow)

The `flow` workflow runs the review pipeline with intelligent scope decisions and produces a draft without posting:

```
fetch → summary (+ scope decision) → review → deep-review + impact (if warranted) → draft
```

The summary agent decides whether to run deep-review and/or impact based on PR size and content. After the workflow completes, review the draft and post via `/ok-pr-review:comment`.

You can also invoke individual commands manually for ad-hoc use.

## Installation

Add the marketplace in Claude Code:

```
/plugin marketplace add
```

Then install the plugin:

```
/plugin install ok-pr-review@ok-plugins
```

or select `ok-pr-review` from the list.

## License

EPL-2.0
