---
description: Prepare and optionally post review comments to GitHub
argument-hint: <pr-url | owner/repo#number>
model: claude-sonnet-4-6
allowed-tools:
  - Bash
  - Read
  - Write
  - mcp__github__pull_request_review_write
  - mcp__github__add_comment_to_pending_review
  - mcp__github__add_reply_to_pull_request_comment
---

# PR Comment Posting

Aggregate review findings, compose final comment text, and (when the user explicitly asks) post to GitHub as a **pending review draft**.

**MANDATORY**: Do not post anything to GitHub until the user explicitly says to ("post", "submit", "go ahead"). Prepare and show comments first - the user may want to edit before posting. Exception: if `OK_PR_REVIEW_AUTO_POST=true` is set, skip the approval prompt and post directly (see Step 3).

## Input

Input: {{args}}

Accept:
- GitHub URL: `https://github.com/owner/repo/pull/123`
- Shorthand: `owner/repo#123`

Parse `owner`, `repo`, and `number` from the input.

Look for findings files in `$HOME/.claude/ok-pr-review/repos/{owner}/{repo}/`:
- `{pr-number}-summary.md` - pre-flight summary (may not exist)
- `{pr-number}-review.md` - standard review findings
- `{pr-number}-deep-review.md` - deep review findings (may not exist)
- `{pr-number}-impact.md` - system-level findings (may not exist)

Read whichever exist. If no files are found, fall back to:
- Conversation history (prior review output in this session)
- `_reviews/{repo}-{pr}-comments.md` if it exists

## Process

### 1. Gather and Aggregate Findings

Read all available findings files. Merge into a unified comment list:
- Deduplicate findings that appear in multiple files
- Skip items marked `~~strikethrough~~ - ADDRESSED` or `- DROPPED`
- Classify each remaining item:

| Type | Condition | How to post |
|---|---|---|
| Inline comment | Has a specific file + line number | `add_comment_to_pending_review` |
| Reply | Responds to an existing GitHub comment thread | `add_reply_to_pull_request_comment` (posts immediately, not pending) |
| General | No specific file/line | Include in the pending review body |

### 2. Write Prepared Comments to File

Write the aggregated, formatted comments to:
`$HOME/.claude/ok-pr-review/repos/{owner}/{repo}/{pr-number}-comment.md`

Use the numbered-section format (see Comment File Format below).

### 3. Diff-Match Findings (CI only)

Check the environment variable:
```bash
echo "$OK_PR_REVIEW_AUTO_POST"
```

**If `OK_PR_REVIEW_AUTO_POST` is NOT `true`**, skip to Step 3a.

**If `OK_PR_REVIEW_AUTO_POST` is `true`:**

Read the PR diff from the already-fetched file:
```bash
cat /tmp/pr-review-{owner}-{repo}-{pr}/diff.txt
```

For each finding currently classified as "General" (no file+line):
- Scan the finding text for file paths that appear in the diff
- Search for code snippets from the finding within the diff hunks of that file
- If a match is found, extract the actual file line number from the diff hunk header (e.g., `@@ -10,5 +12,7 @@` - use the `+` side line number for new code) and reclassify the finding as "Inline" with the matched file path and line
- Findings that can't be matched remain "General" in the review body

Update the `{pr-number}-comment.md` file with any reclassified findings.

Log this message:
```
Auto-post enabled (OK_PR_REVIEW_AUTO_POST=true) - submitting review with {N} inline, {M} general comments to GitHub without user confirmation.
```

Then proceed directly to Step 4.

### 3a. Show to User and Ask

**Otherwise (not set, empty, or any other value):**

Show the prepared comments. Then ask:
```
Comments prepared and saved to {pr-number}-comment.md ({N} inline, {M} general).
Say "post" when ready to create the pending review on GitHub.
```

Do not proceed to the GitHub posting steps until the user explicitly says to post.

### 4. Get Head Commit SHA

```bash
gh pr view <number> --repo <owner>/<repo> --json headRefOid --jq '.headRefOid'
```

### 5. Look Up Line Numbers (if not already known)

For inline comments that reference a file but not a specific line:
```bash
gh api "repos/<owner>/<repo>/contents/<path>?ref=<head-sha>" --jq '.content' | base64 -d | grep -n "<pattern>"
```

### 6. Create the Pending Review

```
mcp tool: pull_request_review_write
  method: create
  owner: <owner>
  repo: <repo>
  pullNumber: <number>
  commitID: <head-sha>
```

- **CI mode** (`OK_PR_REVIEW_AUTO_POST=true`): set `event: COMMENTED` to submit the review immediately
- **Interactive mode**: no event - leave as pending draft

### 7. Add Inline Comments

For each inline comment:
```
mcp tool: add_comment_to_pending_review
  owner, repo, pullNumber
  path: relative file path
  line: line number in the file
  side: RIGHT (for new code) or LEFT (for removed code)
  subjectType: LINE
  body: <comment text>
```

For multi-line comments, also set `startLine` and `startSide`.

### 8. Post Replies

Replies to existing threads cannot be part of a pending review - they post immediately:
```
mcp tool: add_reply_to_pull_request_comment
  owner, repo, pullNumber
  commentId: <ID of the parent comment>
  body: <reply text>
```

To find a comment ID when it's not already known:
```bash
gh api "repos/<owner>/<repo>/pulls/<number>/comments" \
  --jq '[.[] | {id: .id, author: .user.login, path: .path, line: .line, body: .body[:60]}]'
```

### 9. Confirm to User

**CI mode** (`OK_PR_REVIEW_AUTO_POST=true`):
```
Review submitted on <owner>/<repo>#<number>:
- N inline comments
- N general comments in review body
- N replies posted directly
```

**Interactive mode:**
```
Pending review created on <owner>/<repo>#<number>:
- N inline comments
- N replies posted directly (not pending)
Go to the GitHub PR to review and submit.
```

## Writing Style

Follow these rules when drafting or adjusting comment text:

- Use regular hyphen (`-`) not em dash
- **Collaborative and constructive tone:**
  - "Consider doing X to improve Y" - not "You must do X"
  - "We could simplify this by..." - "we" fosters shared ownership
  - "Does it make sense to...?" - invites discussion
  - "Would it be possible to...?" - for optional improvements
- Lead with the point, no preamble ("There is no need to encode here" not "I noticed that encoding is unnecessary")
- Short sentences
- Use GitHub `suggestion` blocks for concrete fixes:
  ````
  ```suggestion
  <replacement code>
  ```
  ````
- Cross-reference related comments with full GitHub URLs when relevant
- For obvious fixes, keep the body minimal - just the suggestion block

## Comment File Format

The `{pr-number}-comment.md` file uses numbered sections:

```markdown
## 1. Title of comment

**File:** `path/to/file:line`

Problem description (1-3 sentences).

[suggestion or diff block]

---

## ~~2. Already addressed comment~~ - ADDRESSED

## ~~3. Dropped comment~~ - DROPPED
```

Sections marked as ADDRESSED or DROPPED are skipped.
