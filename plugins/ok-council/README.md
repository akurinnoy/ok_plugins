# ok-council

A Claude Code plugin that runs your question through three different LLMs — **Claude Opus 4.6**, **Gemini 3 Pro**, and **GPT-5.3 Codex** — has them peer-review each other anonymously, then synthesizes a verdict.

## How It Works

```
         ┌──────────────┐
         │  Your Query   │
         └──────┬───────┘
                │
    ┌───────────┼───────────┐
    ▼           ▼           ▼
┌────────┐ ┌────────┐ ┌────────┐
│ Claude │ │ Gemini │ │  GPT   │   Phase 1: Independent answers
│Opus 4.6│ │ 3 Pro  │ │5.3 Cdx │
└───┬────┘ └───┬────┘ └───┬────┘
    │          │          │
    ▼          ▼          ▼
   Anonymize responses (A, B, C)
    │          │          │
    ▼          ▼          ▼
┌────────┐ ┌────────┐ ┌────────┐
│ Review │ │ Review │ │ Review │   Phase 2: Blind peer review
│  A,B,C │ │  A,B,C │ │  A,B,C │
└───┬────┘ └───┬────┘ └───┬────┘
    │          │          │
    └──────────┼──────────┘
               ▼
        ┌─────────────┐
        │  Chairman    │               Phase 3: Synthesis
        │ (Claude Opus)│
        └──────┬──────┘
               ▼
        ┌─────────────┐
        │   Verdict    │
        └─────────────┘
```

1. **First Opinions** — All three models answer your question independently and in parallel.
2. **Anonymous Review** — Responses are anonymized (A/B/C) and each model scores and critiques the others without knowing who wrote what.
3. **Chairman Synthesis** — Claude de-anonymizes, weighs all responses and reviews, and produces a structured verdict with agreement points, disagreements, review highlights, and a final answer.

## When to Use

- **Technical questions** where different models may have different training-data strengths
- **Fact-checking** where model agreement signals higher confidence
- **Architecture decisions** where different model biases surface different tradeoffs
- **Blind-spot detection** when you suspect a single model may miss something

## When NOT to Use

- Trivial questions with one right answer
- Creative writing where stylistic diversity matters more than factual diversity
- Questions requiring tool use or file access (Gemini and Cursor agents only return text)

## Prerequisites

Two external CLI tools must be installed and on your `$PATH`:

