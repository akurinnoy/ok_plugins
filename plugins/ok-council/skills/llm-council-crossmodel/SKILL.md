---
name: llm-council-crossmodel
description: "Run a query through a multi-model LLM Council with configurable models. Default: Claude Opus, Gemini 3.1 Pro, GPT-5.4. Each model answers independently, then Claude synthesizes a verdict. With 4+ models, anonymous peer review runs before synthesis. Trigger: /llm-council-crossmodel"
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

When this skill is triggered, determine this plugin's root directory from the path of this SKILL.md file (strip `skills/llm-council-crossmodel/SKILL.md`).

### Step 1: Preflight (run in the current session, NOT in the workflow)

Before calling the Workflow tool, run these checks via the **Bash** tool:

1. **Load model config:**
   ```bash
   cat "$HOME/.claude/ok-council/models.json" 2>/dev/null || echo '__NO_CONFIG__'
   ```
   - If `__NO_CONFIG__`: use the default models (see table above)
   - Otherwise: parse the JSON. It may be a plain array (old format) or an object with `models`, `reviewers`, and `logging` keys (new format)

2. **Check CLI tools:**
   ```bash
   which gemini 2>/dev/null || echo 'NOT_FOUND'
   which agent 2>/dev/null || echo 'NOT_FOUND'
   ```
   - Scan the model list: if any model's `cli` contains `"gemini"`, the `gemini` CLI is required. If any model's `cli` is not `"native"` and not gemini-based, the `agent` CLI is required.
   - If a required tool is `NOT_FOUND`, **STOP** and tell the user what to install. Do NOT invoke the workflow.

3. **Parse flags:**
   - Check if the user passed `--full` or said "full council" / "thorough council"
   - Strip `--full` from the query text

### Step 2: Invoke the workflow

Build a structured `args` object and pass it to the Workflow tool:

```
Workflow({
  scriptPath: "<plugin-root>/workflows/llm-council-crossmodel.js",
  args: {
    "query": "<user's query, with --full stripped>",
    "fullMode": false,
    "config": {
      "models": [<parsed model array or defaults>],
      "reviewerCount": 3,
      "loggingEnabled": false
    },
    "tools": {
      "gemini": "<path from which or null>",
      "agent": "<path from which or null>"
    }
  }
})
```

Set `fullMode: true` when the user passes `--full` or says "full council" / "thorough council".

Set `reviewerCount` and `loggingEnabled` from the config file values if present, otherwise use defaults (3 and false).

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
