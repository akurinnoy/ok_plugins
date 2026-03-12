# ok-pr-review

Two-stage pull request review plugin for Claude Code.

## Skills

### 1. ok-pr-review (Standard Review)

Fetches PR data from GitHub and provides structured feedback on:
- Correctness vs linked issue requirements
- Security vulnerabilities
- Code quality and performance
- Best practices

**Must be run first.** Outputs a `STANDARD_REVIEW_COMPLETE` marker that the deep review depends on.

### 2. ok-pr-deep-review (Deep Review)

Builds on the standard review with deeper analysis of:
- Design and abstraction quality
- Code thoughtfulness indicators
- Testing quality and rigor
- Language-specific anti-patterns
- Integration contract verification

**Must be run after ok-pr-review on the same PR.** Reuses PR data already in context (no duplicate API calls).

## Usage

```
/ok-pr-review https://github.com/owner/repo/pull/123
# Wait for STANDARD_REVIEW_COMPLETE marker
/ok-pr-deep-review https://github.com/owner/repo/pull/123
```

## Installation

```
/plugin install ok-pr-review@ok-plugins
```

## License

EPL-2.0
