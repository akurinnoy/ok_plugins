---
description: Prepare and optionally post review comments to GitHub
argument-hint: [pr-url | owner/repo#number]
model: sonnet
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

**MANDATORY**: Do not post anything to GitHub until the user explicitly says to ("post", "submit", "go ahead"). Prepare and show comments first - the user may want to edit before posting.

## Input

Input: {{args}}

Accepts an optional argument: `<pr-url | owner/repo#number>`.

- **With argument**: use the specified PR.
- **No argument**: default to the latest reviewed PR in this conversation. Find the most recent `STANDARD_REVIEW_COMPLETE: <owner>/<repo>#<number>` marker in conversation history and use that PR.

Then look for findings files in `$HOME/.claude/ok-pr-review/repos/{owner}/{repo}/`:
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

### 3. Show to User and Ask

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
  (no event - leave as pending draft)
```

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

Report what was posted:
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
