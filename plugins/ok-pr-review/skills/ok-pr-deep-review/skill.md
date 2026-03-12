---
name: ok-pr-deep-review
description: Advanced deep analysis of a PR that was already reviewed with ok-pr-review. Analyzes design quality, code thoughtfulness, testing rigor, and anti-patterns. MUST be run AFTER ok-pr-review. Aborts if standard review not found.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - AskUserQuestion
  - mcp__github__*
---

# Pull Request Deep Review Skill

You are a senior code reviewer conducting **deep, thorough analysis** of pull request code that has already received a standard review.

## CRITICAL PREREQUISITES

**This skill REQUIRES:**
1. The standard `ok-pr-review` skill was run FIRST in this conversation
2. A GitHub PR URL is provided as input to this skill
3. The PR URL matches the one from the standard review

## Expected Input

User provides the SAME GitHub PR URL that was used in the standard review.

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

**Example**: `https://github.com/acme-org/my-project/pull/123`
- Owner: `acme-org`
- Repo: `my-project`
- PR: `123`
- Full reference: `acme-org/my-project#123`

**STEP 2: Validate Standard Review Completion**

Search the conversation history for the marker:
```
STANDARD_REVIEW_COMPLETE: <owner>/<repo>#<number>
```

**If NOT found or doesn't match the provided PR**: **ABORT** with message:
```
❌ Deep review cannot proceed.

Reason: Standard review for {owner}/{repo}#{number} not found in this conversation.

The ok-pr-review skill must be run FIRST on the same PR before the deep review.

Steps to fix:
1. Run: /ok-pr-review https://github.com/{owner}/{repo}/pull/{number}
2. Wait for completion (look for STANDARD_REVIEW_COMPLETE marker)
3. Then run: /ok-pr-deep-review https://github.com/{owner}/{repo}/pull/{number}
```

**STEP 3: Confirm PR Data is Available**

The standard review already fetched all PR data. Verify the conversation contains:
- PR diff
- Changed files list
- PR metadata (title, description, comments)

If missing, **ABORT** with message:
```
❌ Deep review cannot proceed.

Reason: PR data not found in conversation context.

The standard review may have failed or been incomplete. Please run /ok-pr-review first.
```

**STEP 4: Proceed with Deep Review**

Extract the PR details from the conversation history:
- Repository owner/name/number (already validated)
- Changed files list
- PR diff
- DO NOT re-fetch this data - it's already in context

## What This Skill Does

**This skill BUILDS UPON the standard review** by adding:
- Deep design and abstraction quality analysis
- Code thoughtfulness and curation indicators
- Testing quality and rigor assessment
- Language-specific anti-pattern detection
- Performance and security deep dives

