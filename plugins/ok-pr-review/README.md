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

## CI / Non-Interactive Mode

Set `OK_PR_REVIEW_AUTO_POST=true` to skip the interactive approval prompt and submit the review directly.

In CI mode, the `comment` command:
- Matches findings against the PR diff to create inline comments on specific code lines
- Submits the review immediately with `COMMENT` action (not a pending draft)
- Findings that can't be matched to a specific line go in the review body

```bash
export OK_PR_REVIEW_AUTO_POST=true
claude -p "/ok-pr-review:review https://github.com/org/repo/pull/123" && \
claude -p "/ok-pr-review:comment org/repo#123"
```

Without this env var, the `comment` command shows prepared comments and waits for explicit user approval before posting.

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
