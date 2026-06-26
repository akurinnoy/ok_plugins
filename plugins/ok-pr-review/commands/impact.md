---
description: System-level review - supply chain, RBAC, ops, compatibility, evolvability
argument-hint: <pr-url | owner/repo#number>
model: claude-opus-4-6
allowed-tools:
  - Bash
  - Read
  - Write
  - Glob
  - Grep
  - mcp__github__*
---

# PR Impact Review

Review a PR for system-level concerns - operational readiness, security posture, supply chain, compatibility, and evolvability. This command does NOT repeat code-level findings from `/ok-pr-review:review`. It asks: **what does this change mean for the running system, and how well will it survive requirement evolution?**

## Prerequisites

`STANDARD_REVIEW_COMPLETE: <owner>/<repo>#<number>` must appear in conversation history. If not found, abort:

```
❌ Impact review cannot proceed.

/ok-pr-review:review must run first on this PR.
```

## Input

Input: {{args}}

## Process

### 1. Validate and Extract PR Info

Check for `STANDARD_REVIEW_COMPLETE: <owner>/<repo>#<number>`. Extract owner, repo, PR number.

### 2. Load Context

Check `$HOME/.claude/ok-pr-review/repos/{owner}/{repo}/{number}-summary.md`.
- If found: read it. Use the key areas and risks to inform which Tier 2 triggers to pay attention to.
- If not found: continue without it.

Check `$HOME/.claude/ok-pr-review/repos/{owner}/{repo}/profile.md`.
- If found: read it. It provides project type, deployment model, security boundaries, and repo-specific focus areas that sharpen which Tier 2 checks matter most.
- If not found: continue without it. Note the gap in the output.

### 3. Get the Diff

The diff is already in context from `/ok-pr-review:review`. If not available, read from `/tmp/pr-review-{owner}-{repo}-{number}/diff.txt` and `files.txt`.

### 4. Determine Scope

Check `files.txt`: if ALL changed files are `*.md`, `*.rst`, `*.txt`, or under `docs/`, this is a documentation-only PR - skip Tier 1, run no Tier 2 checks, and report "No system-level concerns (documentation-only PR)."

Otherwise, run Tier 1 (always), any triggered Tier 2 checks, and any triggered Tier 3 checks.

### 5. Run Checks

See checklists below.

### 6. Write Findings and Report

Write findings to `$HOME/.claude/ok-pr-review/repos/{owner}/{repo}/{pr-number}-impact.md`.
Create the directory if it doesn't exist:
```bash
mkdir -p "$HOME/.claude/ok-pr-review/repos/{owner}/{repo}"
```

Report the same content to the user.

---

## Tier 1: Always Check

Run for any PR that touches code files.

### Observability

Scan for: new functions, new external calls, new goroutines/async operations, new background workers.

- Errors logged at the right level? (not `fmt.Println`, `console.log`, `print()`)
- Sensitive data (passwords, tokens, PII) NOT in log output?
- New operations emit metrics/traces where the rest of the system already does?
- Structured logging (key-value pairs, not free-form strings)?

### Failure Handling

Scan for: HTTP calls, DB queries, K8s API calls, file I/O, RPC calls.

- Errors surfaced to the caller or handled - not swallowed silently?
- Retry logic where appropriate? Backoff/jitter to avoid thundering herd?
- On partial failure: does the system end up in a consistent state?
- Error messages actionable - not just "something went wrong"?

### Resource Cleanup / Lifecycle

Scan for: goroutine creation, file/connection opens, K8s resource creation.

- Resources released on error paths, not just happy path?
- K8s resources that need external cleanup: finalizer added?
- Goroutines: can they leak (started but never terminated)?
- `defer close/cancel/unlock` called in all code paths?

### Network / Timeouts

Scan for: HTTP client creation, gRPC dialing, DB connection setup, context usage.

- All clients have explicit timeouts? (zero timeout = infinite wait)
- `context.Context` cancellation propagated into all I/O calls?
- TLS verification not disabled (`InsecureSkipVerify`, `verify=False`)?

### Secret Handling

Scan for: K8s Secret reads/writes, env var access, credential construction.

- Secrets not logged, not embedded in images, not passed as CLI args?
- Code only reads secrets it actually needs?
- Secret values not stored in structs/state beyond immediate use?

---

## Tier 2: Trigger-Based

Scan the diff for each trigger. Run the checklist when the trigger fires. Only triggered checks appear in the output.

### Container Supply Chain

**Trigger**: `FROM` in Dockerfile, `image:` in YAML, container image strings in Go/TS source.

