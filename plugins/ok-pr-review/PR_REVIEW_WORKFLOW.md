# PR Review Workflow

## Overview

The PR review system consists of two skills that work in sequence:

1. **Standard Review** (`ok-pr-review`) - Must be run FIRST
2. **Deep Review** (`ok-pr-deep-review`) - Must be run SECOND (after standard review on the SAME PR)

## Workflow

```
┌─────────────────────────────────────────────────────────────┐
│  Step 1: Standard Review                                   │
│  Command: /ok-pr-review <PR-URL>                           │
│                                                             │
│  - Fetches PR data from GitHub                             │
│  - Analyzes correctness, security, quality                 │
│  - Provides standard feedback                              │
│  - Outputs: STANDARD_REVIEW_COMPLETE: owner/repo#number    │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  Step 2: Deep Review                                       │
│  Command: /ok-pr-deep-review <SAME-PR-URL>                 │
│                                                             │
│  - Validates standard review exists for this PR            │
│  - Aborts if standard review not found or different PR     │
│  - Reuses PR data already in context (no re-fetching)      │
│  - Performs deep analysis on design, testing, patterns     │
│  - Does NOT repeat standard review findings                │
│  - Outputs: DEEP_REVIEW_COMPLETE                           │
└─────────────────────────────────────────────────────────────┘
```

## Usage

### Correct Usage

```bash
# Step 1: Run standard review
/ok-pr-review https://github.com/che-incubator/dash-licenses/pull/32

# Wait for it to complete (look for STANDARD_REVIEW_COMPLETE marker)
# Output will show: STANDARD_REVIEW_COMPLETE: che-incubator/dash-licenses#32

# Step 2: Run deep review WITH THE SAME PR URL
/ok-pr-deep-review https://github.com/che-incubator/dash-licenses/pull/32
```

### Alternative PR URL Formats

All of these are valid for both commands:

```bash
# Full URL
/ok-pr-review https://github.com/owner/repo/pull/123

# Short format
/ok-pr-review owner/repo#123

# If repo context is clear from conversation
/ok-pr-review #123
```

### What Happens If You Skip Step 1?

If you try to run `/ok-pr-deep-review` without running `/ok-pr-review` first:

```
❌ Deep review cannot proceed.

Reason: Standard review for che-incubator/dash-licenses#32 not found in this conversation.

The standard review (ok-pr-review skill) must be run FIRST on the same PR before the deep review.

Steps to fix:
1. Run: /ok-pr-review https://github.com/che-incubator/dash-licenses/pull/32
2. Wait for completion (look for STANDARD_REVIEW_COMPLETE marker)
3. Then run: /ok-pr-deep-review https://github.com/che-incubator/dash-licenses/pull/32
```

### What Happens If You Use Different PRs?

If you run standard review on PR #32 but deep review on PR #45:

```bash
/ok-pr-review https://github.com/owner/repo/pull/32
# ... completes with STANDARD_REVIEW_COMPLETE: owner/repo#32

/ok-pr-deep-review https://github.com/owner/repo/pull/45
```

Result:
```
❌ Deep review cannot proceed.

Reason: Standard review for owner/repo#45 not found in this conversation.

The standard review (ok-pr-review skill) must be run FIRST on the same PR before the deep review.
```

## Benefits

1. **No Duplicate Fetching**: PR data is fetched once in standard review, reused in deep review
2. **No Duplicate Analysis**: Deep review focuses only on deeper insights, doesn't repeat basic findings
3. **Clear Separation**: Standard review = correctness/security, Deep review = design/quality
4. **Efficient**: Saves API calls and context space
5. **Safe**: Validates you're reviewing the same PR in both stages

## Standard Review Output Format

The standard review ends with:

```markdown
### Verdict
- 🔄 **Request Changes** - Needs fixes

---

**STANDARD_REVIEW_COMPLETE: che-incubator/dash-licenses#32** - This marker indicates the standard review is complete for this specific PR. The deep review skill can now be invoked with the same PR URL.
```

## Deep Review Validation

The deep review performs these checks:

### Step 1: Extract PR Info from Input
- Parses the provided URL/reference
- Extracts: owner, repo, PR number
- Constructs full reference: `owner/repo#number`

### Step 2: Validate Standard Review Completion
- Searches conversation for: `STANDARD_REVIEW_COMPLETE: owner/repo#number`
- Must be EXACT match (same owner, repo, and PR number)
- If not found or doesn't match → ABORT

### Step 3: Confirm PR Data Available
- Checks that conversation contains PR diff and metadata
- If missing → ABORT

### Step 4: Proceed with Deep Review
- Extracts PR data from conversation context
- Performs deep analysis
- Does NOT re-fetch any data from GitHub

## Data Reuse

Deep review extracts from conversation:
- Repository owner/name/PR number (from input, validated against marker)
- Changed files list (from standard review context)
- PR diff (from standard review context)
- PR metadata (from standard review context)

**No GitHub API calls are made during deep review.**

## Troubleshooting

### Error: "Standard review not found"
- **Cause**: You didn't run `/ok-pr-review` first
- **Fix**: Run `/ok-pr-review <PR-URL>` before `/ok-pr-deep-review`

### Error: "Standard review for owner/repo#X not found" (different number)
- **Cause**: You ran standard review on a different PR
- **Fix**: Run `/ok-pr-review` on the same PR you want to deep review

### Error: "PR data not found in conversation context"
- **Cause**: Standard review failed or was incomplete
- **Fix**: Re-run `/ok-pr-review <PR-URL>` and ensure it completes successfully
