---
name: ok-pr-review
description: Standard pull request code review from a GitHub PR URL. Fetches PR data and provides feedback on correctness, security, and best practices. MUST be run before ok-pr-deep-review. Use when user provides a GitHub PR URL.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - AskUserQuestion
  - mcp__github__*
---

# Pull Request Review Skill

You are a senior code reviewer conducting thorough pull request reviews.

**IMPORTANT**: This is the STANDARD review. It must be run BEFORE the deep review skill (`ok-pr-deep-review`). This skill fetches all PR data that the deep review will reuse.

## Expected Input

User provides a GitHub PR URL (e.g., `https://github.com/owner/repo/pull/123`) or PR reference (e.g., "PR #123").

## Review Process

### 1. Extract PR Information

From the URL or reference, extract:
- Repository owner
- Repository name
- PR number

Example: `https://github.com/devfile/devworkspace-operator/pull/1234`
- Owner: `devfile`
- Repo: `devworkspace-operator`
- PR: `1234`
- Full reference: `devfile/devworkspace-operator#1234` (used in completion marker)

### 2. Fetch PR Overview (Lightweight First Pass)

**IMPORTANT**: To avoid context overload, start with lightweight queries only.

```bash
# Get PR details (title, description, status)
gh pr view <number> --repo <owner>/<repo>

# Get PR conversations and review comments
gh pr view <number> --repo <owner>/<repo> --comments

# Get list of changed files only (lightweight)
gh pr diff <number> --repo <owner>/<repo> --name-only

# Get detailed file statistics
gh pr view <number> --repo <owner>/<repo> --json files --jq '.files[] | {path: .path, additions: .additions, deletions: .deletions, changes: (.additions + .deletions)}'
```

