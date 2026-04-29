---
description: Study a repository and write a domain profile
argument-hint: <repo-url | owner/repo>
model: sonnet
allowed-tools:
  - Bash
  - Read
  - Write
  - Glob
  - Grep
  - mcp__github__get_file_contents
  - mcp__github__search_code
---

# Repository Domain Learning

Study a repository and write a `profile.md` that captures what a reviewer needs to know: what the project does, where it runs, how it is secured, and what to watch for in code reviews. This profile is consumed by `/ok-pr-review:review`, `/ok-pr-review:deep-review`, and `/ok-pr-review:impact` to add system-level context to their analysis.

## Input

Input: {{args}}

Accept one of:
- GitHub URL: `https://github.com/owner/repo`
- Shorthand: `owner/repo`

## Process

### 1. Extract Owner and Repo

Parse `owner` and `repo` from the URL or shorthand.

### 2. Check for Existing Profile

Look for `$HOME/.claude/ok-pr-review/repos/{owner}/{repo}/profile.md`.

If it exists, read it and show the user:
```
Profile found for {owner}/{repo} (last updated: YYYY-MM-DD).
Regenerate, merge with new findings, or keep existing?
```
- **Keep**: show the existing profile, done.
- **Regenerate**: proceed and overwrite.
- **Merge**: regenerate, show what changed, let user decide what to keep.

### 3. Fetch Key Files

Fetch in parallel. Use `gh` CLI (preferred) or GitHub MCP if `gh` is unavailable.

```bash
# Repo metadata
gh api "repos/{owner}/{repo}" --jq '{name, description, language, topics, defaultBranch}'

# Purpose and overview
gh api "repos/{owner}/{repo}/contents/README.md" --jq '.content' | base64 -d

# Stack detection (each may 404 - suppress errors)
gh api "repos/{owner}/{repo}/contents/go.mod"          --jq '.content' | base64 -d 2>/dev/null
gh api "repos/{owner}/{repo}/contents/package.json"    --jq '.content' | base64 -d 2>/dev/null
gh api "repos/{owner}/{repo}/contents/requirements.txt" --jq '.content' | base64 -d 2>/dev/null
gh api "repos/{owner}/{repo}/contents/pom.xml"         --jq '.content' | base64 -d 2>/dev/null

# Container / deployment
gh api "repos/{owner}/{repo}/contents/Dockerfile"      --jq '.content' | base64 -d 2>/dev/null
gh api "repos/{owner}/{repo}/contents/Containerfile"   --jq '.content' | base64 -d 2>/dev/null

# Top-level directory listing (to find config/, deploy/, helm/, manifests/, etc.)
gh api "repos/{owner}/{repo}/contents" --jq '[.[] | {name, type}]'

# CI/CD
gh api "repos/{owner}/{repo}/contents/Makefile"        --jq '.content' | base64 -d 2>/dev/null
gh api "repos/{owner}/{repo}/contents/.github/workflows" --jq '[.[] | .name]' 2>/dev/null
```

Also look for:
- `cmd/` or `main.go` - Go entry points
- `src/index.*` or `src/main.*` - JS/TS entry points
- CRD YAML files (`*_crd.yaml`, `config/crd/`)
- Helm charts (`Chart.yaml`, `values.yaml`)

**Fetch only what exists and what's meaningful.** A README + top-level layout + language manifest is enough for a solid profile. Don't deep-dive into source files.

### 4. Analyze

From the fetched content, determine:

- **Project type**: K8s operator / web dashboard / CLI tool / library / service / plugin / other
- **Language + framework**: Go + controller-runtime, TypeScript + React/Redux, Python + Django, etc.
- **Deployment model**: where it runs - K8s cluster, browser, CI runner, standalone binary, npm package
- **Container setup**: base image, multi-stage build, registries used
- **State management**: Redux store, etcd via K8s API, PostgreSQL, in-memory, none
- **Security model**: auth mechanism (RBAC, OAuth, JWT, API keys, none), secret storage, network topology
- **Key integration points**: external systems and what data flows between them
- **Review focus areas**: sensitive code paths, known architectural constraints, things a reviewer should specifically watch for in this repo

### 5. Write Profile

Show the draft profile to the user and ask for corrections or additions before writing.

Create the directory and write:
```bash
mkdir -p "$HOME/.claude/ok-pr-review/repos/{owner}/{repo}"
```

Write to `$HOME/.claude/ok-pr-review/repos/{owner}/{repo}/profile.md`.

Print the full path when done.

---

## Profile Format

```markdown
---
repo: owner/repo
updated: YYYY-MM-DD
---

## Project
- **Type**: K8s operator / web dashboard / CLI tool / library
- **Language**: Go / TypeScript / Python
- **Framework**: controller-runtime / React+Redux / Django
- **Purpose**: one-line description

## Deployment
- **Target**: K8s cluster / browser / CI runner / standalone binary
- **Container**: base image, multi-stage build, registry
- **Orchestration**: operator-managed / Helm / raw manifests / none

## Architecture
- **Pattern**: reconciliation loop / SPA+API / event-driven
- **State**: Redux store / etcd via K8s API / PostgreSQL / in-memory
- **Key components**:
  - `ComponentA` - what it does
  - `ComponentB` - what it does
  - (list 5-7 most important)

## Security Model
- **Auth**: K8s RBAC / OAuth / JWT / API keys / none
- **Secrets**: K8s Secrets / env vars / Vault / config files
- **Network**: service mesh / ingress / network policies / direct
- **Sensitive areas**: [code paths handling auth, secrets, PII - be specific]

## Integration Points
- **[System name]**: what data flows, in what format, where to look to verify contracts

## Review Focus Areas
- [Specific things to watch for when reviewing PRs in this repo]
- [Known footguns, past issues, architectural constraints]
```
