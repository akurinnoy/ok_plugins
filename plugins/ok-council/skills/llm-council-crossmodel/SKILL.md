---
name: llm-council-crossmodel
description: "Run a query through a 3-model LLM Council (Claude Opus 4.6, Gemini 3 Pro, GPT-5.3 Codex). Each model answers independently, peer-reviews anonymously, then Claude synthesizes a verdict. Trigger: /llm-council-crossmodel"
---

# LLM Council — Cross-Model

A multi-model council that runs your question through three genuinely different LLMs, has them peer-review each other anonymously, and synthesizes a verdict. The diversity comes from different model architectures and training data, not from prompting the same model with different thinking lenses.

## Prerequisites

This skill requires two external CLI tools alongside Claude Code:

| Tool | Command | Install |
|------|---------|---------|
| Gemini CLI | `gemini` | `npm install -g @google/gemini-cli` or see [github.com/google-gemini/gemini-cli](https://github.com/google-gemini/gemini-cli) |
| Cursor Agent CLI | `agent` | `curl https://cursor.com/install -fsS \| bash` — see [cursor.com/docs/cli/installation](https://cursor.com/docs/cli/installation) |

Before the workflow runs, it verifies both tools are available and reports any that are missing with install instructions.

## Models

| Label | Model | Invocation |
|-------|-------|------------|
| Claude | Opus 4.6 | Native `agent()` call |
| Gemini | gemini-3-pro-preview | `gemini -y --skip-trust -m gemini-3-pro-preview -p "..."` via Bash |
| Cursor/GPT | gpt-5.3-codex | `agent --yolo --trust --model gpt-5.3-codex -p "..."` via Bash |

## How to invoke

When this skill is triggered, determine this plugin's root directory from the path of this SKILL.md file (strip `skills/llm-council-crossmodel/SKILL.md`), then call the **Workflow** tool with `scriptPath` pointing to the bundled workflow script. Pass the user's query as `args`:

```
Workflow({ scriptPath: "<plugin-root>/workflows/llm-council-crossmodel.js", args: "<user's query>" })
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
