export const meta = {
  name: "llm-council-crossmodel",
  description: "Multi-model LLM Council with configurable models",
  phases: [
    { title: "First Opinions", detail: "All models answer independently in parallel" },
    { title: "Review & Distill", detail: "Peer review + position distillation in parallel" },
    { title: "Chairman Synthesis", detail: "Claude synthesizes the final verdict" },
    { title: "Logging", detail: "Persist structured verdict data" }
  ]
};

// ── Default model registry (used when no config file exists) ────────────────

var DEFAULT_MODELS = [
  { name: "claude-opus-4.6", provider: "anthropic", cli: "native" },
  { name: "gemini-3.1-pro", provider: "google", cli: "gemini -y --skip-trust -m gemini-3.1-pro-preview -p -" },
  { name: "gpt-5.4", provider: "openai", cli: "agent --yolo --trust --model gpt-5.4-high -p -" }
]

// ── Config: parse from args (preflight done in skill file) ─────────────────

var models = DEFAULT_MODELS
var configuredReviewerCount = 3
var loggingEnabled = false
var query = ""
var fullMode = false

if (args && typeof args === "object" && args.query) {
  query = args.query
  fullMode = !!args.fullMode
  if (args.config) {
    if (Array.isArray(args.config.models) && args.config.models.length > 0) {
      models = args.config.models
    }
    if (args.config.reviewerCount) {
      configuredReviewerCount = args.config.reviewerCount
    }
    if (args.config.loggingEnabled) {
      loggingEnabled = true
    }
  }
  // Validate CLI tools
  if (args.tools) {
    var needsGemini = models.some(function(m) { return m.cli.indexOf("gemini") !== -1 })
    var needsAgent = models.some(function(m) { return m.cli !== "native" && m.cli.indexOf("gemini") === -1 })
    var missing = []
    if (needsGemini && !args.tools.gemini) {
      missing.push("- **gemini** — install via `npm install -g @google/gemini-cli` or see https://github.com/google-gemini/gemini-cli")
    }
    if (needsAgent && !args.tools.agent) {
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
  }
} else {
  // Legacy: args is a plain string
  var rawArgs = typeof args === "string" ? args : ""
  fullMode = rawArgs.indexOf("--full") !== -1
  query = rawArgs.replace(/--full\s*/g, "").trim()
}

var modelCount = models.length

if (modelCount < 2) {
  return "# LLM Council — Config Error\n\nAt least 2 models are required. Found " + modelCount + " in config."
}

var modelNames = models.map(function(m) { return m.name })
var configSource = (args && typeof args === "object" && args.config) ? "models.json" : "defaults"
log("Loaded " + modelCount + " models from " + configSource + ": " + modelNames.join(", ") + " | logging: " + (loggingEnabled ? "on" : "off"))

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

// ── Phase 2: Anonymous Review (skip for ≤3 models) ────────────────────────

var reviewsSkipped = modelCount <= 3
var reviewResults = {}
var distillation = null
var selectedReviewers = []

if (reviewsSkipped) {
  phase("Review & Distill")
  log("Skipping peer review (≤" + "3 models — chairman synthesizes directly)")

  // Still run distiller if logging is enabled
  if (loggingEnabled) {
    log("Running analyst distillation for logging...")
    distillation = await buildAndRunDistiller(models, modelResponses, query, anonMap)
    log("Analyst distillation complete.")
  }
} else {
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

  phase("Review & Distill")
  var mappingStr = models.map(function(m) { return m.name + "=" + anonMap[m.name] }).join(", ")
  log("Running anonymous cross-review (mapping: " + mappingStr + ")")

  var reviewerCount = fullMode ? models.length : configuredReviewerCount
  if (reviewerCount > models.length) reviewerCount = models.length
  var reviewerOffset = query.length % models.length
  for (var ri = 0; ri < reviewerCount; ri++) {
    selectedReviewers.push(models[(reviewerOffset + ri) % models.length])
  }

  log("Review mode: " + (fullMode ? "full" : "simple") + " (" + reviewerCount + "/" + modelCount + " reviewers): " + selectedReviewers.map(function(m) { return m.name }).join(", "))

  var reviewThunks = selectedReviewers.map(function(m) { return makeReviewThunk(m, reviewPrompt) })

  if (loggingEnabled) {
    reviewThunks.push(function() {
      return buildAndRunDistillerAgent(models, modelResponses, query, anonMap)
    })
  }

  var phase2 = await parallel(reviewThunks)

  for (var rri = 0; rri < selectedReviewers.length; rri++) {
    reviewResults[selectedReviewers[rri].name] = phase2[rri]
  }

  if (loggingEnabled) {
    distillation = phase2[phase2.length - 1]
    log("Reviews collected (" + selectedReviewers.length + "/" + modelCount + ") + analyst distillation.")
  } else {
    log("Reviews collected (" + selectedReviewers.length + "/" + modelCount + ").")
  }
}

// ── Distiller helper ───────────────────────────────────────────────────────

function buildDistillerPromptAndSchema(models, modelResponses, query, anonMap) {
  var distillParts = [
    "You are a neutral analyst. Read the following " + models.length + " model responses to a question and produce a structured summary of each.",
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
    "Also classify the query_domain as one of: architecture, code, ethics, factual, creative, strategy, debugging, other.",
    "",
    "Also extract peer review scores from the following reviews. For each review, extract accuracy and insight scores (1-10) for each model, and which model was picked as strongest. Use the de-anonymization key to map letters back to model names.",
    "",
    "De-anonymization key:"
  )
  for (var dki = 0; dki < models.length; dki++) {
    distillParts.push("Response " + anonMap[models[dki].name] + " = " + models[dki].name)
  }

  var distillModelProps = {}
  var distillModelRequired = []
  for (var dsi = 0; dsi < models.length; dsi++) {
    distillModelProps[models[dsi].name] = {
      type: "object",
      properties: {
        position: { type: "string" },
        reasoning: { type: "string" },
        failed: { type: "boolean" },
        accuracy: { type: "array", items: { type: ["integer", "null"] } },
        insight: { type: "array", items: { type: ["integer", "null"] } }
      },
      required: ["position", "reasoning", "failed", "accuracy", "insight"]
    }
    distillModelRequired.push(models[dsi].name)
  }

  var pickProps = {}
  var pickRequired = []
  for (var pki = 0; pki < models.length; pki++) {
    pickProps[models[pki].name] = { type: ["string", "null"] }
    pickRequired.push(models[pki].name)
  }

  return {
    prompt: distillParts.join("\n"),
    schema: {
      type: "object",
      properties: {
        query_domain: { type: "string" },
        models: {
          type: "object",
          properties: distillModelProps,
          required: distillModelRequired
        },
        strongest_picks: {
          type: "object",
          properties: pickProps,
          required: pickRequired
        }
      },
      required: ["query_domain", "models", "strongest_picks"]
    }
  }
}

function buildAndRunDistillerAgent(models, modelResponses, query, anonMap) {
  var d = buildDistillerPromptAndSchema(models, modelResponses, query, anonMap)
  return agent(d.prompt, {
    label: "analyst",
    phase: "Review & Distill",
    model: "sonnet",
    schema: d.schema
  })
}

async function buildAndRunDistiller(models, modelResponses, query, anonMap) {
  var d = buildDistillerPromptAndSchema(models, modelResponses, query, anonMap)
  return await agent(d.prompt, {
    label: "analyst",
    phase: "Review & Distill",
    model: "sonnet",
    schema: d.schema
  })
}

// ── Phase 3: Chairman Synthesis ─────────────────────────────────────────────

var chairmanParts = [
  "You are the Chairman of a " + modelCount + "-model LLM Council. " + modelCount + " different AI models (" + modelNames.join(", ") + ") answered a question independently.",
  ""
]

if (!reviewsSkipped) {
  chairmanParts[0] += " Then " + selectedReviewers.length + " of them peer-reviewed each other anonymously."
}

chairmanParts.push(
  "Your job: synthesize everything into a clear, actionable verdict.",
  "",
  "## The Question",
  "",
  query,
  "",
  "## Model Responses (de-anonymized)",
  ""
)
for (var cri = 0; cri < models.length; cri++) {
  chairmanParts.push("**" + models[cri].name + ":**")
  chairmanParts.push(modelResponses[models[cri].name] || "(no response)")
  chairmanParts.push("")
}

if (!reviewsSkipped) {
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
  ""
)

if (!reviewsSkipped) {
  chairmanParts.push(
    "## Review Highlights",
    "[Key insights from the peer review round. What did reviewers catch that the original responses missed? Which response was rated strongest and why?]",
    ""
  )
}

chairmanParts.push(
  "## Final Answer",
  "[Your synthesized answer to the original question. Be direct. You may side with one model over the others if its reasoning is strongest. Incorporate the best insights from all of them.]"
)

if (loggingEnabled) {
  chairmanParts.push(
    "",
    "## Sources",
    "[List which models' positions most directly influenced your final answer - whose specific recommendations, arguments, or framings you adopted.]"
  )
}

chairmanParts.push(
  "",
  "Be direct. Do not hedge. The whole point of the council is to give the user more clarity than any single model could provide alone."
)
var chairmanPrompt = chairmanParts.join("\n")

phase("Chairman Synthesis")
log("Chairman synthesizing final verdict...")

var verdict = await agent(chairmanPrompt, { label: "chairman", phase: "Chairman Synthesis" })

// ── Phase 4: Logging (only when enabled) ──────────────────────────────────

if (loggingEnabled) {
  phase("Logging")
  log("Persisting verdict data...")

  var timing = await agent(
    "Run these two bash commands and return the output of each:\n" +
    "1. date -u +%Y-%m-%dT%H:%M:%SZ\n" +
    "2. date +%s%N\n" +
    "Return the timestamp from command 1 and the nanosecond value from command 2.",
    {
      label: "get-timing",
      phase: "Logging",
      model: "haiku",
      effort: "low",
      schema: {
        type: "object",
        properties: {
          timestamp: { type: "string" },
          nanos: { type: "string" }
        },
        required: ["timestamp", "nanos"]
      }
    }
  )

  var sourceModels = []
  if (verdict) {
    for (var smi = 0; smi < models.length; smi++) {
      var sourcesSection = verdict.indexOf("## Sources")
      if (sourcesSection !== -1 && verdict.indexOf(models[smi].name, sourcesSection) !== -1) {
        sourceModels.push(models[smi].name)
      }
    }
  }

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
    peerScores[m.name] = d ? { accuracy: d.accuracy, insight: d.insight } : null
    strongestPicks[m.name] = (distillation.strongest_picks && distillation.strongest_picks[m.name]) || null
  }

  var logEntry = {
    schema_version: 2,
    run_id: "council-" + timing.nanos,
    timestamp: timing.timestamp,
    query: query,
    query_domain: distillation.query_domain,
    review_mode: reviewsSkipped ? "skipped" : (fullMode ? "full" : "simple"),
    reviewers: reviewsSkipped ? [] : selectedReviewers.map(function(m) { return m.name }),
    models: modelMeta,
    positions: positions,
    reasoning_summaries: reasoningSummaries,
    peer_scores: peerScores,
    strongest_picks: strongestPicks,
    chairman_source_models: sourceModels,
    human_verdict: null
  }

  var finalJson = JSON.stringify(logEntry)
  var escapedJson = finalJson.replace(/'/g, "'\\''")

  var responseWriteCmds = []
  for (var rwi = 0; rwi < models.length; rwi++) {
    responseWriteCmds.push(
      "```bash",
      "cat > \"$HOME/.claude/ok-council/logs/responses/" + logEntry.run_id + "/" + models[rwi].name + ".md\" <<'__COUNCIL_RESPONSE_7f3a9e2__'",
      (modelResponses[models[rwi].name] || ""),
      "__COUNCIL_RESPONSE_7f3a9e2__",
      "```",
      ""
    )
  }

  var reviewsObj = {}
  for (var rji = 0; rji < models.length; rji++) {
    reviewsObj[models[rji].name] = reviewResults[models[rji].name] || null
  }

  var logWriterPrompt = [
    "Write council verdict data to disk. Run these Bash commands:",
    "",
    "1. Create directories:",
    "```bash",
    "mkdir -p \"$HOME/.claude/ok-council/logs/responses/" + logEntry.run_id + "\"",
    "```",
    "",
    "2. Write each model's raw response to its own file:"
  ].concat(responseWriteCmds).concat([
    "3. Append the log entry to the JSONL file:",
    "```bash",
    "printf '%s\\n' '" + escapedJson + "' >> \"$HOME/.claude/ok-council/logs/councils.jsonl\"",
    "```",
    "",
    "4. Write the raw review texts:",
    "```bash",
    "cat > \"$HOME/.claude/ok-council/logs/responses/" + logEntry.run_id + "/reviews.json\" <<'__COUNCIL_REVIEW_7f3a9e2__'",
    JSON.stringify(reviewsObj),
    "__COUNCIL_REVIEW_7f3a9e2__",
    "```",
    "",
    "Return the run_id '" + logEntry.run_id + "' when done."
  ]).join("\n")

  var logResult = await agent(logWriterPrompt, { label: "log-writer", phase: "Logging" })
  log("Verdict data persisted. " + logResult)
}

// ── Output ──────────────────────────────────────────────────────────────────

var anonMappingStr = models.map(function(m) { return m.name + "=" + anonMap[m.name] }).join(", ")

var reviewLine
if (reviewsSkipped) {
  reviewLine = "*Reviews: skipped (≤" + "3 models — chairman synthesizes directly)*"
} else {
  reviewLine = "*Review mode: " + (fullMode ? "full (" + modelCount + "/" + modelCount + " reviewers)" : "simple (" + selectedReviewers.length + "/" + modelCount + " reviewers) | Use --full for all " + modelCount) + "*"
}

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
  reviewLine,
  loggingEnabled ? "*Logging: on*" : "*Logging: off (set \"logging\": true in models.json to enable)*"
].join("\n");
