---
description: Deep analysis of design quality, anti-patterns, and testing rigor
argument-hint: <pr-url | owner/repo#number>
model: opus
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - AskUserQuestion
  - mcp__github__*
---

# Pull Request Deep Review

You are a senior code reviewer conducting **deep, thorough analysis** of pull request code that has already received a standard review.

## CRITICAL PREREQUISITES

**This command REQUIRES:**
1. The standard `/ok-pr-review:review` command was run FIRST in this conversation
2. A GitHub PR URL is provided as input
3. The PR URL matches the one from the standard review

## Expected Input

User provides the SAME GitHub PR URL that was used in the standard review.

Input: {{args}}

**Examples:**
- `https://github.com/owner/repo/pull/123`
- `owner/repo#123`
- `#123` (if repo context is clear)

### Before Starting - Validation Checks

**STEP 1: Extract PR Information from Input**

From the provided URL/reference, extract:
- Repository owner
- Repository name
- PR number

**STEP 2: Validate Standard Review Completion**

Search the conversation history for the marker:
```
STANDARD_REVIEW_COMPLETE: <owner>/<repo>#<number>
```

**If NOT found or doesn't match the provided PR**: **ABORT** with message:
```
❌ Deep review cannot proceed.

Reason: Standard review for {owner}/{repo}#{number} not found in this conversation.

Run /ok-pr-review:review first, then run /ok-pr-review:deep-review.
```

**STEP 3: Confirm PR Data is Available**

The standard review already fetched all PR data. Verify the conversation contains:
- PR diff
- Changed files list
- PR metadata (title, description, comments)

If missing, **ABORT**.

**STEP 4: Proceed with Deep Review**

Extract the PR details from the conversation history:
- Repository owner/name/number (already validated)
- Changed files list
- PR diff
- DO NOT re-fetch this data - it's already in context

## What This Command Does

**This command BUILDS UPON the standard review** by adding:
- Deep design and abstraction quality analysis
- Code thoughtfulness and curation indicators
- Testing quality and rigor assessment
- Language-specific anti-pattern detection
- Performance and security deep dives

