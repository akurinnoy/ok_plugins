# PR Review Workflow

## Overview

The PR review system consists of two skills that work in sequence:

1. **Standard Review** (`pr-review`) - Must be run FIRST
2. **Deep Review** (`pr-deep-review`) - Must be run SECOND (after standard review on the SAME PR)

## Workflow

```
┌─────────────────────────────────────────────────────────────┐
│  Step 1: Standard Review                                   │
│  Command: /review-pr <PR-URL>                              │
│                                                             │
│  - Fetches PR data from GitHub                             │
│  - Analyzes correctness, security, quality                 │
│  - Provides standard feedback                              │
│  - Outputs: STANDARD_REVIEW_COMPLETE: owner/repo#number    │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  Step 2: Deep Review                                       │
│  Command: /deep-review-pr <SAME-PR-URL>                    │
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

### Correct Usage ✅

```bash
# Step 1: Run standard review
/review-pr https://github.com/che-incubator/dash-licenses/pull/32

# Wait for it to complete (look for STANDARD_REVIEW_COMPLETE marker)
# Output will show: STANDARD_REVIEW_COMPLETE: che-incubator/dash-licenses#32

# Step 2: Run deep review WITH THE SAME PR URL
/deep-review-pr https://github.com/che-incubator/dash-licenses/pull/32
```

### Alternative PR URL Formats

All of these are valid for both commands:

```bash
# Full URL
/review-pr https://github.com/owner/repo/pull/123

# Short format
/review-pr owner/repo#123

# If repo context is clear from conversation
/review-pr #123
```

### What Happens If You Skip Step 1? ❌

If you try to run `/deep-review-pr` without running `/review-pr` first:

```
❌ Deep review cannot proceed.

Reason: Standard review for che-incubator/dash-licenses#32 not found in this conversation.

The standard review (pr-review skill) must be run FIRST on the same PR before the deep review.

Steps to fix:
1. Run: /review-pr https://github.com/che-incubator/dash-licenses/pull/32
2. Wait for completion (look for STANDARD_REVIEW_COMPLETE marker)
3. Then run: /deep-review-pr https://github.com/che-incubator/dash-licenses/pull/32
```

### What Happens If You Use Different PRs? ❌

If you run standard review on PR #32 but deep review on PR #45:

```bash
/review-pr https://github.com/owner/repo/pull/32
# ... completes with STANDARD_REVIEW_COMPLETE: owner/repo#32

/deep-review-pr https://github.com/owner/repo/pull/45
```

Result:
```
❌ Deep review cannot proceed.

Reason: Standard review for owner/repo#45 not found in this conversation.

The standard review (pr-review skill) must be run FIRST on the same PR before the deep review.
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

**Example**: `STANDARD_REVIEW_COMPLETE: che-incubator/dash-licenses#32`
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

## Files Updated

### Skills
- `/Users/okurinny/.claude/skills/pr-review/SKILL.md`
  - Fetches all PR data
  - Performs standard review
  - Outputs `STANDARD_REVIEW_COMPLETE: owner/repo#number` marker
  - Fixed `gh pr diff` commands (removed invalid `--stat` flag)

- `/Users/okurinny/.claude/skills/pr-deep-review/skill.md`
  - Requires PR URL as input
  - Validates standard review was run first on same PR
  - Reuses PR data from conversation context
  - Focuses on deep analysis only
  - Outputs `DEEP_REVIEW_COMPLETE` marker

### Slash Commands
- `/Users/okurinny/.claude/commands/review-pr.md`
  - Updated description to indicate it must run first
  - Takes PR URL as argument

- `/Users/okurinny/.claude/commands/deep-review-pr.md`
  - Updated description to indicate prerequisite
  - **Requires PR URL as argument** (same as standard review)
  - Added abort warning if standard review not run on same PR

## Migration Notes

**Breaking Change**:
1. `/deep-review-pr` now requires the PR URL as an argument
2. It validates that `/review-pr` was run on the exact same PR first
3. Will fail if standard review not found or different PR

**Recommended Migration**:
Update any automation to:
```bash
PR_URL="https://github.com/owner/repo/pull/123"
/review-pr $PR_URL
/deep-review-pr $PR_URL
```

## Troubleshooting

### Error: "Standard review not found"
- **Cause**: You didn't run `/review-pr` first
- **Fix**: Run `/review-pr <PR-URL>` before `/deep-review-pr`

### Error: "Standard review for owner/repo#X not found" (different number)
- **Cause**: You ran standard review on a different PR
- **Fix**: Run `/review-pr` on the same PR you want to deep review

### Error: "PR data not found in conversation context"
- **Cause**: Standard review failed or was incomplete
- **Fix**: Re-run `/review-pr <PR-URL>` and ensure it completes successfully

## Additional Fixes

### GitHub CLI Command Fixes
Both skills were updated to fix invalid `gh` commands:

**Before (BROKEN):**
```bash
gh pr diff <number> --repo <owner>/<repo> --stat  # ❌ --stat doesn't exist
gh pr diff <number> --repo <owner>/<repo> -- file  # ❌ file filtering not supported
```

**After (FIXED):**
```bash
gh pr diff <number> --repo <owner>/<repo> --name-only  # ✅ Get file list
gh pr diff <number> --repo <owner>/<repo>              # ✅ Get full diff
```

These fixes ensure the skills work correctly with the actual GitHub CLI capabilities.
