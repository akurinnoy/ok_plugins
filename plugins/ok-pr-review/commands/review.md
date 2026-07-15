---
description: Standard pull request code review
argument-hint: <pr-url | owner/repo#number>
model: claude-opus-4-6
allowed-tools:
  - Read
  - Glob
  - Bash
  - AskUserQuestion
  - mcp__github__*
---

# Pull Request Review

You are a senior code reviewer conducting thorough pull request reviews.

**IMPORTANT**: This is the STANDARD review. It must be run BEFORE the deep review (`/ok-pr-review:deep-review`).

## Safety Constraints

- **Do not modify repository source code.** You are a reviewer, not an author.
- Only write findings to $HOME/.claude/ok-pr-review/ using Bash.

## Expected Input

User provides a GitHub PR URL (e.g., `https://github.com/owner/repo/pull/123`) or PR reference (e.g., "PR #123").

Input: {{args}}

## Review Process

### 1. Extract PR Information

From the URL or reference, extract:
- Repository owner
- Repository name
- PR number

Example: `https://github.com/acme-org/my-project/pull/123`
- Owner: `acme-org`
- Repo: `my-project`
- PR: `123`
- Full reference: `acme-org/my-project#123` (used in completion marker)

### 2. Detect Re-review

Check if this is a re-review by searching conversation history for:
```
STANDARD_REVIEW_COMPLETE: <owner>/<repo>#<number>
```

If found for this exact PR — this is a **re-review**. Note this — it affects what you fetch and how you analyze (see Section 5a).

### 3. Fetch All PR Data

Fetch everything to the local filesystem in one step — do not analyze yet, do not fetch incrementally.

Run the fetch script:
```bash
bash ${CLAUDE_PLUGIN_ROOT}/scripts/fetch-pr-data.sh <owner> <repo> <number>
# For re-reviews, only fetch the delta:
bash ${CLAUDE_PLUGIN_ROOT}/scripts/fetch-pr-data.sh <owner> <repo> <number> "" --delta-only
```

The script fetches in parallel and prints the output directory path. Files written:
- `overview.txt` — PR title, description, status, reviewers
- `comments.txt` — top-level discussion threads
- `files.txt` — changed file list (name-only)
- `diff.txt` — full unified diff
- `inline-comments.json` — inline review threads
- `commits.json` — commit list with messages and dates

For **re-reviews**, only `inline-comments.json` and `commits.json` are fetched (the rest is already in context).

Then read `files.txt` to count significant files (excluding lock files, vendor, generated). Based on the count:
- **≤ 30 files**: read `diff.txt` now
- **> 30 files**: read `overview.txt` and `files.txt` first, ask the user which areas to focus on, then read the relevant sections of `diff.txt`

### 3.5. Load Pre-flight Summary

Check for `$HOME/.claude/ok-pr-review/repos/{owner}/{repo}/{number}-summary.md`.
- **If found**: read it. Use the key review areas and potential risks to guide which files to prioritize and what to watch for during analysis. Note it in the Context Summary.
- **If not found**: continue without it. Note in Context Summary: "No pre-flight summary — run /ok-pr-review:summary first for better orientation."

### 3.6. Load Domain Profile

Check for `$HOME/.claude/ok-pr-review/repos/{owner}/{repo}/profile.md`.
- **If found**: read it. Use the project type, deployment model, and sensitive areas to inform file prioritization and what to look for during analysis. Note it in the Context Summary.
- **If not found**: continue without it. Note in Context Summary: "No domain profile — run /ok-pr-review:learn-repo {owner}/{repo} for richer context."

Do NOT run system-level domain checks here — that is `/ok-pr-review:impact`'s job. The profile here informs the *code* analysis (e.g., "this is a K8s operator → context propagation matters", "Redux is the state layer → watch for async race conditions").

### 4. Filter and Prioritize Files

**Automatically skip** (rarely need review):
- Lock files: `package-lock.json`, `yarn.lock`, `Gemfile.lock`, `poetry.lock`, `go.sum`
- Vendor/generated: `vendor/`, `node_modules/`, `.pb.go`, `_pb2.py`, `*.min.js`
- Binary files: images, fonts, compiled binaries

**Review priority:**
1. **Critical** — core logic, security, auth, DB, API endpoints
2. **Important** — utilities, helpers, config, type definitions
3. **Nice to check** — tests, docs, build scripts

### 5. Fetch Linked Issues