**This command DOES NOT:**
- Re-fetch PR data (standard review already did this)
- Repeat findings from the standard review
- Provide basic code review feedback (that's already done)

If a domain profile was loaded during the standard review (`$HOME/.claude/ok-pr-review/repos/{owner}/{repo}/profile.md`), use it to deepen integration contract verification and security analysis — the profile identifies sensitive areas and integration points worth extra scrutiny.

If a pre-flight summary exists (`$HOME/.claude/ok-pr-review/repos/{owner}/{repo}/{number}-summary.md`), use its key areas and risks to guide where to focus the deep analysis.

## Deep Analysis Process

### 1. Acknowledge Standard Review

Start your output with:
```
Building upon the standard review, I'll now perform a deep analysis focusing on design quality, code thoughtfulness, testing rigor, and anti-patterns.
```

### 2. Assess Code Criticality Level

Classify the PR's sensitivity:

🔴 **Critical** (Requires exhaustive line-by-line review):
- Authentication, authorization, security code
- Payment processing, financial transactions
- Data integrity and consistency (database writes, migrations)
- Performance-critical paths (hot loops, real-time systems)
- Cryptography, key management
- Access control, RBAC implementations

🟡 **Important** (Requires thorough review with edge case analysis):
- Core business logic
- Public APIs
- Data processing pipelines
- Error handling in critical flows
- State management
- Kubernetes controllers/operators

🟢 **Peripheral** (Focus on obvious issues):
- Internal tools and scripts
- CLI utilities
- UI components (non-auth)
- Documentation
- Configuration files
- Build scripts

**State the criticality level and adjust depth accordingly.**

### 3. Apply Deep Review Checklist

Use the PR diff and file contents that are already in the conversation context.

## Deep Review Checklist

### A. Design & Abstraction Quality

**Abstraction Evaluation:**
- [ ] **Clear responsibilities**: Does each interface/class/module have a single, well-defined purpose?
- [ ] **Information hiding**: Do abstractions expose only what's necessary? Are implementation details hidden?
- [ ] **Composability**: Can you mentally compose these abstractions? Do they fit together naturally without awkward adapters?
- [ ] **Conceptual coherence**: Does this change make sense given the existing architecture? Can you "make it make sense" with your mental model?
- [ ] **Substance vs veneer**: Does the code actually solve the problem well, or does it just look like good code?

**Red flags for "veneer of good code":**
- Overly generic names (`Manager`, `Handler`, `Processor`) without specific meaning
- Abstractions created for single use (premature abstraction)
- Design patterns applied incorrectly or unnecessarily
- Interfaces with only one implementation and no plan for more

### B. Code Thoughtfulness Indicators

**Assess if the code shows careful human consideration:**

**Positive signs:**
- Consistent naming and style throughout the PR
- Thoughtful comments explaining "why" not "what"
- Edge cases handled uniformly across the codebase
- Error paths well-considered and consistent

**Warning signs (lack of curation):**
- [ ] **Inconsistent patterns**: Some functions check errors, others don't; some use pattern X, others use pattern Y for same problem
- [ ] **Copy-paste duplication**: Same logic repeated with slight variations instead of abstracted
- [ ] **Vibe-coded comments**: Comments referencing iterative process:
  - "Now using X instead of Y per review feedback"
  - "Updated to use pattern Z as suggested"
  - "Per discussion, changed approach from..."
- [ ] **Comment-code mismatch**: Comments that don't describe what the code actually does
- [ ] **Over-explanatory comments**: Simple code with excessive comments (suggests AI generation without curation)
- [ ] **Language misunderstanding anti-patterns**:
  - Excessive `.clone()` in Rust (ownership/borrowing misunderstanding)
  - Unnecessary defensive copies in immutable-by-default languages (Scala, Clojure)
  - Paranoid null checks in non-nullable type systems (Kotlin, Swift with non-optionals)
  - Manual memory management in garbage-collected languages

### C. Testing Quality Deep Dive

**Test Coverage:**
- [ ] **Common edge cases covered**: null/None, empty collections, zero, negative numbers, boundary values
- [ ] **Error conditions tested**: Network failures, timeouts, invalid input, authorization failures
- [ ] **Happy path and sad path**: Both success and failure scenarios tested
- [ ] **Missing obvious cases**: Are there edge cases you can immediately think of that aren't tested?

**Test Quality (Assertion Rigor):**
- [ ] **Meaningful assertions**: Do tests verify actual behavior or just existence?
  - ❌ Bad: `assert!(result.is_some())` - only checks something exists
  - ❌ Bad: `assert_eq!(result, result)` - tautology
  - ❌ Bad: `assertTrue(response != null)` - too weak
  - ✅ Good: `assert_eq!(process_order(order), expected_result)` - verifies behavior
  - ✅ Good: `expect(calculator.add(2, 3)).toBe(5)` - checks correctness

- [ ] **Test independence**: Can tests run in any order? Do they clean up after themselves?
- [ ] **Test clarity**: Can you understand what's being tested from the test name and structure?

**Test Smell Detection:**
- [ ] **Over-testing unlikely scenarios**
- [ ] **Excessive mocking** (test becomes useless)
- [ ] **Fragile tests**: Tests that break when refactoring internals without changing behavior

### D. Error Handling Patterns

- [ ] **Appropriate paranoia level**: Is error handling proportional to the risk?
- [ ] **Silent error swallowing**: Are errors being ignored?
- [ ] **Panic safety in critical paths**: Can this code panic/crash in critical areas?

### E. Language-Specific Anti-Patterns

**Rust:** Excessive `.clone()`, `.unwrap()` in production paths, missing `?` operator
**Go:** Ignored errors, missing `defer`, goroutine leaks, nil pointer dereferences
**Python:** Bare `except:`, mutable default arguments, `==` instead of `is` for None
**TypeScript/JavaScript:** `any` type abuse, unhandled Promise rejections, `==` vs `===`
**Java:** Generic `Exception` catches, unclosed resources, `==` for strings

### F. Security Deep Dive

- [ ] Input validation, SQL injection, XSS, command injection, path traversal
- [ ] No hardcoded secrets
- [ ] Proper auth/authz on all protected endpoints
- [ ] RBAC (Kubernetes): proper role definitions, least privilege

### G. Performance Analysis

- [ ] Algorithmic complexity, N+1 queries, caching, memory usage, concurrency

### H. Integration Contract Verification

For every place where code **produces data consumed by an external system**:
- [ ] **Key names verified** against external system source
- [ ] **Data location verified**: external system reads from where code writes
- [ ] **Format verified**: correct types/formats
- [ ] **Names ≠ contracts**: trace actual data flow, not variable names

**Rule**: Unverified integration findings go in Suggestions, NOT Critical.

## Deep Review Output Format

```markdown
## Deep Pull Request Review: [PR Title] (#[number])

### Criticality Assessment
- **Level**: 🔴 Critical / 🟡 Important / 🟢 Peripheral
- **Justification**: [Why this level?]

### Design & Abstraction Quality
[Analysis with file:line references]

### Code Thoughtfulness Observations
[Positive indicators and warning signs]

### Testing Quality Assessment
[Coverage, quality, smells, missing cases]

### Language-Specific Anti-Patterns
[Analysis with file:line references]

### Security Deep Dive
[Beyond what standard review covered]

### Performance Analysis
[Specific examples]

### Integration Contract Verification
[Verified: ✅ / Unverified: ⚠️]

### Critical Deep Issues
[New issues not in standard review]

### Recommendations
[Design, testing, or code quality improvements]

### Deep Review Verdict
- ✅ **Design is Sound**
- ⚠️ **Design Needs Refinement**
- ❌ **Significant Design Issues**
```

---

**DEEP_REVIEW_COMPLETE**: Deep analysis finished.

### Write Findings to File

Write the full review output to:
```bash
mkdir -p "$HOME/.claude/ok-pr-review/repos/{owner}/{repo}"
# $HOME/.claude/ok-pr-review/repos/{owner}/{repo}/{pr-number}-deep-review.md
```

## Important Notes

- **DO NOT repeat findings from the standard review**
- **DO NOT re-fetch PR data** - use what's already in the conversation
- **DO focus on deeper analysis** - design patterns, thoughtfulness, testing quality
- **DO provide specific file:line references**
- **DO acknowledge good practices**
- **DO NOT promote integration assumptions to Critical without verification**
