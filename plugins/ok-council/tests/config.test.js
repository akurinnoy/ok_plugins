const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// These functions replicate the exact logic from the workflow script.
// If the workflow logic changes, these must be updated to match.

var DEFAULT_MODELS = [
  { name: "claude-opus-4.6", provider: "anthropic", cli: "native" },
  { name: "fable-sonnet5", provider: "anthropic", cli: "agent --yolo --trust --model claude-sonnet-5-thinking-high -p -" },
  { name: "gemini-3.1-pro", provider: "google", cli: "gemini -y --skip-trust -m gemini-3.1-pro-preview -p -" },
  { name: "gpt-5.4", provider: "openai", cli: "agent --yolo --trust --model gpt-5.4-high -p -" },
  { name: "grok-4.5", provider: "xai", cli: "agent --yolo --trust --model cursor-grok-4.5-high -p -" }
];

function parseConfig(rawConfig) {
  var models = DEFAULT_MODELS;
  var configuredReviewerCount = 3;
  if (rawConfig) {
    if (Array.isArray(rawConfig)) {
      models = rawConfig;
    } else if (rawConfig.models) {
      models = rawConfig.models;
      if (rawConfig.reviewers) {
        configuredReviewerCount = rawConfig.reviewers;
      }
    }
  }
  return { models: models, configuredReviewerCount: configuredReviewerCount };
}

function parseArgs(args) {
  var fullMode = typeof args === "string" && args.indexOf("--full") !== -1;
  var query = typeof args === "string" ? args.replace(/--full\s*/g, "").trim() : args;
  return { fullMode: fullMode, query: query };
}

function detectRequiredTools(models) {
  var needsGemini = models.some(function(m) { return m.cli.indexOf("gemini") !== -1; });
  var needsAgent = models.some(function(m) { return m.cli !== "native" && m.cli.indexOf("gemini") === -1; });
  return { needsGemini: needsGemini, needsAgent: needsAgent };
}

function selectReviewers(models, queryLength, fullMode, configuredReviewerCount) {
  var reviewerCount = fullMode ? models.length : configuredReviewerCount;
  if (reviewerCount > models.length) reviewerCount = models.length;
  var reviewerOffset = queryLength % models.length;
  var selectedReviewers = [];
  for (var ri = 0; ri < reviewerCount; ri++) {
    selectedReviewers.push(models[(reviewerOffset + ri) % models.length]);
  }
  return selectedReviewers;
}

function buildAnonymization(models, queryLength) {
  var letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  var rotationOffset = queryLength % models.length;
  var anonMap = {};
  var reverseMap = {};
  for (var ai = 0; ai < models.length; ai++) {
    var letter = letters[(ai + rotationOffset) % models.length];
    anonMap[models[ai].name] = letter;
    reverseMap[letter] = models[ai].name;
  }
  return { anonMap: anonMap, reverseMap: reverseMap };
}

