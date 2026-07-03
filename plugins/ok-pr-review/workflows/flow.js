export const meta = {
  name: 'flow',
  description: 'Interactive PR review pipeline: fetch, summary, review, conditional deep-review + impact, draft comments (no auto-post)',
  whenToUse: 'When the user wants a full PR review, says "review this PR", or provides a PR URL for review',
  phases: [
    { title: 'Fetch', detail: 'Fetch PR data and resolve identity' },
    { title: 'Summary', detail: 'Pre-flight orientation + scope decision', model: 'claude-sonnet-4-6' },
    { title: 'Review', detail: 'Standard code review', model: 'claude-opus-4-6' },
    { title: 'Deep Analysis', detail: 'Deep review + impact (conditional, parallel)', model: 'claude-opus-4-6' },
    { title: 'Draft', detail: 'Aggregate findings into review draft', model: 'claude-sonnet-4-6' },
  ],
}

const SUMMARY_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    keyAreas: { type: 'array', items: { type: 'string' } },
    risks: { type: 'array', items: { type: 'string' } },
    perspective: { type: 'string', enum: ['reviewer', 'author'] },
    scope: {
      type: 'object',
      properties: {
        runDeepReview: { type: 'boolean' },
        runImpact: { type: 'boolean' },
        reason: { type: 'string' },
      },
      required: ['runDeepReview', 'runImpact', 'reason'],
    },
  },
  required: ['summary', 'keyAreas', 'risks', 'perspective', 'scope'],
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

const DRAFT_SCHEMA = {
  type: 'object',
  properties: {
    inlineComments: { type: 'integer' },
    generalComments: { type: 'integer' },
    filePath: { type: 'string' },
  },
  required: ['inlineComments', 'generalComments', 'filePath'],
}

