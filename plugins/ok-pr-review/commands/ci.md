---
description: Non-interactive PR review for CI pipelines - runs full review flow and posts comments automatically
argument-hint: <pr-url | owner/repo#number>
model: claude-opus-4-6
allowed-tools:
  - Bash
  - Read
  - Write
  - Glob
  - Grep
  - Skill
  - mcp__github__*
---

# CI PR Review

Run the full PR review pipeline in non-interactive mode. Designed for CI pipelines (GitHub Actions, GitLab CI, etc.) where no human is present to confirm steps.

**Key differences from the interactive flow:**
- No user prompts or confirmations at any step
- Scope is decided automatically based on PR signals
- Comments are posted to GitHub immediately
- No simplify step (that's for author iteration, not CI)

## Input

Input: {{args}}

Accept:
- GitHub URL: `https://github.com/owner/repo/pull/123`
- Shorthand: `owner/repo#123`

Parse `owner`, `repo`, and `number` from the input.

## Process

### 1. Set CI environment

```bash
export OK_PR_REVIEW_AUTO_POST=true
```

This tells the comment command to post directly without waiting for user confirmation.

### 2. Load domain profile (silent)

Check for `$HOME/.claude/ok-pr-review/repos/{owner}/{repo}/profile.md`. If found, it will be picked up automatically by the review commands. If not found, continue without it — no recommendation to run learn-repo in CI.

### 3. Summary

```
Skill: ok-pr-review:summary
Args: <PR-URL>
```

Wait for `PR_SUMMARY_COMPLETE` marker.

### 4. Decide scope

Apply the same scope rules as the interactive flow, but act immediately without announcing:

| Signal from summary | Action |
|---------------------|--------|
| Small PR (< ~5 files), single concern, no security/ops changes | `review` only |
| Medium PR, multiple areas, test changes | `review` + `deep-review` |
| Large PR, security-sensitive, RBAC/permissions, API changes | `review` + `deep-review` |
| Infrastructure, deployment, operator config, supply chain | `review` + `impact` |
| Large + security + infrastructure | `review` + `deep-review` + `impact` |

Log the decision:
```
CI scope decision: review + deep-review (15 files, RBAC changes detected)
```

### 5. Standard review

```
Skill: ok-pr-review:review
Args: <PR-URL>
```

Wait for `STANDARD_REVIEW_COMPLETE` marker before proceeding.

### 6. Deep review (if scope includes it)

```
Skill: ok-pr-review:deep-review
Args: <PR-URL>
```

### 7. Impact review (if scope includes it)

```
Skill: ok-pr-review:impact
Args: <PR-URL>
```

Deep review and impact can run in parallel — both depend only on the standard review marker.

### 8. Post comments

```
Skill: ok-pr-review:comment
Args: <PR-URL>
```

The comment command will detect `OK_PR_REVIEW_AUTO_POST=true` and post directly, including diff-matched inline comments.

### 9. Verdict

Output a structured verdict at the end:

```
## CI Review Complete: owner/repo#123

| Review | Verdict |
|--------|---------|
| Standard | ✅ Approve / 🔄 Request Changes / 💬 Comment |
| Deep | (if run) verdict |
| Impact | (if run) verdict |

**Overall**: ✅ / 🔄 / ❌

Posted N inline comments, M general comments to GitHub.
```

```
CI_REVIEW_COMPLETE: <owner>/<repo>#<number>
```
