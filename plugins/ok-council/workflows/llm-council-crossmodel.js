export const meta = {
  name: "llm-council-crossmodel",
  description: "5-model LLM Council: Claude Opus, Fable (Sonnet 5), Gemini 3.1 Pro, GPT-5.4, Grok 4.5",
  phases: [
    { title: "Preflight", detail: "Verify required CLI tools are installed" },
    { title: "First Opinions", detail: "All 5 models answer independently in parallel" },
    { title: "Review & Distill", detail: "Peer review + position distillation in parallel" },
    { title: "Chairman Synthesis", detail: "Claude synthesizes the final verdict" },
    { title: "Logging", detail: "Persist structured verdict data" }
  ]
};

// ── Preflight: verify external tools ────────────────────────────────────────

phase("Preflight")
log("Checking that gemini and agent CLIs are available...")

const toolChecks = await agent([
  "Check whether two CLI tools are installed and available on $PATH.",
  "Run these two commands via Bash (run them in parallel if possible):",
  "",
  "1. `which gemini`",
  "2. `which agent`",
  "",
  "For each tool, report whether it was found or not.",
  "Return your answer as a JSON object with this exact shape (no markdown fences, just raw JSON):",
  "",
  '{"gemini": {"found": true, "path": "/usr/local/bin/gemini"}, "agent": {"found": true, "path": "/usr/local/bin/agent"}}',
  "",
  "Use the actual path from `which`, or set found to false and path to null if not found."
].join("\n"), {
  label: "tool-check",
  phase: "Preflight",
  schema: {
    type: "object",
    properties: {
      gemini: {
        type: "object",
        properties: {
          found: { type: "boolean" },
          path: { type: ["string", "null"] }
        },
        required: ["found", "path"]
      },
      agent: {
        type: "object",
        properties: {
          found: { type: "boolean" },
          path: { type: ["string", "null"] }
        },
        required: ["found", "path"]
      }
    },
    required: ["gemini", "agent"]
  }
})

const missing = []
if (!toolChecks.gemini.found) {
  missing.push("- **gemini** — install via `npm install -g @google/gemini-cli` or see https://github.com/google-gemini/gemini-cli")
}
if (!toolChecks.agent.found) {
  missing.push("- **agent** — installed with Cursor; make sure `agent` is on your $PATH")
}

if (missing.length > 0) {
  return [
    "# LLM Council — Preflight Failed",
    "",
    "The following required CLI tools are not installed or not on your $PATH:",
    "",
    ...missing,
    "",
    "Install the missing tools and try again."
  ].join("\n")
}

log("All tools verified: gemini at " + toolChecks.gemini.path + ", agent at " + toolChecks.agent.path)

// ── Helpers ──────────────────────────────────────────────────────────────────

// Note: shellEscape function was removed - heredocs with <<'DELIM' treat everything as literal,
// so single-quote escaping corrupts the saved content

function buildShellRunnerPrompt(cliCommand, queryText) {
  return [
    "You are a shell runner agent. Your ONLY job is to run a CLI command via the Bash tool and return the raw stdout output.",
    "",
    "Run this exact command via Bash:",
    "",
    "```",
    "cat <<'COUNCIL_PROMPT_EOF' | " + cliCommand,
    queryText,
    "COUNCIL_PROMPT_EOF",
    "```",
    "",
    "Rules:",
    "- Run the command above using the Bash tool.",
    "- Return ONLY the text output from the command. Nothing else.",
    "- Do NOT add commentary, summaries, formatting, or wrappers.",
    "- Do NOT modify the prompt text.",
    "- If the command fails, return the error message verbatim."
  ].join("\n");
}

// ── Model definitions ───────────────────────────────────────────────────────

const MODEL_REGISTRY = [
  { name: "claude-opus-4.6", provider: "anthropic", version: "claude-opus-4-6[1m]" },
  { name: "fable-sonnet5", provider: "anthropic", version: "claude-sonnet-5-thinking-high" },
  { name: "gemini-3.1-pro", provider: "google", version: "gemini-3.1-pro-preview" },
  { name: "gpt-5.4", provider: "openai", version: "gpt-5.4-high" },
  { name: "grok-4.5", provider: "xai", version: "cursor-grok-4.5-high" }
]

// ── Phase 1: First Opinions (parallel) ──────────────────────────────────────

const query = args;

