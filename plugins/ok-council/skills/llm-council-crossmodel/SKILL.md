---
name: llm-council-crossmodel
description: "Run a query through a multi-model LLM Council with configurable models. Default: Claude Opus, Gemini 3.1 Pro, GPT-5.4. Each model answers independently, peer-reviews anonymously, then Claude synthesizes a verdict. Each run is logged for cross-run model comparison. Trigger: /llm-council-crossmodel"
---

# LLM Council — Cross-Model

A multi-model council that runs your question through genuinely different LLMs, has them peer-review each other anonymously, and synthesizes a verdict. The diversity comes from different model architectures and training data, not from prompting the same model with different thinking lenses.

## Prerequisites

The workflow checks which CLI tools are needed based on the configured models and verifies they're available.

| Tool | Command | Install |
|------|---------|---------|
| Gemini CLI | `gemini` | `npm install -g @google/gemini-cli` or see [github.com/google-gemini/gemini-cli](https://github.com/google-gemini/gemini-cli) |
| Cursor Agent CLI | `agent` | `curl https://cursor.com/install -fsS \| bash` — see [cursor.com/docs/cli/installation](https://cursor.com/docs/cli/installation) |

## Models

Models are configurable via `$HOME/.claude/ok-council/models.json`. If the file doesn't exist, the workflow uses these defaults:

| Name | Provider | CLI |
|------|----------|-----|
| claude-opus-4.6 | anthropic | `native` (uses Claude's built-in `agent()` call) |
| gemini-3.1-pro | google | `gemini -y --skip-trust -m gemini-3.1-pro-preview -p -` |
| gpt-5.4 | openai | `agent --yolo --trust --model gpt-5.4-high -p -` |

To customize, create `$HOME/.claude/ok-council/models.json`:

```json
{
  "reviewers": 3,
  "models": [
    {"name": "claude-opus-4.6", "provider": "anthropic", "cli": "native"},
    {"name": "gemini-3.1-pro", "provider": "google", "cli": "gemini -y --skip-trust -m gemini-3.1-pro-preview -p -"},
    {"name": "gpt-5.4", "provider": "openai", "cli": "agent --yolo --trust --model gpt-5.4-high -p -"}
  ]
}
```

- `models`: array of model entries. Each needs `name`, `provider`, and `cli`. Set `cli` to `"native"` for the model running inside Claude Code.
- `reviewers`: how many models perform peer review in simple mode (default: 3). `--full` overrides this to all models.
- `logging`: when `true`, enables analytics pipeline (distillation, score extraction, source detection, JSONL logging). Default: `false`. Enable when comparing model performance via `/ok-council:stats`.
- A plain JSON array (old format) is also accepted for backward compatibility.

## How to invoke

When this skill is triggered, determine this plugin's root directory from the path of this SKILL.md file (strip `skills/llm-council-crossmodel/SKILL.md`), then call the **Workflow** tool with `scriptPath` pointing to the bundled workflow script. Pass the user's query as `args`:

```
Workflow({ scriptPath: "<plugin-root>/workflows/llm-council-crossmodel.js", args: "<user's query>" })
```

With the default 3-model setup, all models always perform peer review. The `--full` flag is relevant when custom configs add more models. Prepend `--full` to the args when:
- The user passes the `--full` flag explicitly (e.g., `/llm-council-crossmodel --full Should I use Redis?`)
- The user says "full council", "thorough council", or explicitly asks for all models to review

```
Workflow({ scriptPath: "<plugin-root>/workflows/llm-council-crossmodel.js", args: "--full <user's query>" })
```

## When to use

Use this when you want **genuine model diversity** rather than perspective diversity. Good for:

- Technical questions where different models may have different training-data strengths
- Fact-checking where model agreement signals higher confidence
- Architecture/design decisions where different model biases may surface different tradeoffs
- Any question where you suspect a single model has blind spots

## When NOT to use

- Trivial questions with one right answer
- Creative writing tasks where stylistic diversity matters more than factual diversity
- Questions requiring tool use or file access (the Gemini and Cursor agents only return text)
