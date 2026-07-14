---
description: Analyze council verdict logs - pairwise model agreement, scores, and redundancy recommendations
argument-hint: [model1 model2] [--domain <domain>] [--review]
model: opus
allowed-tools:
  - Bash
  - Read
  - Write
  - Agent
---

# Council Stats

Analyze structured verdict logs from crossmodel council runs. Produces pairwise model comparisons with agreement rates, reasoning overlap, peer scores, chairman influence, and redundancy recommendations.

## Input

Input: {{args}}

Accepted forms:
- No arguments: analyze all pairs across all runs
- `opus fable`: analyze a specific pair (use short names: opus, fable, gemini, gpt, grok)
- `--domain code`: filter to runs in a specific query domain
- `--review`: enter human spot-check mode for unreviewed runs

Short name mapping:
- `opus` → `claude-opus-4.6`
- `fable` → `fable-sonnet5`
- `gemini` → `gemini-3.1-pro`
- `gpt` → `gpt-5.4`
- `grok` → `grok-4.5`

## Process

### 1. Read Log Data

```bash
cat "$HOME/.claude/ok-council/logs/councils.jsonl"
```

If the file doesn't exist or is empty, report:
```
No council runs logged yet. Run /llm-council-crossmodel a few times to build data.
```

Parse each line as JSON. Apply domain filter if `--domain` was specified.

### 2. Human Spot-Check Mode (if --review)

Find runs where `human_verdict` is null. For each (up to 3):

Show the query, chairman synthesis (read from the log), and each model's position. Ask:

```
Which model(s) do you agree with for this query?
1. claude-opus-4.6
2. fable-sonnet5
3. gemini-3.1-pro
4. gpt-5.4
5. grok-4.5
```

Save the user's pick by updating the `human_verdict` field in the JSONL entry (rewrite the line).

After spot-checking, continue to analysis.

### 3. Pairwise Classification

For each model pair in scope, for each run where both models responded (not failed):

Read both models' full raw responses from:
```
$HOME/.claude/ok-council/logs/responses/{run_id}/{model-name}.md
```

Spawn a classifier agent that reads both responses and returns:

```json
{
  "conclusion_agreement": 0.82,
  "reasoning_overlap": 0.65
}
```

- **conclusion_agreement** (0.0-1.0): how aligned are the final recommendations
- **reasoning_overlap** (0.0-1.0): how similar are the reasoning paths, evidence, and arguments

Derive quadrant labels using threshold 0.6:
- **Redundant**: agreement >= 0.6 AND overlap >= 0.6
- **Validated**: agreement >= 0.6 AND overlap < 0.6
- **Unreliable**: agreement < 0.6 AND overlap >= 0.6
- **Diverse**: agreement < 0.6 AND overlap < 0.6

Cache classification results at `$HOME/.claude/ok-council/logs/cache/classifications.json` keyed by run_id + model pair. Reuse cached results for runs already classified.

### 4. Score Normalization

For each reviewer across all runs, z-score their accuracy and insight ratings, then map back to 1-10 scale. This corrects for reviewers who grade on different curves.

### 5. Generate Report

Compute and display:

#### Pairwise Analysis (per pair)

- Provider independence: HIGH (different providers) or LOW (same provider)
- Runs where both responded / total runs
- Quadrant breakdown with counts, percentages, average agreement, average overlap
- List the "Unreliable" runs with which model broke inference each time

#### Average Peer Scores (normalized)

Per model: accuracy, insight, strongest picks count/%, failure rate

#### Chairman Influence

Per model: how often the model influenced the synthesis, how often as sole source

#### Cost Efficiency (if token data available)

Per model: average cost per run, unique insight rate

#### Gold-Label Accuracy (if gold labels exist)

Check `$HOME/.claude/ok-council/logs/gold-labels.jsonl`. For runs matching a gold-label query (by exact query match), report per-model correctness.

#### Recommendation

Spawn an agent that reads all computed stats and produces a recommendation. The agent should consider:
- High redundancy + low provider independence → strong signal to drop the weaker
- High "Validated" rate → keep both, they independently confirm
- Unreliable skewing toward one model → drop that model
- Failure rate as a signal independent of analysis quality
- Sample size warnings (flag if < 20 paired runs)

### 6. Report Format

```
## Council Stats (N runs, M with model failures)

### Pairwise Analysis: {model1} ↔ {model2}

Provider independence: HIGH/LOW ({providers})
Runs where both responded: X/N ({model} failed Y times)

| Pattern    | Count | %   | Avg agreement | Avg overlap |
|------------|-------|-----|---------------|-------------|
| Redundant  |       |     |               |             |
| Validated  |       |     |               |             |
| Unreliable |       |     |               |             |
| Diverse    |       |     |               |             |

Unreliable runs ({model} broke inference N/N):
  - "{query}" — overlap X, agreement Y

### Average Peer Scores (normalized)

| Model          | Accuracy | Insight | Strongest Picks | Failure Rate |
|----------------|----------|---------|-----------------|--------------|

### Chairman Influence

| Model          | Influenced synthesis | As sole source |
|----------------|---------------------|----------------|

### Recommendation

{agent-generated recommendation}

⚠️ Sample size: N paired runs. Consider 30+ for high confidence.
```
