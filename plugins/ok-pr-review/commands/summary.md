---
description: Quick PR summary - key areas, risks, and reviewer/author guidance
argument-hint: <pr-url | owner/repo#number>
model: claude-sonnet-4-6
allowed-tools:
  - Bash
  - Read
  - Write
  - mcp__github__*
---

# PR Summary

## Safety Constraints

- **Do not modify repository source code.** You are a reviewer, not an author.
- Only use Write to save findings under $HOME/.claude/ok-pr-review/.

---

Produce a short pre-flight orientation for a pull request. This is a map, not a review - tell the reviewer where to look and what to worry about, nothing more. The detailed analysis is done by `/ok-pr-review:review`, `/ok-pr-review:deep-review`, and `/ok-pr-review:impact`.

## Input

Input: {{args}}

Accept:
- GitHub URL: `https://github.com/owner/repo/pull/123`
- Shorthand: `owner/repo#123`

Parse `owner`, `repo`, and `number` from the input.

## Process

### 1. Resolve GitHub Identity

Check `$HOME/.claude/ok-pr-review/.github-user`. If the file does not exist, fetch and store:

```bash
mkdir -p "$HOME/.claude/ok-pr-review"
gh api user --jq '.login' > "$HOME/.claude/ok-pr-review/.github-user"
```

Read the file to get the current user's GitHub login.

### 2. Fetch PR Data

Run the fetch script to collect all artifacts in parallel:

```bash
bash ${CLAUDE_PLUGIN_ROOT}/scripts/fetch-summary-data.sh <owner> <repo> <number>
```

The script writes to `/tmp/pr-summary-{owner}-{repo}-{number}/`:
- `metadata.json` - title, body, author, branches, changedFiles, additions, deletions
- `files.txt` - changed files with status and line counts
- `diff.txt` - full unified diff

### 3. Read Fetched Artifacts

Read all three files from the output directory. If `diff.txt` exceeds 30,000 characters, use only the first 30,000 characters and note "(Diff truncated - too large for full analysis)".

### 4. Determine Authorship

Compare the `author.login` field from `metadata.json` with the stored GitHub identity.

- **Match** → this is your PR. Use the Author perspective.
- **No match** → you are reviewing. Use the Reviewer perspective.

### 5. Analyze

With all fetched data in context, produce the summary. Do not fetch any additional data - work only with what was fetched in step 2.

**This is a pre-flight orientation, not a code review.** Your job is to point the reviewer to the right places and flag what could go wrong - not to analyze the code yourself. Do not describe implementation details, do not explain how the code works, do not suggest fixes. One sentence per bullet. If a bullet needs two sentences, split it into two bullets.

#### Reviewer perspective (not your PR)

```
1. **Summary** (2-3 sentences): What does this PR do?
2. **Key Review Areas**: What specific parts should a reviewer focus on? Reference file names and concepts. One bullet per area.
3. **Potential Risks**: List every risk you can identify — be thorough, not selective. It is better to over-flag here than to miss something. The detailed review will filter. One bullet per risk.
```

#### Author perspective (your PR)

```
1. **Summary** (2-3 sentences): What does this PR do?
2. **Key Areas**: What parts of this PR might draw reviewer questions or concerns? One bullet per area.
3. **Suggestions**: List every concern a reviewer might raise — be thorough, not selective. One bullet per suggestion.
```

Keep each section brief and actionable. No filler, no preamble. No implementation details - those belong in the full review.

#### Example output (reviewer perspective)

This is the level of detail and tone to aim for:

```
## Summary

This PR adds inline validation with error messages to the Personal Access Tokens form for both the Token Name and Git Provider URL fields. It replaces static helper text with dynamic error messages that appear when validation fails.

## Key Review Areas

- Validation logic in TokenName/index.tsx and GitProviderEndpoint/index.tsx - verify the validation states and error message conditions are correct
- Error message accuracy - check that the validation rules match actual requirements (regex patterns, URL validation, character limits)
- Test coverage in both __tests__/index.spec.tsx files - ensure all validation scenarios are tested
- UX consistency - confirm error states use proper PatternFly components and styling

## Potential Risks

- Error messages appear immediately on input change, which may feel aggressive (consider debouncing or validating on blur)
- The Git Provider endpoint validation only checks for http/https protocols - verify this covers all legitimate use cases
- Ensure screen readers properly announce validation errors when they appear/disappear
```

Notice: no implementation details, no code analysis, no "the regex now requires X." Just where to look and what to worry about.

### 6. Write Summary

```bash
mkdir -p "$HOME/.claude/ok-pr-review/repos/{owner}/{repo}"
```

Write to `$HOME/.claude/ok-pr-review/repos/{owner}/{repo}/{number}-summary.md`.

Print the summary to the user.

---

**PR_SUMMARY_COMPLETE: `<owner>/<repo>#<number>`**