const claudePrompt = [
  "A user has brought this question to a multi-model council. You are one of five models answering independently.",
  "",
  "Question:",
  "---",
  query,
  "---",
  "",
  "Give your best, most thorough answer. Be direct and specific.",
  "Do not hedge or disclaim. Lean into your analysis.",
  "Keep your response between 200-400 words. No preamble. Go straight into your answer."
].join("\n");

const geminiCliCommand = "gemini -y --skip-trust -m gemini-3.1-pro-preview -p -";
const cursorGptCliCommand = "agent --yolo --trust --model gpt-5.4-high -p -";
const cursorFableCliCommand = "agent --yolo --trust --model claude-sonnet-5-thinking-high -p -";
const cursorGrokCliCommand = "agent --yolo --trust --model cursor-grok-4.5-high -p -";

phase("First Opinions")
log("Querying Claude Opus, Fable (Sonnet 5), Gemini 3.1 Pro, GPT-5.4, and Grok 4.5 in parallel...")

const phase1 = await parallel([
  () => agent(claudePrompt, { label: "claude-opus", phase: "First Opinions" }),
  () => agent(buildShellRunnerPrompt(cursorFableCliCommand, claudePrompt), { label: "fable-sonnet5", phase: "First Opinions" }),
  () => agent(buildShellRunnerPrompt(geminiCliCommand, claudePrompt), { label: "gemini-3.1-pro", phase: "First Opinions" }),
  () => agent(buildShellRunnerPrompt(cursorGptCliCommand, claudePrompt), { label: "gpt-5.4", phase: "First Opinions" }),
  () => agent(buildShellRunnerPrompt(cursorGrokCliCommand, claudePrompt), { label: "grok-4.5", phase: "First Opinions" })
])

const claudeResponse = phase1[0];
const fableResponse = phase1[1];
const geminiResponse = phase1[2];
const cursorResponse = phase1[3];
const grokResponse = phase1[4];

log("All 5 first opinions collected.")

// ── Anonymization ───────────────────────────────────────────────────────────

const responses = [
  { model: "Claude", text: claudeResponse },
  { model: "Fable", text: fableResponse },
  { model: "Gemini", text: geminiResponse },
  { model: "Cursor/GPT", text: cursorResponse },
  { model: "Grok", text: grokResponse }
];

const rotations = [
  ["A", "B", "C", "D", "E"],
  ["B", "C", "D", "E", "A"],
  ["C", "D", "E", "A", "B"],
  ["D", "E", "A", "B", "C"],
  ["E", "A", "B", "C", "D"]
];
const rotation = rotations[query.length % 5];

const anonMap = {};
const reverseMap = {};
for (let i = 0; i < 5; i++) {
  anonMap[responses[i].model] = rotation[i];
  reverseMap[rotation[i]] = responses[i].model;
}

const anonBlock = rotation
  .slice()
  .sort()
  .map(function(letter) {
    const model = reverseMap[letter];
    const resp = responses.find(function(r) { return r.model === model; });
    return "**Response " + letter + ":**\n" + resp.text;
  })
  .join("\n\n");

// ── Phase 2: Anonymous Review + Distillation (parallel) ─────────────────────

const reviewPrompt = [
  "You are reviewing the outputs of a 5-model LLM Council. Five different AI models independently answered this question:",
  "",
  "---",
  query,
  "---",
  "",
  "Here are their anonymized responses:",
  "",
  anonBlock,
  "",
  "Score each response on two dimensions (1-10 each):",
  "- **Accuracy**: How factually correct and well-reasoned is the response?",
  "- **Insight**: How much unique, non-obvious value does it add?",
  "",
  "Then answer:",
  "1. Which response is the strongest? Why? (pick one letter)",
  "2. Which response has the biggest blind spot? What is it missing?",
  "3. What did ALL responses miss that should be considered?",
  "",
  "Format your scores as a table, then answer the three questions.",
  "Be specific. Reference responses by letter. Keep your review under 250 words. Be direct."
].join("\n");

