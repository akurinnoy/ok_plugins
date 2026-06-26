# ok-prerelease-verification

Tools for verifying DWO (DevWorkspace Operator) prerelease builds against GitHub PRs.

## Skills

### ok-prerelease-verification

Generates manual, copy-pasteable verification checklists for confirming a specific GitHub PR fix is correctly included in a DWO prerelease build.

```
/ok-prerelease-verification https://github.com/devfile/devworkspace-operator/pull/123
```

Given a PR URL, the skill:

1. Fetches PR metadata and linked issues
2. Reads the code diff to understand what changed
3. Determines the verification criteria (what Kubernetes resources changed, what should exist after the fix)
4. Generates a numbered, ready-to-run checklist with concrete `oc` commands

The output is designed to be executed manually in your terminal against a cluster running the prerelease build.

### ok-pr-readiness

Assesses whether a GitHub PR has sufficient information to reproduce and verify its changes. Produces a structured readiness report with pass/fail verdicts.

```
/ok-pr-readiness https://github.com/devfile/devworkspace-operator/pull/123
```

Given a PR URL, the skill:

1. Fetches PR metadata, linked issues, and the diff
2. Evaluates 6 readiness criteria: problem statement, reproduction steps, expected behavior, scope of changes, test evidence, and deployment notes
3. Assigns PASS / WARN / FAIL per criterion
4. Produces an overall verdict (READY / NEEDS WORK / NOT READY) with actionable feedback

Use this before `ok-prerelease-verification` — if the PR lacks key information, verification instructions will have gaps.

## Installation

```
/plugin install ok-prerelease-verification@ok-plugins
```