- Image pinned by digest or a specific immutable tag? (not `:latest`, `:next`, `:main`)
- Image from a trusted registry? (not arbitrary Docker Hub accounts)
- Multi-stage build: build tools and secrets not leaking into the runtime layer?
- Init containers / sidecars: same provenance standards as the main container?

### Kubernetes RBAC

**Trigger**: `Role`, `ClusterRole`, `RoleBinding`, `ClusterRoleBinding`, `ServiceAccount`, `rbac.authorization.k8s.io` in diff.

- Only permissions the code actually exercises? (not copied from a broader template)
- Namespace-scoped where possible; cluster-scoped only when strictly needed?
- Secrets access: does the controller actually need to read/write secrets?
- Dedicated `ServiceAccount`, not the `default` SA?

### State Management

**Trigger**: Redux keywords (`createSlice`, `store.dispatch`, `createAsyncThunk`, `useSelector`, `useDispatch`), `useReducer`, `setState`, `useState` with complex state.

- Race conditions from concurrent dispatches to the same slice?
- Effects and subscriptions cleaned up on unmount?
- State that should survive page refresh: actually persisted?
- Failed async operations: does the store end up in a consistent state, or stuck in `loading`?

### API Endpoints

**Trigger**: `router.`, `app.get/post/put/delete/patch`, `@Route`, `@Controller`, `http.Handle`, `HandleFunc`, `mux.Handle` in diff.

- Auth required on every new endpoint?
- Input validated and sanitized at the boundary?
- Error responses don't expose stack traces or internal details?
- Rate limiting considered for public or high-traffic endpoints?

### Database / Data Access

**Trigger**: `SELECT`, `INSERT`, `UPDATE`, `DELETE`, `db.query`, `.execute(`, migration files, schema changes.

- Parameterized queries, not string concatenation?
- Transaction boundaries correct for the operation?
- Migration: reversible? Down migration exists?
- Large-table operations: index impact, lock duration during migration?

### New Dependencies

**Trigger**: `go.sum` changed, `package.json` dependencies changed, `requirements.txt` / `Pipfile` changed, `pom.xml` dependencies changed.

- Dependency actively maintained? (recent commits, not archived)
- Necessary? Or is a standard library function available?
- License compatible with the project?
- Known CVEs? (note if the project runs automated dependency scanning)

### Backward / API Compatibility

**Trigger**: exported function/type signatures changed, CRD schema changed, config struct changed, CLI flags changed, REST API shape changed.

- Existing clients and callers won't break on upgrade?
- CRD schema change backward compatible? (adding a required field without a default breaks existing CRs)
- Breaking changes documented, with migration path?
- K8s operator: conversion webhook needed for a schema version bump?

### K8s Operator Specifics

**Trigger**: reconciler functions changed, `status` subresource writes, event recording, watch/informer setup.

- Status conditions set consistently: `type`, `status`, `reason`, `message` all populated?
- Events recorded for meaningful state transitions (not every reconcile tick)?
- Generation check (`observedGeneration`) prevents infinite reconcile on status-only writes?
- Watch predicates filter correctly - reconcile not triggered by irrelevant changes?
- Owner references set so child resources are garbage-collected when the parent is deleted?

### Configuration

**Trigger**: new env vars, new config struct fields, new CLI flags, new feature flags, new annotation/label keys.

- Invalid config detected at startup, not silently ignored at runtime?
- Defaults safe and documented?
- Required fields clearly documented (and validated)?

### PII / Data Compliance

**Trigger**: user-identifiable data stored, logged, or transmitted; personal identifiers in DB schema; email, name, or ID fields in new structs.

- PII fields identified and handled with appropriate care?
- Data not retained longer than needed?
- Sensitive operations produce an audit trail?

---

## Tier 3: Evolvability

Assess how well the changes will survive natural requirement evolution — slight scope shifts, new variants, extended capabilities. This is NOT about current code quality (that's deep-review's job). It asks: **if requirements change next quarter, will this code bend or break?**

Scan the diff for each trigger. Run the checklist when the trigger fires. Only triggered checks appear in the output.

### Assumption Fragility

**Trigger**: new `switch`/`case` or `if/else if` chains on types/enums/strings, hardcoded lists or maps, magic numbers, fixed-size arrays for domain concepts, string-matched constants.

- Hardcoded values that would require a code change if a new variant is added? (e.g., `if role == "admin" || role == "editor"` instead of checking against a role set)
- Implicit cardinality assumptions? (e.g., "there's always exactly one X", single-element destructuring)
- `switch` without `default` or exhaustiveness check on values that could grow?
- Magic numbers or thresholds embedded in logic without named constants or configuration?
- String-matched identifiers that would silently fail if the source value changes? (e.g., `if name == "prod-cluster"`)