| Tool | Command | How to Install |
|------|---------|----------------|
| Gemini CLI | `gemini` | `npm install -g @google/gemini-cli` — [github.com/google-gemini/gemini-cli](https://github.com/google-gemini/gemini-cli) |
| Cursor Agent CLI | `agent` | `curl https://cursor.com/install -fsS \| bash` — see [cursor.com/docs/cli/installation](https://cursor.com/docs/cli/installation) |

The workflow verifies both tools before running and reports clear install instructions if anything is missing.

## Installation

### Via marketplace

```
/plugin marketplace add
```

Select "GitHub repository" and enter `akurinnoy/ok-plugins`.

```
/plugin install ok-council@ok-plugins
```

### Local (for development)

```bash
claude --plugin-dir /path/to/ok-council
```

## Usage

```
/llm-council-crossmodel Should we use WebSockets or SSE for real-time updates in our dashboard?
```

Or trigger it conversationally — Claude will recognize queries that benefit from cross-model diversity.

## Plugin Structure

```
ok-council/
├── .claude-plugin/
│   └── plugin.json              # Plugin manifest
├── skills/
│   └── llm-council-crossmodel/
│       └── SKILL.md             # Skill definition and trigger
├── workflows/
│   └── llm-council-crossmodel.js  # Workflow orchestration script
├── commands/
│   └── stats.md                 # Stats command for pairwise model analysis
└── README.md
```

## Verdict Logging

Each council run persists structured data to `$HOME/.claude/ok-council/logs/`:

- **councils.jsonl** — one JSON record per council run, containing:
  - `run_id`: Unique identifier for the council session
  - `query`: The original question
  - `timestamp`: When the council completed
  - `models`: Array of model responses with scores and reviews
  - `verdict`: The synthesized chairman conclusion

- **responses/** — directory containing individual response files per run_id:
  - Each run has its own subdirectory with full response transcripts
  - Useful for auditing specific councils or debugging model behavior

Example councils.jsonl entry:
```json
{
  "schema_version": 1,
  "run_id": "council-1720960245123456789",
  "timestamp": "2026-07-14T10:30:45Z",
  "query": "Should we use WebSockets or SSE for real-time updates?",
  "query_domain": "architecture",
  "prompt_hash": null,
  "models": [
    {
      "name": "claude-opus-4.6",
      "version": "claude-opus-4-6[1m]",
      "provider": "anthropic",
      "tokens_in": null,
      "tokens_out": null,
      "latency_ms": null,
      "cost_estimate_usd": null,
      "failed": false,
      "failure_reason": null
    }
  ],
  "positions": {
    "claude-opus-4.6": "WebSockets are better for bidirectional communication...",
    "fable-sonnet5": "SSE is simpler for unidirectional updates...",
    "gemini-3.1-pro": "Consider hybrid approach...",
    "gpt-5.3-codex": "WebSockets for real-time collaboration..."
  },
  "reasoning_summaries": {
    "claude-opus-4.6": "full-duplex communication, persistent connections, binary protocol support",
    "fable-sonnet5": "simpler implementation, HTTP-compatible, built-in reconnection"
  },
  "peer_scores": {
    "claude-opus-4.6": {
      "accuracy": [8, 7, 9, null],
      "insight": [7, 8, 8, null]
    }
  },
  "strongest_picks": {
    "claude-opus-4.6": "fable-sonnet5",
    "fable-sonnet5": "claude-opus-4.6"
  },
  "chairman_source_models": ["claude-opus-4.6", "gemini-3.1-pro"],
  "human_verdict": null
}
```

## Stats Command

The `/ok-council:stats` command analyzes council runs and compares model performance against gold-label answers:

### List recent councils

```
/ok-council:stats --list 10
```

Shows the 10 most recent council runs with their queries and verdict summaries.

### Compare model performance

```
/ok-council:stats --compare
```

Runs all councils against the gold-labels.jsonl file and reports:
- **Per-model accuracy** — how often each model's answer matched the known correct answer
- **Verdict accuracy** — how often the synthesized verdict was correct
- **Confidence correlations** — whether high model agreement correlates with correctness

### Human spot-checks with `--review`

```
/ok-council:stats --review
```

Interactively walks through councils that disagreed with gold labels, allowing you to:
- Confirm the gold label is correct (update your beliefs)
- Confirm the council was right (gold label was wrong, update it)
- Mark as uncertain and skip

Useful for building confidence in the council workflow and refining gold labels over time.

## Gold Labels

Gold labels are a manually curated set of reference answers for council queries. Use them to:
- Validate model performance over time
- Detect when model quality changes (retraining, API updates)
- Build confidence in the council process by measuring accuracy

### Format

Gold labels live in `$HOME/.claude/ok-council/logs/gold-labels.jsonl`. Each line is a JSON object:

```json
{"query": "Should we use WebSockets or SSE for real-time updates?", "correct_answer": "WebSockets for bidirectional, SSE for unidirectional updates", "tagged_at": "2026-07-14"}
```

### Creating and maintaining gold labels

1. **After a council run**, review the verdict and decide if you agree
2. **If confident**, add the query and your known-correct answer to gold-labels.jsonl:
   ```bash
   echo '{"query":"your question","correct_answer":"brief description of the right answer","tagged_at":"2026-07-14"}' >> $HOME/.claude/ok-council/logs/gold-labels.jsonl
   ```
3. **Run stats** to see how models performed against your labels
4. **Review disagreements** with `/ok-council:stats --review` to refine labels or spot model drift

## Credits

Inspired by [Andrej Karpathy's LLM Council](https://github.com/karpathy/llm-council) — the idea of running multiple LLMs on the same question, having them peer-review each other, and synthesizing a verdict.

## License

See [LICENSE](../../LICENSE) in the repository root.