const distillationPrompt = [
  "You are a neutral analyst. Read the following five model responses to a question and produce a structured summary of each.",
  "",
  "## Question",
  query,
  "",
  "## Responses",
  "",
  "**claude-opus-4.6:**",
  claudeResponse || "(no response - model failed)",
  "",
  "**fable-sonnet5:**",
  fableResponse || "(no response - model failed)",
  "",
  "**gemini-3.1-pro:**",
  geminiResponse || "(no response - model failed)",
  "",
  "**gpt-5.4:**",
  cursorResponse || "(no response - model failed)",
  "",
  "**grok-4.5:**",
  grokResponse || "(no response - model failed)",
  "",
  "For each model that responded:",
  "- **position**: Summarize the model's conclusion and key recommendation in up to 150 words. Preserve the specific stance.",
  "- **reasoning**: List the key arguments as short comma-separated phrases (e.g., \"persistence needs, ecosystem maturity, operational simplicity\").",
  "- **failed**: Set to true if the response is an error message, connection failure, or empty. Set to false otherwise.",
  "",
  "For failed models, set position and reasoning to empty strings and failed to true.",
  "",
  "Also classify the query_domain as one of: architecture, code, ethics, factual, creative, strategy, debugging, other."
].join("\n");

phase("Review & Distill")
log("Running anonymous cross-review + position distillation (mapping: Claude=" + anonMap["Claude"] + ", Fable=" + anonMap["Fable"] + ", Gemini=" + anonMap["Gemini"] + ", Cursor/GPT=" + anonMap["Cursor/GPT"] + ", Grok=" + anonMap["Grok"] + ")")

const phase2 = await parallel([
  () => agent(reviewPrompt, { label: "claude-review", phase: "Review & Distill" }),
  () => agent(buildShellRunnerPrompt(cursorFableCliCommand, reviewPrompt), { label: "fable-review", phase: "Review & Distill" }),
  () => agent(buildShellRunnerPrompt(geminiCliCommand, reviewPrompt), { label: "gemini-review", phase: "Review & Distill" }),
  () => agent(buildShellRunnerPrompt(cursorGptCliCommand, reviewPrompt), { label: "cursor-review", phase: "Review & Distill" }),
  () => agent(buildShellRunnerPrompt(cursorGrokCliCommand, reviewPrompt), { label: "grok-review", phase: "Review & Distill" }),
  () => agent(distillationPrompt, {
    label: "distiller",
    phase: "Review & Distill",
    model: "sonnet",
    schema: {
      type: "object",
      properties: {
        query_domain: { type: "string" },
        models: {
          type: "object",
          properties: {
            "claude-opus-4.6": {
              type: "object",
              properties: {
                position: { type: "string" },
                reasoning: { type: "string" },
                failed: { type: "boolean" }
              },
              required: ["position", "reasoning", "failed"]
            },
            "fable-sonnet5": {
              type: "object",
              properties: {
                position: { type: "string" },
                reasoning: { type: "string" },
                failed: { type: "boolean" }
              },
              required: ["position", "reasoning", "failed"]
            },
            "gemini-3.1-pro": {
              type: "object",
              properties: {
                position: { type: "string" },
                reasoning: { type: "string" },
                failed: { type: "boolean" }
              },
              required: ["position", "reasoning", "failed"]
            },
            "gpt-5.4": {
              type: "object",
              properties: {
                position: { type: "string" },
                reasoning: { type: "string" },
                failed: { type: "boolean" }
              },
              required: ["position", "reasoning", "failed"]
            },
            "grok-4.5": {
              type: "object",
              properties: {
                position: { type: "string" },
                reasoning: { type: "string" },
                failed: { type: "boolean" }
              },
              required: ["position", "reasoning", "failed"]
            }
          },
          required: ["claude-opus-4.6", "fable-sonnet5", "gemini-3.1-pro", "gpt-5.4", "grok-4.5"]
        }
      },
      required: ["query_domain", "models"]
    }
  })
])

const claudeReview = phase2[0];
const fableReview = phase2[1];
const geminiReview = phase2[2];
const cursorReview = phase2[3];
const grokReview = phase2[4];
const distillation = phase2[5];

log("All 5 reviews + distillation collected.")

// ── Post-Phase 2: Score Extraction ──────────────────────────────────────────

// Removed unused modelNames variable

