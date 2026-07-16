export const meta = {
  name: "llm-council-crossmodel",
  description: "Multi-model LLM Council with configurable models",
  phases: [
    { title: "Preflight", detail: "Verify CLI tools and load model config" },
    { title: "First Opinions", detail: "All models answer independently in parallel" },
    { title: "Review & Distill", detail: "Peer review + position distillation in parallel" },
    { title: "Chairman Synthesis", detail: "Claude synthesizes the final verdict" },
    { title: "Logging", detail: "Persist structured verdict data" }
  ]
};

// ── Default model registry (used when no config file exists) ────────────────

var DEFAULT_MODELS = [
  { name: "claude-opus-4.6", provider: "anthropic", cli: "native" },
  { name: "fable-sonnet5", provider: "anthropic", cli: "agent --yolo --trust --model claude-sonnet-5-thinking-high -p -" },
  { name: "gemini-3.1-pro", provider: "google", cli: "gemini -y --skip-trust -m gemini-3.1-pro-preview -p -" },
  { name: "gpt-5.4", provider: "openai", cli: "agent --yolo --trust --model gpt-5.4-high -p -" },
  { name: "grok-4.5", provider: "xai", cli: "agent --yolo --trust --model cursor-grok-4.5-high -p -" }
]

// ── Preflight: load config and verify tools ─────────────────────────────────

phase("Preflight")
log("Loading model config and checking CLI tools...")

var configResult = await agent([
  "Read the council model config file and check CLI tools.",
  "",
  "Step 1: Try to read the config file:",
  "```bash",
  "cat \"$HOME/.claude/ok-council/models.json\" 2>/dev/null || echo '__NO_CONFIG__'",
  "```",
  "",
  "Step 2: Check CLI tools:",
  "```bash",
  "which gemini 2>/dev/null || echo 'NOT_FOUND'",
  "which agent 2>/dev/null || echo 'NOT_FOUND'",
  "```",
  "",
  "Return a JSON object with:",
  "- config: the parsed JSON from models.json, or null if the file doesn't exist (output was __NO_CONFIG__). The file may be a JSON array of models (old format) or a JSON object with a 'models' array and optional 'reviewers' number (new format). Return it as-is, preserving its structure.",
  "- gemini_path: the path from `which gemini`, or null if NOT_FOUND",
  "- agent_path: the path from `which agent`, or null if NOT_FOUND"
].join("\n"), {
  label: "config-loader",
  phase: "Preflight",
  schema: {
    type: "object",
    properties: {
      config: {},
      gemini_path: { type: ["string", "null"] },
      agent_path: { type: ["string", "null"] }
    },
    required: ["config", "gemini_path", "agent_path"]
  }
})

// Parse config — supports both old format (plain array) and new format ({models, reviewers})
var models = DEFAULT_MODELS
var configuredReviewerCount = 3
if (configResult.config) {
  if (Array.isArray(configResult.config)) {
    models = configResult.config
  } else if (configResult.config.models) {
    models = configResult.config.models
    if (configResult.config.reviewers) {
      configuredReviewerCount = configResult.config.reviewers
    }
  }
}
var modelCount = models.length

if (modelCount < 2) {
  return "# LLM Council — Config Error\n\nAt least 2 models are required. Found " + modelCount + " in config."
}

var needsGemini = models.some(function(m) { return m.cli.indexOf("gemini") !== -1 })
var needsAgent = models.some(function(m) { return m.cli !== "native" && m.cli.indexOf("gemini") === -1 })

