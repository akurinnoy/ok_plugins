export const meta = {
  name: 'ci',
  description: 'Full non-interactive PR review pipeline: fetch, summary, review, deep-review + impact, post comments',
  whenToUse: 'When running a CI review pipeline, non-interactive full PR review, or automated review with auto-post',
  phases: [
    { title: 'Fetch', detail: 'Fetch PR data and resolve identity' },
    { title: 'Summary', detail: 'Pre-flight orientation', model: 'claude-sonnet-4-6' },
    { title: 'Review', detail: 'Standard code review', model: 'claude-opus-4-6' },
    { title: 'Deep Analysis', detail: 'Deep review + impact in parallel', model: 'claude-opus-4-6' },
    { title: 'Post', detail: 'Aggregate findings and post to GitHub', model: 'claude-sonnet-4-6' },
  ],
}

const SUMMARY_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    keyAreas: { type: 'array', items: { type: 'string' } },
    risks: { type: 'array', items: { type: 'string' } },
    perspective: { type: 'string', enum: ['reviewer', 'author'] },
  },
  required: ['summary', 'keyAreas', 'risks', 'perspective'],
}

const REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['approve', 'request-changes', 'comment'] },
    criticalCount: { type: 'integer' },
    warningCount: { type: 'integer' },
    suggestionCount: { type: 'integer' },
  },
  required: ['verdict', 'criticalCount', 'warningCount', 'suggestionCount'],
}

const POST_SCHEMA = {
  type: 'object',
  properties: {
    inlineComments: { type: 'integer' },
    generalComments: { type: 'integer' },
    posted: { type: 'boolean' },
  },
  required: ['inlineComments', 'generalComments', 'posted'],
}