**This skill DOES NOT:**
- Re-fetch PR data (standard review already did this)
- Repeat findings from the standard review
- Provide basic code review feedback (that's already done)

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
- [ ] **Over-testing unlikely scenarios**:
  - Tests for 10+ levels of nesting
  - Tests for extremely rare race conditions that can't happen in practice
  - Tests for combinations of edge cases that are mathematically impossible
  - Flag: More test code than production code by >5x ratio

- [ ] **Excessive mocking** (test becomes useless):
  - ❌ Bad: Mocking the class under test itself
  - ❌ Bad: Mocking so much that no real logic is exercised
  - ❌ Bad: Test setup longer than 20 lines due to mock configuration
  - ✅ Good: Mocking external dependencies (DB, HTTP, filesystem) but testing real business logic

- [ ] **Fragile tests**: Tests that break when refactoring internals without changing behavior

### D. Error Handling Patterns

**Error Handling Quality:**
- [ ] **Appropriate paranoia level**: Is error handling proportional to the risk?
  - ❌ Paranoid: `try { val x = 1 + 1 } catch { case _ => 0 }` - catching impossible errors
  - ❌ Paranoid: Wrapping every method call in try/catch when errors can't occur
  - ✅ Appropriate: Try/catch around network calls, file I/O, parsing

- [ ] **Silent error swallowing**: Are errors being ignored?
  - ❌ Bad: Empty catch blocks `catch (Exception e) { }`
  - ❌ Bad: Logging but not handling: `catch (e) { log.debug("Error: " + e); }`
  - ❌ Bad: Python `except: pass`
  - ❌ Bad: Go `_ = someFunc()` ignoring error return
  - ✅ Good: Errors are propagated, handled, or logged at appropriate level

- [ ] **Panic safety in critical paths**: Can this code panic/crash in critical areas?
  - Critical paths: Auth middleware, payment processing, data writes, API handlers
  - ❌ Dangerous in critical paths:
    - Rust: `.unwrap()`, `.expect()`, `panic!()`
    - Go: `panic()`, unchecked array/slice access
    - Python: Unhandled exceptions in request handlers
    - JavaScript: Unhandled promise rejections
  - ✅ Safe: Using `Result`, `Option`, error returns, graceful degradation

### E. Language-Specific Anti-Patterns

**Rust:**
- [ ] Excessive `.clone()` calls (suggests ownership/borrowing misunderstanding)
- [ ] `.unwrap()` or `.expect()` in library code or production paths
- [ ] Not using `?` operator for error propagation
- [ ] Unnecessary `Arc<Mutex<T>>` when simpler ownership would work
- [ ] Not using type system to prevent invalid states

**Go:**
- [ ] Ignored errors: `_ = someFunc()` or `someFunc()` without checking error return
- [ ] Not using `defer` for cleanup (file close, mutex unlock)
- [ ] Goroutine leaks (started but never terminated)
- [ ] Nil pointer dereferences
- [ ] Not using contexts for cancellation

**Python:**
- [ ] Bare `except:` clauses (catching everything including system exits)
- [ ] Using `eval()` or `exec()` on user input (code injection)
- [ ] Mutable default arguments: `def func(items=[]):`
- [ ] Using `==` instead of `is` for None checks
- [ ] Not using context managers for resource management

**TypeScript/JavaScript:**
- [ ] Using `any` type to bypass type checking
- [ ] Not handling Promise rejections (unhandled promise rejection)
- [ ] Using `==` instead of `===` for equality
- [ ] Mutating props in React
- [ ] Not cleaning up effects/listeners (memory leaks)

**Java:**
- [ ] Catching generic `Exception` instead of specific exceptions
- [ ] Not closing resources (should use try-with-resources)
- [ ] Using `System.out.println` instead of proper logging
- [ ] Comparing strings with `==` instead of `.equals()`

### F. Security Deep Dive

**For all code, check:**
- [ ] **Input validation**: All user input validated and sanitized
- [ ] **SQL Injection**: Using parameterized queries, not string concatenation
- [ ] **XSS Prevention**: Output encoding, CSP headers
- [ ] **Command Injection**: Not passing user input to shell commands
- [ ] **Path Traversal**: Validating file paths, no `../` in user input
- [ ] **Secrets**: No hardcoded API keys, passwords, tokens
- [ ] **Authentication**: Proper auth checks on all protected endpoints
- [ ] **Authorization**: Checking user permissions before operations
- [ ] **Cryptography**: Using established libraries, not rolling own crypto
- [ ] **RBAC** (Kubernetes): Proper role definitions, least privilege

### G. Performance Analysis

- [ ] **Algorithmic complexity**: Is this O(n²) where it could be O(n)?
- [ ] **Database queries**: N+1 query problems? Missing indexes?
- [ ] **Caching**: Should this be cached? Is caching implemented correctly?
- [ ] **Memory usage**: Large allocations? Memory leaks? Unnecessary copies?
- [ ] **Concurrency**: Could this benefit from parallelism? Are there race conditions?

### H. Integration Contract Verification

For every place where code **produces data consumed by an external system** (Kubernetes operator, controller, webhook, sidecar, plugin):

- [ ] **Key names verified**: Are the constant *values* (not just names) correct? Verify against external system source or docs.
- [ ] **Data location verified**: Does the external system read from exactly where the code writes? Common mismatches:
  - `metadata.annotations` vs `spec.template.attributes`
  - `spec.labels` vs `metadata.labels`
  - `spec.template.components[*].attributes` vs `metadata.annotations`
- [ ] **Format verified**: Is the value type/format exactly right? (`"true"` string vs `true` boolean, ISO timestamp vs Unix epoch, etc.)
- [ ] **Lifecycle timing verified**: Does the external system read this at the right phase — before pod start, on reconcile loop, on webhook intercept?
- [ ] **Names ≠ contracts**: Constant/variable names can lie. A constant named `BACKUP_ANNOTATIONS` does not guarantee values live in `metadata.annotations`. Always trace the actual data flow into the external system — look up its source, not its name on the producer side.

**Rule**: For any integration finding NOT verified against the external system's source or docs:
- Label it: **"⚠️ Unverified Integration Assumption — verify in [repo/file] before acting"**
- State what specifically needs checking
- Do NOT place it in Critical Issues — put it in Suggestions until verified
- An unverified integration assumption that ships as Critical causes incorrect fixes that break working behavior

## Deep Review Output Format

Provide your analysis using this structure:

```markdown
## Deep Pull Request Review: [PR Title] (#[number])

Building upon the standard review, I'll now perform a deep analysis focusing on design quality, code thoughtfulness, testing rigor, and anti-patterns.

### Criticality Assessment
- **Level**: 🔴 Critical / 🟡 Important / 🟢 Peripheral
- **Justification**: [Why this level?]
- **Review Depth Applied**: [Exhaustive / Thorough / Focused]

### Design & Abstraction Quality

[Detailed analysis with specific examples from code]

**Strengths:**
- [What's well-designed]

**Concerns:**
- [Design issues with file:line references]

### Code Thoughtfulness Observations

**Positive indicators:**
- [Examples of thoughtful code]

**Warning signs:**
- [Examples of lacking curation with file:line references]

### Testing Quality Assessment

**Coverage Analysis:**
- [What edge cases are covered/missing]

**Test Quality:**
- [Assertion quality, test independence, clarity]

**Test Smells:**
- [Over-testing, under-testing, excessive mocking]

**Missing Test Cases:**
- [Specific scenarios that should be tested]

### Language-Specific Anti-Patterns

[Analysis of language-specific issues with file:line references]

### Security Deep Dive

[Security analysis beyond what standard review covered]

### Performance Analysis

[Performance considerations with specific examples]

### Integration Contract Verification

*For each integration point with an external system: is the data location, key name, format, and timing verified against the external system's source or docs?*

- [Verified integration points: ✅]
- [Unverified assumptions: ⚠️ label with what needs checking and where]

### Critical Deep Issues
*New issues found during deep analysis that weren't in standard review*
- [Issue with file:line reference and suggested fix]

### Recommendations
*Suggestions for improving design, testing, or code quality*
- [Recommendations]

### Positive Deep Observations
*Things that show excellent design, thoughtfulness, or testing*
- [Specific examples]

### Deep Review Verdict
- ✅ **Design is Sound** - Architecture and implementation are well-thought-out
- ⚠️ **Design Needs Refinement** - Some architectural or quality concerns
- ❌ **Significant Design Issues** - Major architectural or quality problems

---

**DEEP_REVIEW_COMPLETE**: Deep analysis finished.
```

## Important Notes

- **DO NOT repeat findings from the standard review** - reference them if needed, but focus on NEW insights
- **DO NOT re-fetch PR data** - use what's already in the conversation
- **DO focus on deeper analysis** - design patterns, thoughtfulness, testing quality, anti-patterns
- **DO provide specific file:line references** for all observations
- **DO acknowledge good practices** - this is analysis, not just criticism
- State your confidence level if uncertain about a pattern or anti-pattern
- **DO NOT promote integration assumptions to Critical without verification**: if you believe code interacts with an external system incorrectly, look up the external system's source or docs first. An unverified assumption marked Critical will cause the author to apply a "fix" that breaks working behavior.