var missing = []
if (needsGemini && !configResult.gemini_path) {
  missing.push("- **gemini** — install via `npm install -g @google/gemini-cli` or see https://github.com/google-gemini/gemini-cli")
}
if (needsAgent && !configResult.agent_path) {
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

var modelNames = models.map(function(m) { return m.name })
var configSource = configResult.config ? "models.json" : "defaults"
log("Loaded " + modelCount + " models from " + configSource + ": " + modelNames.join(", "))

// ── Helpers ──────────────────────────────────────────────────────────────────

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

function makeOpinionThunk(model, prompt) {
  if (model.cli === "native") {
    return function() { return agent(prompt, { label: model.name, phase: "First Opinions" }) }
  }
  return function() { return agent(buildShellRunnerPrompt(model.cli, prompt), { label: model.name, phase: "First Opinions" }) }
}

function makeReviewThunk(model, prompt) {
  if (model.cli === "native") {
    return function() { return agent(prompt, { label: model.name + "-review", phase: "Review & Distill" }) }
  }
  return function() { return agent(buildShellRunnerPrompt(model.cli, prompt), { label: model.name + "-review", phase: "Review & Distill" }) }
}

// ── Args parsing ────────────────────────────────────────────────────────────

var fullMode = typeof args === "string" && args.indexOf("--full") !== -1
var query = typeof args === "string" ? args.replace(/--full\s*/g, "").trim() : args

// ── Phase 1: First Opinions (parallel) ──────────────────────────────────────

var councilPrompt = [
  "A user has brought this question to a multi-model council. You are one of " + modelCount + " models answering independently.",
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

phase("First Opinions")
log("Querying " + modelCount + " models in parallel: " + modelNames.join(", "))

var opinionThunks = models.map(function(m) { return makeOpinionThunk(m, councilPrompt) })
var phase1 = await parallel(opinionThunks)

var modelResponses = {}
for (var i = 0; i < models.length; i++) {
  modelResponses[models[i].name] = phase1[i]
}

log("All " + modelCount + " first opinions collected.")

// ── Anonymization ───────────────────────────────────────────────────────────

var letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
var rotationOffset = query.length % modelCount

var anonMap = {}
var reverseMap = {}
for (var ai = 0; ai < modelCount; ai++) {
  var letter = letters[(ai + rotationOffset) % modelCount]
  anonMap[models[ai].name] = letter
  reverseMap[letter] = models[ai].name
}

var sortedLetters = Object.keys(reverseMap).sort()
var anonBlock = sortedLetters.map(function(letter) {
  var mName = reverseMap[letter]
  return "**Response " + letter + ":**\n" + (modelResponses[mName] || "(no response)")
}).join("\n\n")

// ── Phase 2: Anonymous Review + Distillation (parallel) ─────────────────────

var reviewPrompt = [
  "You are reviewing the outputs of a " + modelCount + "-model LLM Council. " + modelCount + " different AI models independently answered this question:",
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

var distillParts = [
  "You are a neutral analyst. Read the following " + modelCount + " model responses to a question and produce a structured summary of each.",
  "",
  "## Question",
  query,
  "",
  "## Responses",
  ""
]
for (var di = 0; di < models.length; di++) {
  distillParts.push("**" + models[di].name + ":**")
  distillParts.push(modelResponses[models[di].name] || "(no response - model failed)")
  distillParts.push("")
}
distillParts.push(
  "For each model that responded:",
  "- **position**: Summarize the model's conclusion and key recommendation in up to 150 words. Preserve the specific stance.",
  "- **reasoning**: List the key arguments as short comma-separated phrases (e.g., \"persistence needs, ecosystem maturity, operational simplicity\").",
  "- **failed**: Set to true if the response is an error message, connection failure, or empty. Set to false otherwise.",
  "",
  "For failed models, set position and reasoning to empty strings and failed to true.",
  "",
  "Also classify the query_domain as one of: architecture, code, ethics, factual, creative, strategy, debugging, other."
)
var distillationPrompt = distillParts.join("\n")

phase("Review & Distill")
var mappingStr = models.map(function(m) { return m.name + "=" + anonMap[m.name] }).join(", ")
log("Running anonymous cross-review + distillation (mapping: " + mappingStr + ")")

var reviewerCount = fullMode ? models.length : configuredReviewerCount
if (reviewerCount > models.length) reviewerCount = models.length
var reviewerOffset = query.length % models.length
var selectedReviewers = []
for (var ri = 0; ri < reviewerCount; ri++) {
  selectedReviewers.push(models[(reviewerOffset + ri) % models.length])
}

log("Review mode: " + (fullMode ? "full" : "simple") + " (" + reviewerCount + "/" + modelCount + " reviewers): " + selectedReviewers.map(function(m) { return m.name }).join(", "))

var reviewThunks = selectedReviewers.map(function(m) { return makeReviewThunk(m, reviewPrompt) })

// Build distillation schema dynamically from model names
var distillModelProps = {}
var distillModelRequired = []
for (var dsi = 0; dsi < models.length; dsi++) {
  distillModelProps[models[dsi].name] = {
    type: "object",
    properties: {
      position: { type: "string" },
      reasoning: { type: "string" },
      failed: { type: "boolean" }
    },
    required: ["position", "reasoning", "failed"]
  }
  distillModelRequired.push(models[dsi].name)
}

reviewThunks.push(function() {
  return agent(distillationPrompt, {
    label: "distiller",
    phase: "Review & Distill",
    model: "sonnet",
    schema: {
      type: "object",
      properties: {
        query_domain: { type: "string" },
        models: {
          type: "object",
          properties: distillModelProps,
          required: distillModelRequired
        }
      },
      required: ["query_domain", "models"]
    }
  })
})

var phase2 = await parallel(reviewThunks)

var reviewResults = {}
for (var rri = 0; rri < selectedReviewers.length; rri++) {
  reviewResults[selectedReviewers[rri].name] = phase2[rri]
}
var distillation = phase2[phase2.length - 1]

log("Reviews collected (" + selectedReviewers.length + "/" + modelCount + ") + distillation.")

// ── Post-Phase 2: Score Extraction ──────────────────────────────────────────

var scoreParts = [
  "Extract numerical scores and strongest-response picks from the peer reviews of a " + modelCount + "-model LLM Council. Some models may not have reviewed (marked as 'review not performed').",
  "",
  "The reviews used anonymized response letters. Here is the de-anonymization key:"
]
for (var ski = 0; ski < models.length; ski++) {
  scoreParts.push("Response " + anonMap[models[ski].name] + " = " + models[ski].name)
}
scoreParts.push("")
for (var srvi = 0; srvi < models.length; srvi++) {
  scoreParts.push("## Review by " + models[srvi].name + ":")
  scoreParts.push(reviewResults[models[srvi].name] || "(review not performed)")
  scoreParts.push("")
}
scoreParts.push(
  "For each review that contains scores, extract the accuracy and insight scores (1-10) for each model.",
  "Use the de-anonymization key to map letter responses back to model names.",
  "Return scores as arrays — one score per reviewer, in order: [" + modelNames.map(function(n) { return n + "-review" }).join(", ") + "]. Use null for reviewers that did not perform a review or didn't provide scores.",
  "",
  "For strongest_picks: which model did each reviewer pick as the strongest response? Map letters back to model names. Use null if the reviewer did not review."
)
var scorePrompt = scoreParts.join("\n")

log("Extracting structured scores from reviews...")

// Build score schema dynamically
var scoreModelProps = {}
var scoreModelRequired = []
var pickProps = {}
var pickRequired = []
for (var ssi = 0; ssi < models.length; ssi++) {
  scoreModelProps[models[ssi].name] = {
    type: ["object", "null"],
    properties: {
      accuracy: { type: "array", items: { type: ["integer", "null"] } },
      insight: { type: "array", items: { type: ["integer", "null"] } }
    },
    required: ["accuracy", "insight"]
  }
  scoreModelRequired.push(models[ssi].name)
  pickProps[models[ssi].name] = { type: ["string", "null"] }
  pickRequired.push(models[ssi].name)
}

var scores = await agent(scorePrompt, {
  label: "score-extractor",
  phase: "Review & Distill",
  model: "sonnet",
  schema: {
    type: "object",
    properties: {
      scores: {
        type: "object",
        properties: scoreModelProps,
        required: scoreModelRequired
      },
      strongest_picks: {
        type: "object",
        properties: pickProps,
        required: pickRequired
      }
    },
    required: ["scores", "strongest_picks"]
  }
})

// ── Phase 3: Chairman Synthesis ─────────────────────────────────────────────

var chairmanParts = [
  "You are the Chairman of a " + modelCount + "-model LLM Council. " + modelCount + " different AI models (" + modelNames.join(", ") + ") answered a question independently, then " + selectedReviewers.length + " of them peer-reviewed each other anonymously.",
  "",
  "Your job: synthesize everything into a clear, actionable verdict.",
  "",
  "## The Question",
  "",
  query,
  "",
  "## Model Responses (de-anonymized)",
  ""
]
for (var cri = 0; cri < models.length; cri++) {
  chairmanParts.push("**" + models[cri].name + ":**")
  chairmanParts.push(modelResponses[models[cri].name] || "(no response)")
  chairmanParts.push("")
}
chairmanParts.push("## Anonymous Peer Reviews (" + selectedReviewers.length + " of " + modelCount + " models reviewed)")
chairmanParts.push("")
for (var crri = 0; crri < selectedReviewers.length; crri++) {
  var revText = reviewResults[selectedReviewers[crri].name] || "(review failed)"
  chairmanParts.push("**Review " + (crri + 1) + " (by " + selectedReviewers[crri].name + "):**\n" + revText + "\n")
}
chairmanParts.push("## Anonymization Key (for your reference)")
for (var caki = 0; caki < models.length; caki++) {
  chairmanParts.push("Response " + anonMap[models[caki].name] + " = " + models[caki].name)
}
chairmanParts.push(
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
  "[Your synthesized answer to the original question. Be direct. You may side with one model over the others if its reasoning is strongest. Incorporate the best insights from all of them.]",
  "",
  "Be direct. Do not hedge. The whole point of the council is to give the user more clarity than any single model could provide alone."
)
var chairmanPrompt = chairmanParts.join("\n")

phase("Chairman Synthesis")
log("Chairman synthesizing final verdict...")

var verdict = await agent(chairmanPrompt, { label: "chairman", phase: "Chairman Synthesis" })

// ── Phase 4: Logging ────────────────────────────────────────────────────────

phase("Logging")
log("Persisting verdict data...")

var sourceParts = [
  "Compare the following chairman synthesis against each model's position. Identify which models' answers most directly influenced the synthesis — whose specific recommendations, arguments, or framings appear in the final verdict.",
  "",
  "## Chairman Synthesis",
  verdict,
  "",
  "## Model Positions",
  ""
]
for (var spi = 0; spi < models.length; spi++) {
  var pos = distillation.models[models[spi].name]
  sourceParts.push("**" + models[spi].name + ":** " + (pos && !pos.failed ? pos.position : "(failed)"))
}
sourceParts.push("")
sourceParts.push("Return the list of model names whose positions materially influenced the synthesis.")
var chairmanSourcePrompt = sourceParts.join("\n")

var chairmanSources = await agent(chairmanSourcePrompt, {
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

// Build log entry from model list
var positions = {}
var reasoningSummaries = {}
var modelMeta = []
var peerScores = {}
var strongestPicks = {}

for (var li = 0; li < models.length; li++) {
  var m = models[li]
  var d = distillation.models[m.name]
  positions[m.name] = d && !d.failed ? d.position : null
  reasoningSummaries[m.name] = d && !d.failed ? d.reasoning : null
  modelMeta.push({
    name: m.name,
    provider: m.provider,
    cli: m.cli,
    tokens_in: null,
    tokens_out: null,
    latency_ms: null,
    cost_estimate_usd: null,
    failed: d ? d.failed : true,
    failure_reason: (d && d.failed) ? "Model failed to produce a valid response" : null
  })
  peerScores[m.name] = (scores.scores && scores.scores[m.name]) || null
  strongestPicks[m.name] = (scores.strongest_picks && scores.strongest_picks[m.name]) || null
}

var logEntry = {
  schema_version: 2,
  run_id: "council-placeholder",
  timestamp: null,
  query: query,
  query_domain: distillation.query_domain,
  review_mode: fullMode ? "full" : "simple",
  reviewers: selectedReviewers.map(function(m) { return m.name }),
  models: modelMeta,
  positions: positions,
  reasoning_summaries: reasoningSummaries,
  peer_scores: peerScores,
  strongest_picks: strongestPicks,
  chairman_source_models: chairmanSources.source_models,
  human_verdict: null
}

var logJson = JSON.stringify(logEntry)

// Build response file write commands dynamically
var responseWriteCmds = []
for (var rwi = 0; rwi < models.length; rwi++) {
  responseWriteCmds.push(
    "```bash",
    "cat > \"$HOME/.claude/ok-council/logs/responses/$RUN_ID/" + models[rwi].name + ".md\" <<'__COUNCIL_RESPONSE_7f3a9e2__'",
    (modelResponses[models[rwi].name] || ""),
    "__COUNCIL_RESPONSE_7f3a9e2__",
    "```",
    ""
  )
}

// Build reviews JSON dynamically
var reviewsObj = {}
for (var rji = 0; rji < models.length; rji++) {
  reviewsObj[models[rji].name] = reviewResults[models[rji].name] || null
}

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
  "3. Write each model's raw response to its own file:"
].concat(responseWriteCmds).concat([
  "4. Update the log JSON with the real timestamp and run_id, then append to the JSONL file.",
  "Take this JSON template and replace the run_id and timestamp fields with the values from step 1:",
  "",
  "```",
  logJson,
  "```",
  "",
  "Use jq or sed to replace:",
  '- "run_id":"council-placeholder" with "run_id":"$RUN_ID"',
  '- "timestamp":null with "timestamp":"$TIMESTAMP"',
  "",
  "Then append the updated JSON as a single line to:",
  "`$HOME/.claude/ok-council/logs/councils.jsonl`",
  "",
  "5. Also write the raw review texts for future reference:",
  "```bash",
  "cat > \"$HOME/.claude/ok-council/logs/responses/$RUN_ID/reviews.json\" <<'__COUNCIL_REVIEW_7f3a9e2__'",
  JSON.stringify(reviewsObj),
  "__COUNCIL_REVIEW_7f3a9e2__",
  "```",
  "",
  "Return the RUN_ID and TIMESTAMP when done."
]).join("\n")

var logResult = await agent(logWriterPrompt, { label: "log-writer", phase: "Logging" })
log("Verdict data persisted. " + logResult)

// ── Output ──────────────────────────────────────────────────────────────────

var anonMappingStr = models.map(function(m) { return m.name + "=" + anonMap[m.name] }).join(", ")

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
  "*Council: " + modelNames.join(", ") + " (" + configSource + ")*",
  "*Anonymization: " + anonMappingStr + "*",
  "*Review mode: " + (fullMode ? "full (" + modelCount + "/" + modelCount + " reviewers)" : "simple (" + selectedReviewers.length + "/" + modelCount + " reviewers) | Use --full for all " + modelCount) + "*"
].join("\n");
