---
name: flow
description: Orchestrate a complete PR review workflow using ok-pr-review skills in the correct order. Use when the user asks to "review this PR", "PR review", "review my PR", "full PR review", "complete PR review", "run PR review workflow", or provides a PR URL and asks for a review. Do NOT trigger when the user explicitly invokes an individual ok-pr-review skill (e.g., "/ok-pr-review:summary"), asks only for a summary, or asks only to post comments.
---

# PR Review Orchestrator

Run a complete PR review using the `ok-pr-review` plugin commands in the correct order, with intelligent scope decisions based on the PR content.

## Input

PR URL or reference: {{args}}

Accept any of these formats:
- `https://github.com/owner/repo/pull/123`
- `owner/repo#123`
- `#123` (if repo context is clear)

## Workflow

### Step 0: Check for domain profile

Check for `$HOME/.claude/ok-pr-review/repos/{owner}/{repo}/profile.md`.

- **If found**: the review commands will use it automatically for richer context.
- **If not found**: recommend running `/ok-pr-review:learn-repo {owner}/{repo}` first. This is a one-time setup per repository that improves all subsequent reviews. Continue with the review regardless — it works without a profile.

### Step 1: Summary (always)

Run the summary command first to get a quick orientation:

```
Skill: ok-pr-review:summary
Args: <PR-URL>
```

This produces a pre-flight map: key areas, risks, and what to watch for. It runs on Sonnet for speed.

### Step 2: Decide scope

Based on the summary output, decide which additional reviews to run:

| Signal from summary | Action |
|---------------------|--------|
| Small PR (< ~5 files), single concern, no security/ops changes | `review` only |
| Medium PR, multiple areas, test changes | `review` + consider `deep-review` |
| Large PR, security-sensitive, RBAC/permissions, API changes | `review` + `deep-review` |
| Infrastructure, deployment, operator config, supply chain | `review` + `impact` |
| Large + security + infrastructure | `review` + `deep-review` + `impact` |

Announce the decision to the user before proceeding, e.g.:
> "Based on the summary, this is a focused 3-file bugfix. Running standard review only."

or:
> "This PR touches RBAC, API routes, and has 15 changed files. Running standard review + deep review + impact review."

### Step 3: Standard review (always)

Run the standard review:

```
Skill: ok-pr-review:review
Args: <PR-URL>
```

This is the core review. It must complete before deep-review or impact can run. Wait for the `STANDARD_REVIEW_COMPLETE: owner/repo#number` marker in the output.

**Sandbox note:** If `gh` CLI fails with TLS/certificate errors, the subagent should retry with `dangerouslyDisableSandbox: true` on Bash calls.

### Step 4: Deep review (if warranted)

Only if decided in Step 2:

```
Skill: ok-pr-review:deep-review
Args: <PR-URL>
```

This reuses PR data from the standard review (no re-fetching). It focuses on design quality, anti-patterns, and testing rigor — does NOT repeat standard review findings.

### Step 5: Impact review (if warranted)

Only if decided in Step 2:

```
Skill: ok-pr-review:impact
Args: <PR-URL>
```

System-level review: supply chain, RBAC, ops, compatibility. Also requires the standard review marker.

### Step 6: Simplify (for own PRs, optional)

**Requires**: the `pr-review-toolkit` plugin (provides the `code-simplifier` agent). If not installed, skip this step and note: "Install the `pr-review-toolkit` plugin to enable automatic code simplification reviews."

If the PR author matches the current git user (`git config user.name` or `git config user.email`) **and** the `pr-review-toolkit:code-simplifier` agent is available, spawn a background subagent to review the changed files for reuse opportunities, quality improvements, and efficiency.

```
Agent:
  description: "Code simplification review"
  subagent_type: "pr-review-toolkit:code-simplifier"
  run_in_background: true
  prompt: "Review recent changes for code reuse, quality, and efficiency..."
```

### Step 7: Report

After all reviews complete, provide a consolidated summary:

```
## PR Review Complete: owner/repo#123

| Review | Verdict | Key findings |
|--------|---------|-------------|
| Summary | (areas, risks) | ... |
| Standard | Approve/Request Changes | ... |
| Deep | (if run) | ... |
| Impact | (if run) | ... |
| Simplify | (if run) | ... |

### Action items
1. ...
2. ...
```

### Step 8: Comment (optional)

Ask the user if they want to post the review findings to GitHub:

```
Skill: ok-pr-review:comment
Args: <PR-URL>
```

Only run if the user explicitly confirms.

## Important notes

- Commands must run **sequentially** (summary → review → deep-review/impact). Deep-review and impact depend on the `STANDARD_REVIEW_COMPLETE` marker from the standard review.
- Deep-review and impact CAN run in parallel with each other (both depend only on the standard review, not on each other).
- The `simplify` subagent CAN run in parallel with deep-review/impact since it operates independently.
- Never re-invoke a command that already completed in this conversation — the markers prevent duplicate runs.
- **For CI/non-interactive use**, use the `ci` workflow instead — it runs the full pipeline deterministically with auto-posting.