function shouldSkipReviews(modelCount) {
  return modelCount <= 3;
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('parseConfig', function() {
  it('returns defaults when config is null', function() {
    var result = parseConfig(null);
    assert.equal(result.models.length, 5);
    assert.equal(result.models[0].name, "claude-opus-4.6");
    assert.equal(result.configuredReviewerCount, 3);
  });

  it('returns defaults when config is undefined', function() {
    var result = parseConfig(undefined);
    assert.equal(result.models.length, 5);
    assert.equal(result.configuredReviewerCount, 3);
  });

  it('accepts plain array (old format)', function() {
    var config = [
      { name: "model-a", provider: "providerA", cli: "native" },
      { name: "model-b", provider: "providerB", cli: "some-cli -p -" }
    ];
    var result = parseConfig(config);
    assert.equal(result.models.length, 2);
    assert.equal(result.models[0].name, "model-a");
    assert.equal(result.models[1].name, "model-b");
    assert.equal(result.configuredReviewerCount, 3);
  });

  it('accepts object with models array (new format)', function() {
    var config = {
      models: [
        { name: "model-x", provider: "px", cli: "native" },
        { name: "model-y", provider: "py", cli: "agent -p -" }
      ]
    };
    var result = parseConfig(config);
    assert.equal(result.models.length, 2);
    assert.equal(result.models[0].name, "model-x");
    assert.equal(result.configuredReviewerCount, 3);
  });

  it('reads reviewers count from new format', function() {
    var config = {
      reviewers: 4,
      models: [
        { name: "a", provider: "p", cli: "native" },
        { name: "b", provider: "p", cli: "cli -p -" },
        { name: "c", provider: "p", cli: "cli -p -" },
        { name: "d", provider: "p", cli: "cli -p -" },
        { name: "e", provider: "p", cli: "cli -p -" }
      ]
    };
    var result = parseConfig(config);
    assert.equal(result.configuredReviewerCount, 4);
  });

  it('defaults reviewers to 3 when not specified in new format', function() {
    var config = {
      models: [
        { name: "a", provider: "p", cli: "native" },
        { name: "b", provider: "p", cli: "cli -p -" }
      ]
    };
    var result = parseConfig(config);
    assert.equal(result.configuredReviewerCount, 3);
  });

  it('ignores object without models key', function() {
    var config = { reviewers: 5 };
    var result = parseConfig(config);
    assert.equal(result.models.length, 5);
    assert.equal(result.models[0].name, "claude-opus-4.6");
  });
});

describe('parseArgs', function() {
  it('parses plain query', function() {
    var result = parseArgs("Should I use Redis?");
    assert.equal(result.fullMode, false);
    assert.equal(result.query, "Should I use Redis?");
  });

  it('extracts --full at start', function() {
    var result = parseArgs("--full Should I use Redis?");
    assert.equal(result.fullMode, true);
    assert.equal(result.query, "Should I use Redis?");
  });

  it('extracts --full at end', function() {
    var result = parseArgs("Should I use Redis? --full");
    assert.equal(result.fullMode, true);
    assert.equal(result.query, "Should I use Redis?");
  });

  it('handles undefined args', function() {
    var result = parseArgs(undefined);
    assert.equal(result.fullMode, false);
    assert.equal(result.query, undefined);
  });

  it('handles empty string', function() {
    var result = parseArgs("");
    assert.equal(result.fullMode, false);
    assert.equal(result.query, "");
  });

  it('handles --full alone', function() {
    var result = parseArgs("--full");
    assert.equal(result.fullMode, true);
    assert.equal(result.query, "");
  });
});

describe('detectRequiredTools', function() {
  it('detects gemini needed', function() {
    var models = [
      { name: "a", provider: "p", cli: "native" },
      { name: "b", provider: "p", cli: "gemini -y -p -" }
    ];
    var result = detectRequiredTools(models);
    assert.equal(result.needsGemini, true);
    assert.equal(result.needsAgent, false);
  });

  it('detects agent needed', function() {
    var models = [
      { name: "a", provider: "p", cli: "native" },
      { name: "b", provider: "p", cli: "agent --yolo -p -" }
    ];
    var result = detectRequiredTools(models);
    assert.equal(result.needsGemini, false);
    assert.equal(result.needsAgent, true);
  });

  it('detects both needed', function() {
    var models = [
      { name: "a", provider: "p", cli: "native" },
      { name: "b", provider: "p", cli: "gemini -y -p -" },
      { name: "c", provider: "p", cli: "agent --yolo -p -" }
    ];
    var result = detectRequiredTools(models);
    assert.equal(result.needsGemini, true);
    assert.equal(result.needsAgent, true);
  });

  it('detects neither needed when all native', function() {
    var models = [
      { name: "a", provider: "p", cli: "native" },
      { name: "b", provider: "p", cli: "native" }
    ];
    var result = detectRequiredTools(models);
    assert.equal(result.needsGemini, false);
    assert.equal(result.needsAgent, false);
  });
});

describe('selectReviewers', function() {
  var models = [
    { name: "a", provider: "p", cli: "native" },
    { name: "b", provider: "p", cli: "cli -p -" },
    { name: "c", provider: "p", cli: "cli -p -" },
    { name: "d", provider: "p", cli: "cli -p -" },
    { name: "e", provider: "p", cli: "cli -p -" }
  ];

  it('selects configured count in simple mode', function() {
    var result = selectReviewers(models, 10, false, 3);
    assert.equal(result.length, 3);
  });

  it('selects all in full mode', function() {
    var result = selectReviewers(models, 10, true, 3);
    assert.equal(result.length, 5);
  });

  it('respects custom reviewer count', function() {
    var result = selectReviewers(models, 10, false, 4);
    assert.equal(result.length, 4);
  });

  it('clamps to model count when configured count exceeds it', function() {
    var result = selectReviewers(models, 10, false, 10);
    assert.equal(result.length, 5);
  });

  it('is deterministic for same query length', function() {
    var a = selectReviewers(models, 42, false, 3);
    var b = selectReviewers(models, 42, false, 3);
    assert.deepEqual(
      a.map(function(m) { return m.name; }),
      b.map(function(m) { return m.name; })
    );
  });

  it('rotates selection based on query length', function() {
    var selections = {};
    for (var q = 0; q < 5; q++) {
      var sel = selectReviewers(models, q, false, 3);
      selections[q] = sel.map(function(m) { return m.name; }).join(",");
    }
    assert.equal(selections[0], "a,b,c");
    assert.equal(selections[1], "b,c,d");
    assert.equal(selections[2], "c,d,e");
    assert.equal(selections[3], "d,e,a");
    assert.equal(selections[4], "e,a,b");
  });

  it('works with 2 models and 2 reviewers', function() {
    var small = [
      { name: "x", provider: "p", cli: "native" },
      { name: "y", provider: "p", cli: "cli -p -" }
    ];
    var result = selectReviewers(small, 0, false, 2);
    assert.equal(result.length, 2);
    assert.equal(result[0].name, "x");
    assert.equal(result[1].name, "y");
  });

  it('clamps reviewers to 2 for 2-model council even if configured higher', function() {
    var small = [
      { name: "x", provider: "p", cli: "native" },
      { name: "y", provider: "p", cli: "cli -p -" }
    ];
    var result = selectReviewers(small, 0, false, 5);
    assert.equal(result.length, 2);
  });
});

describe('buildAnonymization', function() {
  it('assigns unique letters to each model', function() {
    var models = [
      { name: "a", provider: "p", cli: "native" },
      { name: "b", provider: "p", cli: "cli" },
      { name: "c", provider: "p", cli: "cli" }
    ];
    var result = buildAnonymization(models, 0);
    var usedLetters = Object.values(result.anonMap);
    assert.equal(new Set(usedLetters).size, 3);
  });

  it('creates consistent forward and reverse maps', function() {
    var models = [
      { name: "alpha", provider: "p", cli: "native" },
      { name: "beta", provider: "p", cli: "cli" },
      { name: "gamma", provider: "p", cli: "cli" }
    ];
    var result = buildAnonymization(models, 0);
    for (var name in result.anonMap) {
      var letter = result.anonMap[name];
      assert.equal(result.reverseMap[letter], name);
    }
  });

  it('rotates based on query length', function() {
    var models = [
      { name: "a", provider: "p", cli: "native" },
      { name: "b", provider: "p", cli: "cli" },
      { name: "c", provider: "p", cli: "cli" }
    ];
    var r0 = buildAnonymization(models, 0);
    var r1 = buildAnonymization(models, 1);
    assert.notEqual(r0.anonMap["a"], r1.anonMap["a"]);
  });

  it('is deterministic for same inputs', function() {
    var models = [
      { name: "a", provider: "p", cli: "native" },
      { name: "b", provider: "p", cli: "cli" }
    ];
    var r1 = buildAnonymization(models, 42);
    var r2 = buildAnonymization(models, 42);
    assert.deepEqual(r1.anonMap, r2.anonMap);
  });

  it('handles 2 models', function() {
    var models = [
      { name: "x", provider: "p", cli: "native" },
      { name: "y", provider: "p", cli: "cli" }
    ];
    var result = buildAnonymization(models, 0);
    assert.equal(Object.keys(result.anonMap).length, 2);
    assert.equal(Object.keys(result.reverseMap).length, 2);
  });

  it('handles 10 models', function() {
    var models = [];
    for (var i = 0; i < 10; i++) {
      models.push({ name: "model-" + i, provider: "p", cli: i === 0 ? "native" : "cli" });
    }
    var result = buildAnonymization(models, 0);
    assert.equal(Object.keys(result.anonMap).length, 10);
    var usedLetters = Object.values(result.anonMap);
    assert.equal(new Set(usedLetters).size, 10);
  });
});

describe('shouldSkipReviews', function() {
  it('skips reviews for 2 models', function() {
    assert.equal(shouldSkipReviews(2), true);
  });

  it('skips reviews for 3 models', function() {
    assert.equal(shouldSkipReviews(3), true);
  });

  it('runs reviews for 4 models', function() {
    assert.equal(shouldSkipReviews(4), false);
  });

  it('runs reviews for 5 models', function() {
    assert.equal(shouldSkipReviews(5), false);
  });
});