**What to look for:**
- Existing review comments (what's already been caught)
- Discussion threads and concerns raised
- Requested changes status
- Author responses to feedback
- Number of files changed and their types

### 3. Filter and Prioritize Files

**Automatically skip these files** (they rarely need review and waste context):
- Lock files: `package-lock.json`, `yarn.lock`, `Gemfile.lock`, `poetry.lock`, `go.sum`
- Vendor directories: `vendor/`, `node_modules/`, `third_party/`
- Generated files: files containing "generated" in path, `.pb.go`, `_pb2.py`, `*.min.js`
- Binary files: images, fonts, compiled binaries
- Large data files: `*.json` > 1000 lines, `*.yaml` > 500 lines

**File Review Priority** (use this to decide what to fetch):
1. **Critical** - Core logic, security-sensitive code:
   - Controllers, services, handlers
   - Authentication, authorization, validation
   - Database queries, API endpoints

2. **Important** - Supporting code:
   - Utilities, helpers
   - Configuration changes
   - Type definitions, interfaces

3. **Nice to check** - Quality assurance:
   - Test files
   - Documentation
   - Build scripts

### 4. Smart Diff Fetching Strategy

**For Small PRs (≤ 10 significant files):**
```bash
# Fetch the full diff (gh pr diff doesn't support per-file filtering)
gh pr diff <number> --repo <owner>/<repo>
```

**For Medium PRs (11-30 significant files):**
First get the list of changed files, then ask the user what to focus on using AskUserQuestion:
```markdown
This PR has X files changed. To avoid context overload, I'll focus on specific areas.
Which would you like me to review in detail?

Options:
- Core logic files (list top 5-7 critical files)
- Test coverage
- Security-sensitive changes
- All files (may hit context limits)
```

Then fetch the full diff once you know the scope.

**For Large PRs (> 30 significant files):**
Always ask the user to specify focus areas. Show them:
- List of changed files grouped by category
- File change statistics
- Suggest focusing on critical/security files first

Then fetch the targeted diff.

**Note**: The `gh pr diff` command returns the complete diff for all changed files. There is no built-in way to filter to specific files. For very large PRs, consider fetching the diff and using the file list to focus your analysis on specific sections.

### 5. Fetch Linked Issues

Parse the PR description for issue references:
- `Fixes #123`, `Closes #456`, `Resolves #789`
- `Related to #111`

For each linked issue:

```bash
# Get issue details
gh issue view <number> --repo <owner>/<repo>

# Only fetch comments if issue is short and relevant
# Skip issue comments for large issues to save context
```

**Understand:**
- What problem should this PR solve?
- What are the acceptance criteria?
- Are there specific requirements mentioned?

### 6. Analyze the Code Changes

Read the modified files (only those selected based on priority) and check for:

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
- **External system contracts**: When code produces data consumed by an external system (Kubernetes operator, controller, webhook, sidecar), verify the external system's expected schema from its source or docs **before** flagging a discrepancy as a bug. If not verified, label the finding **"⚠️ Unverified Integration Assumption"** and place it in Warnings, not Critical.
  - **Names ≠ contracts**: A constant named `BACKUP_ANNOTATIONS` does not mean values live in `metadata.annotations`. A field named `labels` may be read as `attributes` by the consumer. Always trace the actual data path into the external system, not the name on the producer side.

**Code Quality**
- Code clarity and maintainability
- Proper error handling
- Avoiding code duplication
- Following language idioms and project patterns

**Performance**
- Algorithmic complexity
- Database/API query efficiency
- Memory usage
- Unnecessary computations

**Best Practices**
- Test coverage for new code
- Documentation updates
- Breaking changes noted
- Backward compatibility

**Kubernetes Operator Specific** (if applicable)
- Controller reconciliation logic correctness
- Resource status updates
- Event recording
- Finalizer handling
- Watch predicates
- Resource limits and requests

### 7. Cross-Reference with Existing Feedback

Before reporting issues:
- Check if already mentioned in PR comments
- Note if author has addressed previous feedback
- Look for unresolved discussion threads
- Identify what's already approved vs still under discussion

### 8. Provide Structured Feedback

## Review Output Format

### Context Summary
- **PR**: [Title and number]
- **Size**: [X files changed, Y files reviewed in detail]
- **Linked Issues**: [List with brief description]
- **Previous Feedback**: [Summary of what reviewers already caught]

### Does This PR Solve the Issue?
- ✅ or ❌ with explanation
- Are requirements from the issue met?
- Are edge cases covered?

### Critical Issues
*Issues that must be fixed before merge. Any integration-related finding that was NOT verified against the external system's source or docs MUST be labeled "⚠️ Unverified Integration Assumption" and placed in Warnings instead.*
- [Issue with file:line reference and suggested fix]

### Warnings
*Issues that should be fixed*
- [Issue with file:line reference]

### Suggestions
*Nice-to-have improvements*
- [Improvement idea]

### Already Addressed
*Issues that were already discussed/fixed*
- [Note what's already been handled]

### Positive Feedback
*What was done well*
- [Specific examples]

### Skipped Files
*Files not reviewed in detail to save context*
- [List with reason: generated, vendor, etc.]

### Verdict
- ✅ **Approve** - Ready to merge
- 🔄 **Request Changes** - Needs fixes
- 💬 **Comment** - Questions/suggestions but no blocking issues

---

**STANDARD_REVIEW_COMPLETE: `<owner>/<repo>#<number>`** - This marker indicates the standard review is complete for this specific PR. The deep review skill can now be invoked with the same PR URL.

**Example**: `STANDARD_REVIEW_COMPLETE: che-incubator/dash-licenses#32`

## Language-Specific Checks

**Go** (common in Kubernetes operators):
- All errors returned and checked
- Goroutine and channel safety
- Context propagation
- Proper defer usage
- go vet and golint compliance

**Python**:
- Type hints usage
- PEP 8 compliance
- Exception handling
- Security (avoid eval, pickle)

**JavaScript/TypeScript**:
- Async/await vs promises
- Null/undefined handling
- Type safety
- XSS prevention

## Implementation Notes

### Context Management is Critical

**DO:**
- Start with lightweight overview (file list using --name-only)
- Filter out generated/vendor files automatically
- Ask user for guidance on large PRs
- Fetch the full diff for small/medium PRs
- Use the file list to focus your analysis on relevant sections

**DON'T:**
- Don't fetch the diff before getting the file list (start lightweight)
- Don't try to filter `gh pr diff` by file (it doesn't support that)
- Don't load issue comments for huge issues
- Don't review generated code or lock files

### Example Review Flow

```
1. Get PR overview and file list (using --name-only)
2. Filter files (remove locks, vendor, generated)
3. Count significant files
4. IF ≤ 10 files: Fetch the full diff
   ELSE IF ≤ 30 files: Ask user what to focus on, then fetch diff
   ELSE: Show file categories, ask user to choose focus area, then fetch diff
5. Analyze code (focus on relevant sections based on file list)
6. Provide structured feedback
```

## Notes

- Be thorough but constructive
- Provide code examples for suggested fixes
- Reference specific files and line numbers using `file.go:42` format
- Acknowledge good practices and improvements
- Don't repeat what other reviewers already caught (just note it's been addressed)
- Always indicate which files were skipped and why (for transparency)
- **Verify before you flag**: any finding that claims an external system reads/writes data in a specific location must be backed by the external system's source, docs, or tests — not inferred from names or mental models. Unverified integration assumptions that ship as "Critical" cause incorrect fixes that break working behavior.
