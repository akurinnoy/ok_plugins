export const meta = {
  name: "llm-council-crossmodel",
  description: "3-model LLM Council: Claude Opus, Gemini 3 Pro, GPT-5.3 Codex",
  phases: [
    { title: "Preflight", detail: "Verify required CLI tools are installed" },
    { title: "First Opinions", detail: "All 3 models answer independently in parallel" },
    { title: "Anonymous Review", detail: "Each model reviews anonymized responses" },
    { title: "Chairman Synthesis", detail: "Claude synthesizes the final verdict" }
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
  missing.push("- **agent** — install via `curl https://cursor.com/install -fsS | bash` or see https://cursor.com/docs/cli/installation")
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

function escapeForShell(str) {
  return str.replace(/'/g, "'\\''");
}

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

// ── Phase 1: First Opinions (parallel) ──────────────────────────────────────

const query = args;

const claudePrompt = [
  "A user has brought this question to a multi-model council. You are one of three models answering independently.",
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

const geminiCliCommand = "gemini -y --skip-trust -m gemini-3-pro-preview -p -";
const cursorCliCommand = "agent --yolo --trust --model gpt-5.3-codex -p -";

phase("First Opinions")
log("Querying Claude Opus, Gemini 3 Pro, and GPT-5.3 Codex in parallel...")

const phase1 = await parallel([
  () => agent(claudePrompt, { label: "claude-opus", phase: "First Opinions" }),
  () => agent(buildShellRunnerPrompt(geminiCliCommand, claudePrompt), { label: "gemini-3-pro", phase: "First Opinions" }),
  () => agent(buildShellRunnerPrompt(cursorCliCommand, claudePrompt), { label: "gpt-5.3-codex", phase: "First Opinions" })
])

const claudeResponse = phase1[0];
const geminiResponse = phase1[1];
const cursorResponse = phase1[2];

log("All 3 first opinions collected.")

// ── Anonymization ───────────────────────────────────────────────────────────

const responses = [
  { model: "Claude", text: claudeResponse },
  { model: "Gemini", text: geminiResponse },
  { model: "Cursor/GPT", text: cursorResponse }
];

const rotations = [
  ["A", "B", "C"],
  ["B", "C", "A"],
  ["C", "A", "B"]
];
const rotation = rotations[query.length % 3];

const anonMap = {};
const reverseMap = {};
for (let i = 0; i < 3; i++) {
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

// ── Phase 2: Anonymous Review (parallel) ────────────────────────────────────

const reviewPrompt = [
  "You are reviewing the outputs of a 3-model LLM Council. Three different AI models independently answered this question:",
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

phase("Anonymous Review")
log("Running anonymous cross-review (mapping: Claude=" + anonMap["Claude"] + ", Gemini=" + anonMap["Gemini"] + ", Cursor/GPT=" + anonMap["Cursor/GPT"] + ")")

const phase2 = await parallel([
  () => agent(reviewPrompt, { label: "claude-review", phase: "Anonymous Review" }),
  () => agent(buildShellRunnerPrompt(geminiCliCommand, reviewPrompt), { label: "gemini-review", phase: "Anonymous Review" }),
  () => agent(buildShellRunnerPrompt(cursorCliCommand, reviewPrompt), { label: "cursor-review", phase: "Anonymous Review" })
])

const claudeReview = phase2[0];
const geminiReview = phase2[1];
const cursorReview = phase2[2];

log("All 3 reviews collected.")

// ── Phase 3: Chairman Synthesis ─────────────────────────────────────────────

const chairmanPrompt = [
  "You are the Chairman of a 3-model LLM Council. Three different AI models (Claude Opus 4.6, Gemini 3 Pro, GPT-5.3 Codex) answered a question independently, then peer-reviewed each other anonymously.",
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
  "**Gemini (gemini-3-pro-preview):**",
  geminiResponse,
  "",
  "**Cursor/GPT (gpt-5.3-codex):**",
  cursorResponse,
  "",
  "## Anonymous Peer Reviews",
  "",
  "**Review 1:**",
  claudeReview,
  "",
  "**Review 2:**",
  geminiReview,
  "",
  "**Review 3:**",
  cursorReview,
  "",
  "## Anonymization Key (for your reference)",
  "Response " + anonMap["Claude"] + " = Claude",
  "Response " + anonMap["Gemini"] + " = Gemini",
  "Response " + anonMap["Cursor/GPT"] + " = Cursor/GPT",
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
  "[Your synthesized answer to the original question. Be direct. You may side with one model over the others if its reasoning is strongest. Incorporate the best insights from all three.]",
  "",
  "Be direct. Do not hedge. The whole point of the council is to give the user more clarity than any single model could provide alone."
].join("\n");

phase("Chairman Synthesis")
log("Chairman (Claude Opus 4.6) synthesizing final verdict...")

const verdict = await agent(chairmanPrompt, { label: "chairman", phase: "Chairman Synthesis" })

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
  "*Council composition: Claude Opus 4.6, Gemini 3 Pro (gemini-3-pro-preview), GPT-5.3 Codex*",
  "*Anonymization mapping: Claude=" + anonMap["Claude"] + ", Gemini=" + anonMap["Gemini"] + ", Cursor/GPT=" + anonMap["Cursor/GPT"] + "*"
].join("\n");