const scorePrompt = [
  "Extract numerical scores and strongest-response picks from these five peer reviews of a 5-model LLM Council.",
  "",
  "The reviews used anonymized response letters. Here is the de-anonymization key:",
  "Response " + anonMap["Claude"] + " = claude-opus-4.6",
  "Response " + anonMap["Fable"] + " = fable-sonnet5",
  "Response " + anonMap["Gemini"] + " = gemini-3.1-pro",
  "Response " + anonMap["Cursor/GPT"] + " = gpt-5.4",
  "Response " + anonMap["Grok"] + " = grok-4.5",
  "",
  "## Review by claude-opus-4.6:",
  claudeReview || "(review failed)",
  "",
  "## Review by fable-sonnet5:",
  fableReview || "(review failed)",
  "",
  "## Review by gemini-3.1-pro:",
  geminiReview || "(review failed)",
  "",
  "## Review by gpt-5.4:",
  cursorReview || "(review failed)",
  "",
  "## Review by grok-4.5:",
  grokReview || "(review failed)",
  "",
  "For each review that contains scores, extract the accuracy and insight scores (1-10) for each model.",
  "Use the de-anonymization key to map letter responses back to model names.",
  "Return scores as arrays — one score per reviewer that provided scores, in order: [claude-review, fable-review, gemini-review, gpt-review, grok-review]. Use null for reviewers that failed or didn't provide scores.",
  "",
  "For strongest_picks: which model did each reviewer pick as the strongest response? Map letters back to model names. Use null if the reviewer failed."
].join("\n");

log("Extracting structured scores from reviews...")

const scores = await agent(scorePrompt, {
  label: "score-extractor",
  phase: "Review & Distill",
  model: "sonnet",
  schema: {
    type: "object",
    properties: {
      scores: {
        type: "object",
        properties: {
          "claude-opus-4.6": {
            type: ["object", "null"],
            properties: {
              accuracy: { type: "array", items: { type: ["integer", "null"] } },
              insight: { type: "array", items: { type: ["integer", "null"] } }
            },
            required: ["accuracy", "insight"]
          },
          "fable-sonnet5": {
            type: ["object", "null"],
            properties: {
              accuracy: { type: "array", items: { type: ["integer", "null"] } },
              insight: { type: "array", items: { type: ["integer", "null"] } }
            },
            required: ["accuracy", "insight"]
          },
          "gemini-3.1-pro": {
            type: ["object", "null"],
            properties: {
              accuracy: { type: "array", items: { type: ["integer", "null"] } },
              insight: { type: "array", items: { type: ["integer", "null"] } }
            },
            required: ["accuracy", "insight"]
          },
          "gpt-5.4": {
            type: ["object", "null"],
            properties: {
              accuracy: { type: "array", items: { type: ["integer", "null"] } },
              insight: { type: "array", items: { type: ["integer", "null"] } }
            },
            required: ["accuracy", "insight"]
          },
          "grok-4.5": {
            type: ["object", "null"],
            properties: {
              accuracy: { type: "array", items: { type: ["integer", "null"] } },
              insight: { type: "array", items: { type: ["integer", "null"] } }
            },
            required: ["accuracy", "insight"]
          }
        },
        required: ["claude-opus-4.6", "fable-sonnet5", "gemini-3.1-pro", "gpt-5.4", "grok-4.5"]
      },
      strongest_picks: {
        type: "object",
        properties: {
          "claude-opus-4.6": { type: ["string", "null"] },
          "fable-sonnet5": { type: ["string", "null"] },
          "gemini-3.1-pro": { type: ["string", "null"] },
          "gpt-5.4": { type: ["string", "null"] },
          "grok-4.5": { type: ["string", "null"] }
        },
        required: ["claude-opus-4.6", "fable-sonnet5", "gemini-3.1-pro", "gpt-5.4", "grok-4.5"]
      }
    },
    required: ["scores", "strongest_picks"]
  }
})

// ── Phase 3: Chairman Synthesis ─────────────────────────────────────────────

