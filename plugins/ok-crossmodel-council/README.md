# ok-crossmodel-council

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
- Creative writing (use `/llm-council` with thinking-lens diversity instead)
- Questions requiring tool use or file access (Gemini and Cursor agents only return text)

## Prerequisites

Two external CLI tools must be installed and on your `$PATH`:

| Tool | Command | How to Install |
|------|---------|----------------|
| Gemini CLI | `gemini` | `npm install -g @google/gemini-cli` — [github.com/google-gemini/gemini-cli](https://github.com/google-gemini/gemini-cli) |
| Cursor Agent CLI | `agent` | Installed with [Cursor](https://cursor.com); ensure `agent` is on your `$PATH` |

The workflow verifies both tools before running and reports clear install instructions if anything is missing.

## Installation

### Via marketplace

```
/plugin marketplace add
```

Select "GitHub repository" and enter `akurinnoy/ok-plugins`.

```
/plugin install ok-crossmodel-council@ok-plugins
```

### Local (for development)

```bash
claude --plugin-dir /path/to/ok-crossmodel-council
```

## Usage

```
/llm-council-crossmodel Should we use WebSockets or SSE for real-time updates in our dashboard?
```

Or trigger it conversationally — Claude will recognize queries that benefit from cross-model diversity.

## Comparison with /llm-council

| | /llm-council | /llm-council-crossmodel |
|---|---|---|
| Models | 1 (Claude, 5 sub-agents) | 3 (Claude, Gemini, GPT) |
| Diversity source | Thinking lenses (Contrarian, First Principles, etc.) | Different model architectures and training data |
| Advisors | 5 | 3 |
| Phases | 4 (frame, advise, review, synthesize) | 3 (answer, review, synthesize) |
| Output | HTML report + transcript | Inline verdict |
| Best for | Strategic decisions needing multiple human-like angles | Technical questions needing model-level diversity |

## Plugin Structure

```
ok-crossmodel-council/
├── .claude-plugin/
│   └── plugin.json              # Plugin manifest
├── skills/
│   └── llm-council-crossmodel/
│       └── SKILL.md             # Skill definition and trigger
├── workflows/
│   └── llm-council-crossmodel.js  # Workflow orchestration script
└── README.md
```

## Credits

Inspired by [Andrej Karpathy's LLM Council](https://github.com/karpathy/llm-council) — the idea of running multiple LLMs on the same question, having them peer-review each other, and synthesizing a verdict.

## License

See [LICENSE](../../LICENSE) in the repository root.