function parsePR(input) {
  if (!input) return null
  var str = typeof input === 'string' ? input : input.pr || input.url || ''

  var urlMatch = str.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/)
  if (urlMatch) return { owner: urlMatch[1], repo: urlMatch[2], number: urlMatch[3] }

  var shortMatch = str.match(/^([^/]+)\/([^#]+)#(\d+)$/)
  if (shortMatch) return { owner: shortMatch[1], repo: shortMatch[2], number: shortMatch[3] }

  return null
}

var pr = parsePR(args)
if (!pr) {
  log('ERROR: Could not parse PR reference. Expected: owner/repo#123 or GitHub PR URL')
  return { error: 'Invalid PR reference' }
}

var owner = pr.owner
var repo = pr.repo
var number = pr.number
var reposDir = '$HOME/.claude/ok-pr-review/repos/' + owner + '/' + repo
var summaryDir = '/tmp/pr-summary-' + owner + '-' + repo + '-' + number
var reviewDir = '/tmp/pr-review-' + owner + '-' + repo + '-' + number

log('Starting review for ' + owner + '/' + repo + '#' + number)

// ── Phase 1: Fetch ──────────────────────────────────────────────────────────
phase('Fetch')

await agent(
  'Run these commands to fetch PR data:\n\n' +
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
  'Return confirmation when done.',
  { label: 'fetch', phase: 'Fetch', model: 'claude-sonnet-4-6', effort: 'low' }
)

log('Fetch complete')

// ── Phase 2: Summary + Scope Decision ───────────────────────────────────────
phase('Summary')

var summaryResult = await agent(
  'You are producing a pre-flight PR summary. This is a map, not a review.\n\n' +
  'PR: ' + owner + '/' + repo + '#' + number + '\n\n' +
  'Read these files:\n' +
  '- ' + summaryDir + '/metadata.json (PR metadata)\n' +
  '- ' + summaryDir + '/files.txt (changed files)\n' +
  '- ' + summaryDir + '/diff.txt (diff - truncate to 30000 chars if larger)\n' +
  '- $HOME/.claude/ok-pr-review/.github-user (your GitHub login)\n\n' +
  'Compare the PR author (from metadata.json author.login) with your GitHub login to determine perspective.\n\n' +
  'Produce a summary with:\n' +
  '1. Summary (2-3 sentences)\n' +
  '2. Key Review Areas (one bullet per area, reference file names)\n' +
  '3. Potential Risks (list every risk, be thorough)\n\n' +
  'Also decide the review scope:\n' +
  '- runDeepReview: true if the PR has design complexity, multiple abstractions, significant testing changes, or 10+ files\n' +
  '- runImpact: true if the PR touches infrastructure, deployment, RBAC, supply chain, operator config, API contracts, or dependencies\n' +
  '- For small PRs (< 5 files, single concern, no security/ops): both false\n' +
  '- Provide a one-sentence reason for your scope decision\n\n' +
  'Write the full summary to: ' + reposDir + '/' + number + '-summary.md',
  { label: 'summary', phase: 'Summary', model: 'claude-sonnet-4-6', schema: SUMMARY_SCHEMA }
)

log('Summary: ' + summaryResult.summary)
log('Scope: ' + summaryResult.scope.reason)
log('Deep review: ' + (summaryResult.scope.runDeepReview ? 'yes' : 'skip'))
log('Impact: ' + (summaryResult.scope.runImpact ? 'yes' : 'skip'))

// ── Phase 3: Standard Review ────────────────────────────────────────────────
phase('Review')

var reviewResult = await agent(
  'You are a senior code reviewer conducting a thorough pull request review.\n\n' +
  'PR: ' + owner + '/' + repo + '#' + number + '\n\n' +
  'Read these files for PR data:\n' +
  '- ' + reviewDir + '/overview.txt\n' +
  '- ' + reviewDir + '/comments.txt\n' +
  '- ' + reviewDir + '/files.txt\n' +
  '- ' + reviewDir + '/diff.txt\n' +
  '- ' + reviewDir + '/inline-comments.json\n' +
  '- ' + reviewDir + '/commits.json\n\n' +
  'Read the pre-flight summary:\n' +
  '- ' + reposDir + '/' + number + '-summary.md\n\n' +
  'If it exists, read the domain profile:\n' +
  '- ' + reposDir + '/profile.md\n\n' +
  'Check for linked issues (Fixes #N, Closes #N) in the PR description. If found:\n' +
  '```bash\ngh issue view <N> --repo ' + owner + '/' + repo + '\n```\n\n' +
  'Analyze for: security, correctness vs requirements, code quality, performance, best practices, K8s operator specifics (if applicable).\n' +
  'Cross-reference with existing feedback in inline-comments.json.\n\n' +
  'Write the full review to: ' + reposDir + '/' + number + '-review.md\n\n' +
  'Return the verdict and issue counts.',
  { label: 'review', phase: 'Review', model: 'claude-opus-4-6', schema: REVIEW_SCHEMA }
)

log('Review verdict: ' + reviewResult.verdict + ' (critical: ' + reviewResult.criticalCount + ', warnings: ' + reviewResult.warningCount + ')')

// ── Phase 4: Deep Analysis (conditional, parallel) ──────────────────────────
phase('Deep Analysis')

var deepReview = null
var impactReview = null

var deepAgents = []

if (summaryResult.scope.runDeepReview) {
  deepAgents.push(function() {
    return agent(
      'You are conducting a deep design quality review.\n\n' +
      'PR: ' + owner + '/' + repo + '#' + number + '\n\n' +
      'Read:\n' +
      '- ' + reviewDir + '/diff.txt\n' +
      '- ' + reviewDir + '/files.txt\n' +
      '- ' + reposDir + '/' + number + '-review.md (do NOT repeat these findings)\n' +
      '- ' + reposDir + '/' + number + '-summary.md\n' +
      '- ' + reposDir + '/profile.md (if exists)\n\n' +
      'Focus on: design quality, code thoughtfulness, testing rigor, language anti-patterns, security deep dive, performance, integration contracts.\n\n' +
      'Write findings to: ' + reposDir + '/' + number + '-deep-review.md',
      { label: 'deep-review', phase: 'Deep Analysis', model: 'claude-opus-4-6' }
    )
  })
}

if (summaryResult.scope.runImpact) {
  deepAgents.push(function() {
    return agent(
      'You are reviewing a PR for system-level concerns.\n\n' +
      'PR: ' + owner + '/' + repo + '#' + number + '\n\n' +
      'Read:\n' +
      '- ' + reviewDir + '/diff.txt\n' +
      '- ' + reviewDir + '/files.txt\n' +
      '- ' + reposDir + '/' + number + '-review.md (do NOT repeat code-level findings)\n' +
      '- ' + reposDir + '/' + number + '-summary.md\n' +
      '- ' + reposDir + '/profile.md (if exists)\n\n' +
      'Tier 1 (always unless docs-only): observability, failure handling, resource cleanup, network/timeouts, secret handling.\n' +
      'Tier 2 (trigger-based): supply chain, RBAC, state management, API endpoints, DB, dependencies, compatibility, K8s operator, config, PII.\n\n' +
      'Write findings to: ' + reposDir + '/' + number + '-impact.md',
      { label: 'impact', phase: 'Deep Analysis', model: 'claude-opus-4-6' }
    )
  })
}

if (deepAgents.length > 0) {
  var results = await parallel(deepAgents)
  deepReview = summaryResult.scope.runDeepReview ? results[0] : null
  impactReview = summaryResult.scope.runImpact ? (summaryResult.scope.runDeepReview ? results[1] : results[0]) : null
  log('Deep analysis complete')
} else {
  log('Deep analysis skipped (small PR)')
}

// ── Phase 5: Draft Comments ─────────────────────────────────────────────────
phase('Draft')

var draftResult = await agent(
  'Aggregate all review findings into a prepared comment draft. Do NOT post to GitHub.\n\n' +
  'PR: ' + owner + '/' + repo + '#' + number + '\n\n' +
  'Read all findings files from ' + reposDir + '/:\n' +
  '- ' + number + '-summary.md\n' +
  '- ' + number + '-review.md\n' +
  '- ' + number + '-deep-review.md (if exists)\n' +
  '- ' + number + '-impact.md (if exists)\n\n' +
  'Also read the diff for potential line matching:\n' +
  '- ' + reviewDir + '/diff.txt\n\n' +
  'Process:\n' +
  '1. Merge all findings. Deduplicate. Skip ADDRESSED/DROPPED items.\n' +
  '2. For each finding, try to match it to a file and line number using diff hunk headers.\n' +
  '3. Classify as inline (file+line) or general.\n' +
  '4. Write prepared comments to: ' + reposDir + '/' + number + '-comment.md\n\n' +
  'Use collaborative tone: "Consider...", "Does it make sense to...?"\n' +
  'Use regular hyphens, not em dashes. Short sentences. Lead with the point.\n\n' +
  'Do NOT post anything to GitHub. Only write the comment file.\n\n' +
  'Return the counts and file path.',
  { label: 'draft', phase: 'Draft', model: 'claude-sonnet-4-6', schema: DRAFT_SCHEMA }
)

log('Draft ready: ' + draftResult.inlineComments + ' inline, ' + draftResult.generalComments + ' general')
log('Saved to: ' + draftResult.filePath)

// ── Return ──────────────────────────────────────────────────────────────────
return {
  pr: owner + '/' + repo + '#' + number,
  summary: summaryResult.summary,
  scope: summaryResult.scope,
  verdict: reviewResult.verdict,
  criticalIssues: reviewResult.criticalCount,
  warnings: reviewResult.warningCount,
  suggestions: reviewResult.suggestionCount,
  deepReview: deepReview ? 'complete' : 'skipped',
  impactReview: impactReview ? 'complete' : 'skipped',
  draftComments: draftResult.inlineComments + draftResult.generalComments,
  commentFile: draftResult.filePath,
  nextStep: 'Run /ok-pr-review:comment to review and post the draft',
}