const chairmanPrompt = [
  "You are the Chairman of a 5-model LLM Council. Five different AI models (Claude Opus 4.6, Fable/Sonnet 5, Gemini 3.1 Pro, GPT-5.4, Grok 4.5) answered a question independently, then peer-reviewed each other anonymously.",
  "",
  "Your job: synthesize everything into a clear, actionable verdict.",
  "",
  "## The Question",
  "",
  query,
  "",
  "## Model Responses (de-anonymized)",
  "",
  "**Claude (Opus 4.6):**",
  claudeResponse,
  "",
  "**Fable (Sonnet 5):**",
  fableResponse,
  "",
  "**Gemini (gemini-3.1-pro-preview):**",
  geminiResponse,
  "",
  "**Cursor/GPT (gpt-5.4):**",
  cursorResponse,
  "",
  "**Grok (grok-4.5):**",
  grokResponse,
  "",
  "## Anonymous Peer Reviews",
  "",
  "**Review 1:**",
  claudeReview,
  "",
  "**Review 2:**",
  fableReview,
  "",
  "**Review 3:**",
  geminiReview,
  "",
  "**Review 4:**",
  cursorReview,
  "",
  "**Review 5:**",
  grokReview,
  "",
  "## Anonymization Key (for your reference)",
  "Response " + anonMap["Claude"] + " = Claude",
  "Response " + anonMap["Fable"] + " = Fable",
  "Response " + anonMap["Gemini"] + " = Gemini",
  "Response " + anonMap["Cursor/GPT"] + " = Cursor/GPT",
  "Response " + anonMap["Grok"] + " = Grok",
  "",
  "Produce the council verdict using this EXACT structure with these markdown headers:",
  "",
  "## Where the Council Agrees",
  "[Points multiple models converged on independently. High-confidence signals.]",
  "",
  "## Where the Council Clashes",
  "[Genuine disagreements between models. Present both sides. Explain WHY the models diverge - different training data? Different reasoning approaches? Different implicit assumptions?]",
  "",
  "## Review Highlights",
  "[Key insights from the peer review round. What did reviewers catch that the original responses missed? Which response was rated strongest and why?]",
  "",
  "## Final Answer",
  "[Your synthesized answer to the original question. Be direct. You may side with one model over the others if its reasoning is strongest. Incorporate the best insights from all four.]",
  "",
  "Be direct. Do not hedge. The whole point of the council is to give the user more clarity than any single model could provide alone."
].join("\n");

phase("Chairman Synthesis")
log("Chairman (Claude Opus 4.6) synthesizing final verdict...")

const verdict = await agent(chairmanPrompt, { label: "chairman", phase: "Chairman Synthesis" })

// ── Phase 4: Logging ────────────────────────────────────────────────────────

phase("Logging")
log("Persisting verdict data...")

const chairmanSourcePrompt = [
  "Compare the following chairman synthesis against each model's position. Identify which models' answers most directly influenced the synthesis — whose specific recommendations, arguments, or framings appear in the final verdict.",
  "",
  "## Chairman Synthesis",
  verdict,
  "",
  "## Model Positions",
  "",
  "**claude-opus-4.6:** " + (distillation.models["claude-opus-4.6"].position || "(failed)"),
  "**fable-sonnet5:** " + (distillation.models["fable-sonnet5"].position || "(failed)"),
  "**gemini-3.1-pro:** " + (distillation.models["gemini-3.1-pro"].position || "(failed)"),
  "**gpt-5.4:** " + (distillation.models["gpt-5.4"].position || "(failed)"),
  "**grok-4.5:** " + (distillation.models["grok-4.5"].position || "(failed)"),
  "",
  "Return the list of model names whose positions materially influenced the synthesis."
].join("\n");

const chairmanSources = await agent(chairmanSourcePrompt, {
  label: "source-detector",
  phase: "Logging",
  model: "sonnet",
  schema: {
    type: "object",
    properties: {
      source_models: {
        type: "array",
        items: { type: "string" }
      }
    },
    required: ["source_models"]
  }
})

// Build positions and reasoning objects, mapping nulls for failed models
const positions = {}
const reasoningSummaries = {}
const modelMeta = []

for (var mi = 0; mi < MODEL_REGISTRY.length; mi++) {
  var m = MODEL_REGISTRY[mi]
  var d = distillation.models[m.name]
  positions[m.name] = d.failed ? null : d.position
  reasoningSummaries[m.name] = d.failed ? null : d.reasoning
  modelMeta.push({
    name: m.name,
    version: m.version,
    provider: m.provider,
    tokens_in: null,
    tokens_out: null,
    latency_ms: null,
    cost_estimate_usd: null,
    failed: d.failed,
    failure_reason: d.failed ? "Model failed to produce a valid response" : null
  })
}

// Build peer_scores with nulls for failed models
var peerScores = {}
for (var si = 0; si < MODEL_REGISTRY.length; si++) {
  var sm = MODEL_REGISTRY[si].name
  peerScores[sm] = scores.scores[sm] || null
}

// strongest_picks with nulls for failed models
var strongestPicks = {}
for (var pi = 0; pi < MODEL_REGISTRY.length; pi++) {
  var pm = MODEL_REGISTRY[pi].name
  strongestPicks[pm] = scores.strongest_picks[pm] || null
}

var logEntry = {
  schema_version: 1,
  run_id: "council-" + query.length + "-" + rotation.join(""),
  timestamp: null,
  query: query,
  query_domain: distillation.query_domain,
  prompt_hash: null,
  models: modelMeta,
  positions: positions,
  reasoning_summaries: reasoningSummaries,
  peer_scores: peerScores,
  strongest_picks: strongestPicks,
  chairman_source_models: chairmanSources.source_models,
  human_verdict: null
}

