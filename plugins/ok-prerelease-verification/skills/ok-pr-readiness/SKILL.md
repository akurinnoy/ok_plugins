---
name: ok-pr-readiness
description: Use when assessing whether a GitHub PR has sufficient information to reproduce and verify its changes. Checks for linked issues, reproduction steps, expected behavior, test evidence, and deployment notes. Takes a GitHub PR URL as input and produces a readiness report with pass/fail verdicts per criterion.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - WebFetch
  - mcp__plugin_github_github__pull_request_read
  - mcp__plugin_github_github__issue_read
  - mcp__plugin_github_github__get_file_contents
  - mcp__plugin_github_github__list_commits
---

# PR Readiness Assessment

You assess whether a GitHub PR contains enough information for someone to reproduce the problem and verify the fix. You produce a structured readiness report — you do NOT generate verification steps.

## Expected Input

A GitHub PR URL, e.g.:
- `https://github.com/<owner>/<repo>/pull/123`

## Process

### 1. Fetch PR Data

Extract owner, repo, PR number from the URL.

```bash
gh pr view <number> --repo <owner>/<repo> --json title,body,files,baseRefName,labels,comments --jq '{title, body, base: .baseRefName, files: [.files[].path], labels: [.labels[].name], commentCount: (.comments | length)}'
```

Look for linked issues (`Fixes #NNN`, `Closes #NNN`, `Resolves #NNN`) in the PR body.

### 2. Fetch Linked Issue (if any)

```bash
gh issue view <number> --repo <owner>/<repo>
```

### 3. Fetch the Diff

```bash
gh pr diff <number> --repo <owner>/<repo>
```

### 4. Evaluate Readiness Criteria

Assess each criterion below. For each one, assign a verdict:
- **PASS** — information is present and sufficient
- **WARN** — partially present or ambiguous
- **FAIL** — missing entirely

#### Criterion 1: Problem Statement

Is it clear what problem the PR solves?

Look for:
- PR description explains the bug or feature
- Linked issue describes the broken/missing behavior
- Clear "before" state (what was wrong)

FAIL if: neither the PR body nor the linked issue describes what was wrong.

#### Criterion 2: Reproduction Steps

Can someone reproduce the original problem?

Look for:
- Steps to trigger the bug (in PR body or linked issue)
- Required environment, configuration, or prerequisites
- Specific input data, config files, or resource definitions needed

WARN if: reproduction is implied but not explicit (e.g., "when using feature X" without exact config).
FAIL if: no reproduction path is described anywhere.

#### Criterion 3: Expected Behavior After Fix

Is the desired outcome clearly stated?

Look for:
- What should happen after applying the fix
- Observable changes (new resource fields, log entries, absence of errors)
- Acceptance criteria or definition of done

FAIL if: there is no description of what "fixed" looks like.

#### Criterion 4: Scope of Changes

Can a reviewer understand what changed and why?

Look for:
- File count and change size relative to description detail
- Non-obvious changes explained (e.g., why a seemingly unrelated file was touched)
- Generated/vendored files separated from logic changes

WARN if: large diff with minimal explanation.
FAIL if: changes touch multiple subsystems with no rationale.

#### Criterion 5: Test Evidence

Is there evidence that the fix works?

Look for:
- New or updated unit/integration tests in the diff
- Test results mentioned in PR comments or description
- Manual testing notes with commands and outputs
- Screenshots or logs showing fixed behavior

WARN if: only unit tests added for a behavior change that warrants integration/manual testing.
FAIL if: no tests and no manual testing evidence.

#### Criterion 6: Deployment and Verification Notes

Can someone verify this fix in a real environment?

Look for:
- Which components or services are affected
- What to observe after deploying (specific commands, UI checks, or observable states)
- Any special environment configuration or feature flags required
- Migration steps or backwards-compatibility considerations

WARN if: some deployment context is present but incomplete.
FAIL if: a behavior change has zero verification guidance.

## Output Format

```
## PR Readiness Assessment: PR #<NUM> — <PR Title>

**Repository**: <owner>/<repo>
**Linked Issue**: <issue number and title, or "None found">

---

| # | Criterion | Verdict | Notes |
|---|-----------|---------|-------|
| 1 | Problem Statement | PASS/WARN/FAIL | <brief note> |
| 2 | Reproduction Steps | PASS/WARN/FAIL | <brief note> |
| 3 | Expected Behavior After Fix | PASS/WARN/FAIL | <brief note> |
| 4 | Scope of Changes | PASS/WARN/FAIL | <brief note> |
| 5 | Test Evidence | PASS/WARN/FAIL | <brief note> |
| 6 | Deployment & Verification Notes | PASS/WARN/FAIL | <brief note> |

**Overall**: READY / NEEDS WORK / NOT READY

---

### Missing Information

<bulleted list of specific information the PR author should add, phrased as actionable requests>

### What's Good

<bulleted list of things the PR already does well>
```

## Verdict Logic

- **READY**: All criteria PASS, or at most one WARN with no FAILs
- **NEEDS WORK**: One or more WARNs but no FAILs, or exactly one FAIL on a non-critical criterion (Criterion 4 or 6)
- **NOT READY**: Two or more FAILs, or any FAIL on Criterion 1, 2, or 3

## Key Rules

- Be specific in the "Missing Information" section — don't say "add reproduction steps", say "describe the exact configuration and environment state needed to trigger the bug"
- Credit what the PR does well — readiness assessment is constructive, not punitive
- If the PR is a trivial fix (typo, dependency bump, generated code update), relax Criteria 2 and 5 — not every change needs reproduction steps or test evidence
- For refactoring PRs with no behavior change, Criterion 3 becomes "confirm no behavior change" rather than "describe new behavior"
