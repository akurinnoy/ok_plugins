---
name: ok-prerelease-verification
description: Generates manual step-by-step verification instructions for confirming a specific GitHub PR fix is correctly included in a DWO prerelease build. Takes a GitHub PR URL as input and produces a ready-to-run checklist for the user to execute in their terminal.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - WebFetch
  - AskUserQuestion
  - mcp__plugin_github_github__pull_request_read
  - mcp__plugin_github_github__issue_read
  - mcp__plugin_github_github__get_file_contents
  - mcp__plugin_github_github__list_commits
---

# Pre-Release Issue Verification Skill

You generate manual, ready-to-run verification checklists for DWO prerelease testing. The user will execute the steps themselves in their terminal — you do NOT run anything on the cluster.

## Expected Input

A GitHub PR URL, e.g.:
- `https://github.com/devfile/devworkspace-operator/pull/1572`

## Process

### 1. Extract PR Metadata

From the URL, extract: owner, repo, PR number.

Fetch the PR to understand the fix:
```bash
gh pr view <number> --repo <owner>/<repo>
gh pr view <number> --repo <owner>/<repo> --json title,body,files,baseRefName --jq '{title, body, base: .baseRefName, files: [.files[].path]}'
```

Look for:
- Linked issue(s) (`Fixes #NNN`, `Closes #NNN`, `Resolves #NNN`)
- Which files changed
- PR description — what problem does this fix?

### 2. Read the Linked Issue

If there is a linked issue, fetch it:
```bash
gh issue view <number> --repo <owner>/<repo>
```

Understand the original bug or feature request:
- What was the broken behavior?
- What is the expected fixed behavior?
- Are there reproduction steps?

### 3. Understand the Code Changes

Fetch the diff for changed files (filter out `vendor/`, `go.sum`, generated files):
```bash
gh pr diff <number> --repo <owner>/<repo>
```

Read relevant local source files if needed:
- Use `Read` tool to read files in the local repo at `/Users/okurinny/Workspace/devfile/devworkspace-operator/`
- Use `Grep` to find related code patterns

**Determine the verification criteria — answer these questions:**

1. **What Kubernetes resource changed?**
   - New init container added to workspace Deployment?
   - New ownerReference on a RBAC resource?
   - New label/annotation on a resource?
   - Changed controller behavior (e.g., skip a step, handle an edge case)?

2. **What should exist (or NOT exist) after the fix?**
   - A resource field that wasn't there before
   - Absence of an error log
   - Absence of a Kubernetes resource that used to be left behind

3. **What DevWorkspace configuration triggers the fix?**
   - A specific attribute (e.g., `controller.devfile.io/restore-workspace: 'true'`)
   - A specific workspace state (e.g., stopped workspace with no PVC)
   - A specific annotation or label

4. **Log verbosity check**: Does the changed controller logger use `.V(1)`?
   - Search: `Grep` for `.V(1)` near the changed logger
   - If yes: Info-level log messages are invisible at default log verbosity.
     Verification must check absence of errors or absence of side effects, NOT presence of info messages.

### 4. Generate the Verification Checklist

Produce a numbered, copy-pasteable checklist. Each step must be a concrete terminal command or a specific observation to make. Do NOT write generic placeholders — every command must have the actual resource names, namespaces, and expected values filled in.

## Output Format

```
## Pre-Release Verification: PR #<NUM> — <PR Title>

**Issue**: <linked issue title and number, or "N/A">
**What was fixed**: <one sentence>
**Verification approach**: <one sentence — what you're checking for>

---

### Step 1: Confirm Pre-Release DWO is Running

```bash
oc get deploy -n openshift-operators devworkspace-controller-manager
```
Expected: deployment exists and is Available.

---

### Step 2: Create Test Namespace

```bash
oc new-project issue-<NUM>
```

---

### Step 3: [Optional - only if relevant] Set Up Internal Registry

<include ONLY if the fix involves image push/pull>

```bash
oc patch configs.imageregistry.operator.openshift.io/cluster \
  --type=merge -p '{"spec":{"defaultRoute":true}}'
REGISTRY=$(oc get route default-route -n openshift-image-registry \
  -o jsonpath='{.spec.host}')
podman login -u $(oc whoami) -p $(oc whoami -t) "$REGISTRY"
```

---

### Step 4: Apply Test Workload

<provide the exact YAML or oc apply command>

**fish shell note**: Use `oc apply -f <file>` instead of `<<EOF` heredocs.

```bash
# Option A: use an existing sample
oc apply -f samples/<relevant>.yaml -n issue-<NUM>

# Option B: write inline YAML to a temp file, then apply
cat > /tmp/test-dw.yaml << 'EOF'
<minimal DevWorkspace YAML with required attributes>
EOF
oc apply -f /tmp/test-dw.yaml -n issue-<NUM>
```

---

### Step 5: Trigger the Relevant Behavior

<start/stop the workspace or wait as appropriate>

```bash
oc patch dw <name> -n issue-<NUM> --type merge -p '{"spec":{"started":true}}'
# Wait for workspace to reach Running phase:
oc get dw -n issue-<NUM> -w
```

---

### Step 6: Verify the Fix

<one or more specific verification commands with expected output>

```bash
<command to check for the fixed behavior>
# Expected: <what the user should see>
```

---

### Step 7: Verify No Regression

<optional: a second DevWorkspace with a normal config to confirm nothing is broken>

---

### Step 8: Clean Up

```bash
oc delete project issue-<NUM>
```
```

## Key Rules for Output

- Every command must be copy-pasteable as-is (no `<placeholder>` left unresolved)
- Include the actual namespace (`issue-<NUM>` with the real number)
- Include actual resource names from the PR
- Do NOT include registry steps unless the issue actually involves image push/pull
- If log verbosity is V(1), explicitly tell the user: "Info-level messages will NOT appear in logs — verify by absence of error messages and absence of unexpected resources"
- Keep it short enough to read in 2 minutes; detailed enough to execute without thinking

## Reference

The verification methodology is documented at:
`/Users/okurinny/.claude/knowledge/repos/devworkspace-operator/patterns/prerelease-issue-verification.md`

Read it at the start if you need to refresh the methodology or gotchas.