var logJson = JSON.stringify(logEntry)

var logWriterPrompt = [
  "Write council verdict data to disk. Run these Bash commands:",
  "",
  "1. Get a timestamp and generate a unique run ID:",
  "```bash",
  "TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "RUN_ID=\"council-$(date +%s%N)\"",
  "```",
  "",
  "2. Create directories:",
  "```bash",
  "mkdir -p \"$HOME/.claude/ok-council/logs/responses/$RUN_ID\"",
  "```",
  "",
  "3. Write each model's raw response to its own file:",
  "```bash",
  "cat > \"$HOME/.claude/ok-council/logs/responses/$RUN_ID/claude-opus-4.6.md\" <<'__COUNCIL_RESPONSE_7f3a9e2__'",
  (claudeResponse || ""),
  "__COUNCIL_RESPONSE_7f3a9e2__",
  "```",
  "",
  "```bash",
  "cat > \"$HOME/.claude/ok-council/logs/responses/$RUN_ID/fable-sonnet5.md\" <<'__COUNCIL_RESPONSE_7f3a9e2__'",
  (fableResponse || ""),
  "__COUNCIL_RESPONSE_7f3a9e2__",
  "```",
  "",
  "```bash",
  "cat > \"$HOME/.claude/ok-council/logs/responses/$RUN_ID/gemini-3.1-pro.md\" <<'__COUNCIL_RESPONSE_7f3a9e2__'",
  (geminiResponse || ""),
  "__COUNCIL_RESPONSE_7f3a9e2__",
  "```",
  "",
  "```bash",
  "cat > \"$HOME/.claude/ok-council/logs/responses/$RUN_ID/gpt-5.4.md\" <<'__COUNCIL_RESPONSE_7f3a9e2__'",
  (cursorResponse || ""),
  "__COUNCIL_RESPONSE_7f3a9e2__",
  "```",
  "",
  "```bash",
  "cat > \"$HOME/.claude/ok-council/logs/responses/$RUN_ID/grok-4.5.md\" <<'__COUNCIL_RESPONSE_7f3a9e2__'",
  (grokResponse || ""),
  "__COUNCIL_RESPONSE_7f3a9e2__",
  "```",
  "",
  "4. Update the log JSON with the real timestamp and run_id, then append to the JSONL file.",
  "Take this JSON template and replace the run_id and timestamp fields with the values from step 1:",
  "",
  "```",
  logJson,
  "```",
  "",
  "Use jq or sed to replace:",
  '- "run_id": "council-..." with "run_id": "$RUN_ID"',
  '- "timestamp": null with "timestamp": "$TIMESTAMP"',
  "",
  "Then append the updated JSON as a single line to:",
  "`$HOME/.claude/ok-council/logs/councils.jsonl`",
  "",
  "5. Also write the raw review texts for future reference:",
  "```bash",
  "cat > \"$HOME/.claude/ok-council/logs/responses/$RUN_ID/reviews.json\" <<'__COUNCIL_REVIEW_7f3a9e2__'",
  JSON.stringify({
    "claude-opus-4.6": claudeReview || null,
    "fable-sonnet5": fableReview || null,
    "gemini-3.1-pro": geminiReview || null,
    "gpt-5.4": cursorReview || null,
    "grok-4.5": grokReview || null
  }),
  "__COUNCIL_REVIEW_7f3a9e2__",
  "```",
  "",
  "Return the RUN_ID and TIMESTAMP when done."
].join("\n");

var logResult = await agent(logWriterPrompt, { label: "log-writer", phase: "Logging" })
log("Verdict data persisted. " + logResult)

// ── Output ──────────────────────────────────────────────────────────────────

return [
  "# LLM Council Cross-Model — Verdict",
  "",
  "**Query:** " + query,
  "",
  "---",
  "",
  verdict,
  "",
  "---",
  "",
  "*Council composition: Claude Opus 4.6, Fable (Sonnet 5), Gemini 3.1 Pro (gemini-3.1-pro-preview), GPT-5.4, Grok 4.5*",
  "*Anonymization mapping: Claude=" + anonMap["Claude"] + ", Fable=" + anonMap["Fable"] + ", Gemini=" + anonMap["Gemini"] + ", Cursor/GPT=" + anonMap["Cursor/GPT"] + ", Grok=" + anonMap["Grok"] + "*"
].join("\n");