// Parse PR reference from various formats
function parsePR(input) {
  if (!input) return null
  var str = typeof input === 'string' ? input : input.pr || input.url || ''

  // https://github.com/owner/repo/pull/123
  var urlMatch = str.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/)
  if (urlMatch) return { owner: urlMatch[1], repo: urlMatch[2], number: urlMatch[3] }

  // owner/repo#123
  var shortMatch = str.match(/^([^/]+)\/([^#]+)#(\d+)$/)
  if (shortMatch) return { owner: shortMatch[1], repo: shortMatch[2], number: shortMatch[3] }

  return null
}

var pr = parsePR(args)
if (!pr) {
  log('ERROR: Could not parse PR reference from args. Expected: owner/repo#123 or GitHub PR URL')
  return { error: 'Invalid PR reference' }
}

var owner = pr.owner
var repo = pr.repo
var number = pr.number
var reposDir = '$HOME/.claude/ok-pr-review/repos/' + owner + '/' + repo
var summaryDir = '/tmp/pr-summary-' + owner + '-' + repo + '-' + number
var reviewDir = '/tmp/pr-review-' + owner + '-' + repo + '-' + number

log('Starting CI review for ' + owner + '/' + repo + '#' + number)

// ── Phase 1: Fetch ──────────────────────────────────────────────────────────
phase('Fetch')

var fetchResult = await agent(
  'Run these commands to fetch PR data. Report the GitHub username and whether a domain profile exists.\n\n' +
  '1. Resolve GitHub identity:\n' +
  '```bash\n' +
  'mkdir -p "$HOME/.claude/ok-pr-review"\n' +
  'test -f "$HOME/.claude/ok-pr-review/.github-user" || gh api user --jq \'.login\' > "$HOME/.claude/ok-pr-review/.github-user"\n' +
  'cat "$HOME/.claude/ok-pr-review/.github-user"\n' +
  '```\n\n' +
  '2. Fetch summary data:\n' +
  '```bash\n' +
  'bash ${CLAUDE_PLUGIN_ROOT}/scripts/fetch-summary-data.sh ' + owner + ' ' + repo + ' ' + number + '\n' +
  '```\n\n' +
  '3. Fetch full review data:\n' +
  '```bash\n' +
  'bash ${CLAUDE_PLUGIN_ROOT}/scripts/fetch-pr-data.sh ' + owner + ' ' + repo + ' ' + number + '\n' +
  '```\n\n' +
  '4. Create findings directory:\n' +
  '```bash\n' +
  'mkdir -p "' + reposDir + '"\n' +
  '```\n\n' +
  '5. Check for domain profile:\n' +
  '```bash\n' +
  'test -f "' + reposDir + '/profile.md" && echo "PROFILE_EXISTS" || echo "NO_PROFILE"\n' +
  '```\n\n' +
  'Return the GitHub username and whether the profile exists.',
  { label: 'fetch', phase: 'Fetch', model: 'claude-sonnet-4-6', effort: 'low' }
)

log('Fetch complete')

// ── Phase 2: Summary ────────────────────────────────────────────────────────
phase('Summary')

var summaryResult = await agent(
  'You are producing a pre-flight PR summary. This is a map, not a review.\n\n' +
  'PR: ' + owner + '/' + repo + '#' + number + '\n\n' +
  'Read these files:\n' +
  '- ' + summaryDir + '/metadata.json (PR metadata)\n' +
  '- ' + summaryDir + '/files.txt (changed files)\n' +
  '- ' + summaryDir + '/diff.txt (diff - truncate to 30000 chars if larger)\n' +
  '- $HOME/.claude/ok-pr-review/.github-user (your GitHub login)\n\n' +
  'Compare the PR author (from metadata.json author.login) with your GitHub login to determine perspective (reviewer or author).\n\n' +
  'Produce a summary with:\n' +
  '1. Summary (2-3 sentences): What does this PR do?\n' +
  '2. Key Review Areas: Where should a reviewer focus? One bullet per area.\n' +
  '3. Potential Risks: List every risk. Be thorough. One bullet per risk.\n\n' +
  'Keep it brief. No implementation details. No code analysis.\n\n' +
  'Also write the full summary to: ' + reposDir + '/' + number + '-summary.md',
  { label: 'summary', phase: 'Summary', model: 'claude-sonnet-4-6', schema: SUMMARY_SCHEMA }
)

log('Summary: ' + summaryResult.summary)
log('Risks identified: ' + summaryResult.risks.length)

// ── Phase 3: Standard Review ────────────────────────────────────────────────
phase('Review')

var reviewResult = await agent(
  'You are a senior code reviewer conducting a thorough pull request review.\n\n' +
  'PR: ' + owner + '/' + repo + '#' + number + '\n\n' +
  'Read these files for PR data:\n' +
  '- ' + reviewDir + '/overview.txt (PR title, description, status)\n' +
  '- ' + reviewDir + '/comments.txt (discussion threads)\n' +
  '- ' + reviewDir + '/files.txt (changed file list)\n' +
  '- ' + reviewDir + '/diff.txt (full diff)\n' +
  '- ' + reviewDir + '/inline-comments.json (existing inline review threads)\n' +
  '- ' + reviewDir + '/commits.json (commit list)\n\n' +
  'Read the pre-flight summary for orientation:\n' +
  '- ' + reposDir + '/' + number + '-summary.md\n\n' +
  'If it exists, read the domain profile for project context:\n' +
  '- ' + reposDir + '/profile.md\n\n' +
  'Check for linked issues (Fixes #N, Closes #N) in the PR description. If found, fetch them:\n' +
  '```bash\ngh issue view <N> --repo ' + owner + '/' + repo + '\n```\n\n' +
  'Analyze the code changes for:\n' +
  '- Security: injection, hardcoded secrets, auth issues, input validation\n' +
  '- Correctness: does the PR solve the linked issue? Edge cases handled?\n' +
  '- Code quality: clarity, error handling, duplication, idioms\n' +
  '- Performance: complexity, query efficiency, memory\n' +
  '- Best practices: test coverage, docs, breaking changes\n' +
  '- K8s operator specifics (if applicable): reconciliation, status, events, finalizers\n\n' +
  'Cross-reference with existing feedback in inline-comments.json. Do not repeat what others already caught.\n\n' +
  'Write the full review to: ' + reposDir + '/' + number + '-review.md\n\n' +
  'Return the verdict and counts of issues found.',
  { label: 'review', phase: 'Review', model: 'claude-opus-4-6', schema: REVIEW_SCHEMA }
)

log('Review verdict: ' + reviewResult.verdict + ' (critical: ' + reviewResult.criticalCount + ', warnings: ' + reviewResult.warningCount + ')')

// ── Phase 4: Deep Analysis (parallel) ───────────────────────────────────────
phase('Deep Analysis')

var deepResults = await parallel([
  function() {
    return agent(
      'You are conducting a deep design quality review of a PR that already received a standard review.\n\n' +
      'PR: ' + owner + '/' + repo + '#' + number + '\n\n' +
      'Read the diff and review data:\n' +
      '- ' + reviewDir + '/diff.txt\n' +
      '- ' + reviewDir + '/files.txt\n' +
      '- ' + reposDir + '/' + number + '-review.md (standard review - do NOT repeat these findings)\n' +
      '- ' + reposDir + '/' + number + '-summary.md\n' +
      '- ' + reposDir + '/profile.md (if exists)\n\n' +
      'Focus on:\n' +
      '- Design & abstraction quality: clear responsibilities, information hiding, composability\n' +
      '- Code thoughtfulness: consistent patterns, meaningful comments, curated vs generated\n' +
      '- Testing quality: edge cases, assertion rigor, test independence\n' +
      '- Language-specific anti-patterns\n' +
      '- Security deep dive beyond standard review\n' +
      '- Performance analysis\n' +
      '- Integration contract verification\n\n' +
      'Do NOT repeat findings from the standard review.\n\n' +
      'Write findings to: ' + reposDir + '/' + number + '-deep-review.md\n\n' +
      'Return a brief text summary of your key findings.',
      { label: 'deep-review', phase: 'Deep Analysis', model: 'claude-opus-4-6' }
    )
  },
  function() {
    return agent(
      'You are reviewing a PR for system-level concerns: operational readiness, security posture, supply chain, compatibility.\n\n' +
      'PR: ' + owner + '/' + repo + '#' + number + '\n\n' +
      'Read the diff and review data:\n' +
      '- ' + reviewDir + '/diff.txt\n' +
      '- ' + reviewDir + '/files.txt\n' +
      '- ' + reposDir + '/' + number + '-review.md (standard review - do NOT repeat code-level findings)\n' +
      '- ' + reposDir + '/' + number + '-summary.md\n' +
      '- ' + reposDir + '/profile.md (if exists)\n\n' +
      'Run Tier 1 checks (always, unless docs-only):\n' +
      '- Observability: errors logged at right level, no sensitive data in logs\n' +
      '- Failure handling: errors surfaced, retries where appropriate, consistent state on partial failure\n' +
      '- Resource cleanup: resources released on error paths, finalizers, no goroutine leaks\n' +
      '- Network/timeouts: explicit timeouts, context propagation, TLS verification\n' +
      '- Secret handling: not logged, not embedded, least knowledge\n\n' +
      'Run Tier 2 checks (only if triggered by diff content):\n' +
      '- Container supply chain, K8s RBAC, state management, API endpoints, DB/data access\n' +
      '- New dependencies, backward/API compatibility, K8s operator specifics, configuration, PII\n\n' +
      'Do NOT repeat code-level findings from the standard review.\n\n' +
      'Write findings to: ' + reposDir + '/' + number + '-impact.md\n\n' +
      'Return a brief text summary of your key findings.',
      { label: 'impact', phase: 'Deep Analysis', model: 'claude-opus-4-6' }
    )
  },
])

var deepReview = deepResults[0]
var impactReview = deepResults[1]

log('Deep review: ' + (deepReview ? 'complete' : 'skipped'))
log('Impact review: ' + (impactReview ? 'complete' : 'skipped'))

// ── Phase 5: Post Comments ──────────────────────────────────────────────────
phase('Post')

var postResult = await agent(
  'Aggregate all review findings and post them to GitHub as a submitted review.\n\n' +
  'PR: ' + owner + '/' + repo + '#' + number + '\n\n' +
  'Read all findings files from ' + reposDir + '/:\n' +
  '- ' + number + '-summary.md\n' +
  '- ' + number + '-review.md\n' +
  '- ' + number + '-deep-review.md (if exists)\n' +
  '- ' + number + '-impact.md (if exists)\n\n' +
  'Also read the diff for line matching:\n' +
  '- ' + reviewDir + '/diff.txt\n\n' +
  'Process:\n' +
  '1. Merge all findings into a unified comment list. Deduplicate.\n' +
  '2. Skip items marked as ADDRESSED or DROPPED.\n' +
  '3. For each finding, scan the diff to match it to a specific file and line number.\n' +
  '   Use diff hunk headers (@@ -X,N +Y,M @@) to map findings to the correct line on the + side.\n' +
  '4. Classify: inline (has file+line) or general (no match).\n' +
  '5. Write prepared comments to: ' + reposDir + '/' + number + '-comment.md\n\n' +
  '6. Get the head commit SHA:\n' +
  '```bash\ngh api repos/' + owner + '/' + repo + '/pulls/' + number + ' --jq \'.head.sha\'\n```\n\n' +
  '7. Create a review with all comments using gh api. Post as a single review with comments array:\n' +
  '```bash\ngh api repos/' + owner + '/' + repo + '/pulls/' + number + '/reviews --input - <<\'JSON\'\n' +
  '{\n' +
  '  "commit_id": "<HEAD_SHA>",\n' +
  '  "event": "COMMENT",\n' +
  '  "body": "<general findings as review body>",\n' +
  '  "comments": [<inline comments with path, position, body>]\n' +
  '}\n' +
  'JSON\n```\n\n' +
  'Use collaborative tone: "Consider...", "Does it make sense to...?", "Would it be possible to...?"\n' +
  'Use regular hyphens, not em dashes. Lead with the point, no preamble. Short sentences.\n\n' +
  'Return the count of inline and general comments posted.',
  { label: 'post', phase: 'Post', model: 'claude-sonnet-4-6', schema: POST_SCHEMA }
)

log('Posted: ' + postResult.inlineComments + ' inline, ' + postResult.generalComments + ' general')

// ── Return verdict ──────────────────────────────────────────────────────────
return {
  pr: owner + '/' + repo + '#' + number,
  summary: summaryResult.summary,
  verdict: reviewResult.verdict,
  criticalIssues: reviewResult.criticalCount,
  warnings: reviewResult.warningCount,
  suggestions: reviewResult.suggestionCount,
  deepReview: deepReview ? 'complete' : 'skipped',
  impactReview: impactReview ? 'complete' : 'skipped',
  commentsPosted: postResult.inlineComments + postResult.generalComments,
}
