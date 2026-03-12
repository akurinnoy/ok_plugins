# ok-prerelease-verification

Generates manual, copy-pasteable verification checklists for confirming a specific GitHub PR fix is correctly included in a DWO (DevWorkspace Operator) prerelease build.

## Usage

```
/ok-prerelease-verification https://github.com/devfile/devworkspace-operator/pull/1572
```

## What It Does

Given a PR URL, the skill:

1. Fetches PR metadata and linked issues
2. Reads the code diff to understand what changed
3. Determines the verification criteria (what Kubernetes resources changed, what should exist after the fix)
4. Generates a numbered, ready-to-run checklist with concrete `oc` commands

The output is designed to be executed manually in your terminal against a cluster running the prerelease build.

## Installation

```
/plugin install ok-prerelease-verification@ok-plugins
```