### Extension Cost

**Trigger**: new domain types/interfaces/structs, new API endpoints or handlers, new enum values or union types, new conditional branches based on business concepts.

- If this feature needed one more variant/option/mode, how many files would change? Flag if > 3.
- Is new behavior added through extension (new implementations, new handlers) or by modifying existing code paths (adding branches to existing functions)?
- Are there parallel structures (multiple places that must stay in sync when a variant is added)? Flag if the same concept is listed in > 2 places.
- Could a new case be added without modifying existing passing tests?

### Data Model Flexibility

**Trigger**: new DB columns/tables, schema migrations, new struct/type definitions with validation, CRD schema changes, API request/response shape changes.

- Closed enums used for concepts that are inherently open-ended? (e.g., `type: "email" | "sms"` for a notification channel that will likely grow)
- Required fields without defaults that would force a migration for every extension?
- Rigid validation that rejects unknown fields, preventing additive evolution?
- Schema tightly coupled to a single use case, or general enough for adjacent ones?

### Configuration vs. Code

**Trigger**: new thresholds, limits, timeouts, feature lists, display text, URLs, retry counts, batch sizes, or policy decisions embedded in source code.

- Values likely to change with business needs (limits, thresholds, feature sets) externalized to config?
- Policy decisions (who can do what, what triggers what) expressed as data/config or hardcoded in logic?
- Would a product manager's "just change the limit" request require a deploy?

### Requirement Sensitivity ("What If" Scenarios)

**Trigger**: always runs when any other Tier 3 check is triggered.

Generate 2-3 plausible "what if" scenarios based on what the PR actually does. For each, assess the change effort.

Examples of good scenarios:
- "What if this list grows from 3 items to 30?"
- "What if this needs to support a second provider/backend?"
- "What if this feature becomes user-configurable instead of admin-only?"
- "What if this needs to work across multiple tenants/namespaces?"
- "What if the current synchronous flow needs to become async?"

For each scenario, classify:
- **Config change**: no code change needed, just config/env update
- **Small addition**: a new file or a few lines in 1-2 files, no architectural change
- **Moderate change**: touches 3-5 files, may need new interfaces or abstractions
- **Significant rewrite**: architectural change, new patterns, broad refactoring required

Flag any scenario rated "Significant rewrite" that represents a plausible near-term requirement.

### Coupling to Current Requirements

**Trigger**: new business logic, new workflow steps, new conditional paths based on business rules, feature flag implementations.

- Does the code encode the current requirement literally, or the pattern behind it?
- Business logic mixed into infrastructure/transport/UI layers where it can't be reused or independently evolved?
- Feature flags that are temporary but lack a removal path (no cleanup TODO, no expiry)?
- Domain concepts spread across layers (same business rule enforced in UI, API, and DB) without a single source of truth?

---

## Output Format

```markdown
## Impact Review: [PR Title] (#[number])

### Domain Context
- **Profile**: [loaded / not available - run /ok-pr-review:learn-repo {owner}/{repo}]
- **Tier 2 checks triggered**: [list with trigger reason]

### Tier 1: Operational Readiness

**Observability**: [findings, or "No issues"]
**Failure handling**: [findings, or "No issues"]
**Resource cleanup**: [findings, or "No issues"]
**Network / timeouts**: [findings, or "No issues"]
**Secret handling**: [findings, or "No issues"]

### Tier 2: Domain-Specific Findings

*(Only triggered domains appear here)*

#### [Domain name]
[Findings with file:line references, or "Looks good"]

### Tier 3: Evolvability

*(Only triggered checks appear here. Omit entire section if no Tier 3 triggers fire.)*

**Assumption Fragility**: [findings, or "No fragile assumptions detected"]
**Extension Cost**: [findings, or "Changes are well-isolated"]
**Data Model Flexibility**: [findings, or "Schema accommodates growth"]
**Configuration vs. Code**: [findings, or "Tunable values externalized"]
**Coupling to Current Requirements**: [findings, or "Logic is pattern-based, not literal"]

#### "What If" Scenarios

| Scenario | Impact | Effort |
|----------|--------|--------|
| [plausible evolution] | [what changes] | Config / Small / Moderate / Significant |
| [plausible evolution] | [what changes] | Config / Small / Moderate / Significant |

### Verdict
- ✅ **No concerns**
- ⚠️ **Concerns** - Issues that should be addressed before merge
- ❌ **Blockers** - Must fix: security gap, data loss risk, or breaking change
```

---

**IMPACT_REVIEW_COMPLETE: `<owner>/<repo>#<number>`**