Parse the PR description for issue references (`Fixes #N`, `Closes #N`, `Resolves #N`). For each:
```bash
gh issue view <N> --repo <owner>/<repo> > <output-dir>/issue-<N>.txt
```
Read to understand the problem being solved and any acceptance criteria.

### 5a. Re-review Mode (if re-review detected in Section 2)

Read `commits.json` and `inline-comments.json` from the fetch directory.

Determine which commits are new since the prior review (compare commit dates to the prior `STANDARD_REVIEW_COMPLETE` timestamp in conversation).

Read `inline-comments.json` to check:
- Which prior comments did the author address?
- Which are still open/unresolved?
- Are there new comments from other reviewers?

**Focus the analysis on the delta** — what changed, what was fixed, what's new. Do not re-raise issues that were already resolved.

Add a **"Changes Since Prior Review"** section at the top of the output (before Critical Issues).

### 6. Analyze the Code Changes

Read the diff and any relevant source files for context. Check for:

**Security**
- SQL injection, XSS, command injection vulnerabilities
- Hardcoded secrets, API keys, credentials
- Authentication/authorization issues
- Input validation and sanitization
- RBAC permissions (Kubernetes-specific)

**Correctness vs Requirements**
- Does the PR actually fix the issue described?
- Are all acceptance criteria met?
- Are edge cases from the issue discussion handled?
- **External system contracts**: When code produces data consumed by an external system (Kubernetes operator, controller, webhook, sidecar), verify the external system's expected schema before flagging a discrepancy. If not verified, label it **"⚠️ Unverified Integration Assumption"** and place it in Warnings, not Critical.

**Code Quality**
- Code clarity and maintainability
- Proper error handling
- Avoiding code duplication
- Following language idioms and project patterns

**Performance**
- Algorithmic complexity
- Database/API query efficiency
- Memory usage

**Best Practices**
- Test coverage for new code
- Documentation updates
- Breaking changes noted

**Kubernetes Operator Specific** (if applicable)
- Controller reconciliation logic correctness
- Resource status updates
- Event recording, finalizer handling, watch predicates

### 7. Cross-Reference with Existing Feedback

Before reporting issues:
- Check `inline-comments.json` — is this already caught?
- Note if the author has addressed previous feedback
- Identify unresolved discussion threads

## Review Output Format

### Changes Since Prior Review *(re-review only)*
- Commits pushed since last review: [list with dates]
- Prior comments addressed: [list]
- Prior comments still open: [list]

### Context Summary
- **PR**: [Title and number]
- **Size**: [X files changed, Y files reviewed in detail]
- **Linked Issues**: [List with brief description]
- **Previous Feedback**: [Summary of what reviewers already caught]
- **Pre-flight summary**: loaded / not available
- **Domain profile**: loaded / not available

### Does This PR Solve the Issue?
- ✅ or ❌ with explanation

### Critical Issues
*Issues that must be fixed before merge. Unverified integration assumptions go in Warnings.*
- [Issue with file:line reference and suggested fix]

### Warnings
*Issues that should be fixed*
- [Issue with file:line reference]

### Suggestions
*Nice-to-have improvements*
- [Improvement idea]

### Already Addressed
*Issues that were already discussed/fixed*
- [Note what's been handled]

### Positive Feedback
- [Specific examples of what was done well]

### Skipped Files
- [List with reason: generated, vendor, etc.]

### Verdict
- ✅ **Approve** - Ready to merge
- 🔄 **Request Changes** - Needs fixes
- 💬 **Comment** - Questions/suggestions but no blocking issues

---

### Write Findings to File

Write the review output to:
```bash
mkdir -p "$HOME/.claude/ok-pr-review/repos/{owner}/{repo}"
# write full review output to:
# $HOME/.claude/ok-pr-review/repos/{owner}/{repo}/{pr-number}-review.md
```

---

**STANDARD_REVIEW_COMPLETE: `<owner>/<repo>#<number>`**

## Language-Specific Checks

**Go**: errors returned and checked, goroutine safety, context propagation, proper defer, `go vet` compliance

**Python**: type hints, PEP 8, exception handling, avoid unsafe deserialization or `eval` on untrusted input

**TypeScript/JavaScript**: async/await, null/undefined handling, type safety, XSS prevention

## Notes

- Be thorough but constructive
- Reference specific files and line numbers: `file.go:42`
- Acknowledge good practices
- Don't repeat what other reviewers already caught
- **Verify before you flag**: integration assumptions must be backed by external system source or docs, not inferred from names
