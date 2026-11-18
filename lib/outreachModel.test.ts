import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildJsonCompletionParams,
  buildOutreachResponseBody,
  DEFAULT_OPENAI_OUTREACH_MODEL,
  extractResponsesOutputText,
  isRetryableOutreachError,
  modelSupportsCustomTemperature,
  nextOutreachAttempt,
  OUTREACH_REASONING_EFFORT,
  parseModelJson,
  readResponseUsage,
  resolveOutreachModel,
  responseUsesRequestedModel,
} from "./outreachModel.ts";

const here = dirname(fileURLToPath(import.meta.url));

assert.equal(resolveOutreachModel(undefined), DEFAULT_OPENAI_OUTREACH_MODEL);
assert.equal(resolveOutreachModel("  "), DEFAULT_OPENAI_OUTREACH_MODEL);
assert.equal(resolveOutreachModel("  gpt-custom  "), "gpt-custom");
assert.equal(DEFAULT_OPENAI_OUTREACH_MODEL, "gpt-6.1-sol");
assert.equal(OUTREACH_REASONING_EFFORT, "medium");

assert.equal(modelSupportsCustomTemperature("gpt-6.1-sol"), false);
assert.equal(modelSupportsCustomTemperature("gpt-5"), false);
assert.equal(modelSupportsCustomTemperature("gpt-4o-mini"), true);

const solCompletion = buildJsonCompletionParams({
  model: "gpt-6.1-sol",
  systemPrompt: "Return JSON.",
  userPrompt: "ok",
});
assert.equal(solCompletion.reasoning_effort, "medium");
assert.equal(solCompletion.max_completion_tokens, 8192);
assert.equal(solCompletion.temperature, undefined);
assert.equal("top_p" in solCompletion, false);
assert.equal(responseUsesRequestedModel("gpt-6.1-sol", "gpt-6.1-sol"), true);
assert.equal(responseUsesRequestedModel("gpt-6.1-sol", "gpt-6.1-sol-2026-11-01"), true);
assert.equal(responseUsesRequestedModel("gpt-6.1-sol", "gpt-5.6-terra"), false);

assert.equal(isRetryableOutreachError({ status: 429, name: "RateLimitError" }), true);
assert.equal(isRetryableOutreachError({ status: 500 }), true);
assert.equal(isRetryableOutreachError({ status: 400, name: "BadRequestError" }), false);
assert.equal(isRetryableOutreachError({ name: "APIConnectionTimeoutError" }), true);
assert.equal(isRetryableOutreachError({ status: 401, name: "AuthenticationError" }), false);

const body = buildOutreachResponseBody({
  model: "gpt-6.1-sol",
  systemPrompt: "system",
  userPrompt: "user",
  schemaName: "outreach_draft",
  schema: { type: "object" },
  maxOutputTokens: 4096,
  promptCacheKey: "lm-outreach-draft",
});

assert.equal(body.model, "gpt-6.1-sol");
assert.equal(body.reasoning.effort, "medium");
assert.equal(body.store, false);
assert.equal(body.text.format.type, "json_schema");
assert.equal(body.text.format.strict, true);
assert.equal(body.input[0]?.role, "system");
assert.equal(body.input[1]?.role, "user");
assert.equal("temperature" in body, false);
assert.equal("top_p" in body, false);

assert.deepEqual(
  extractResponsesOutputText({
    output_text: "  {\"ok\":true}  ",
    status: "completed",
    incomplete_details: null,
  }),
  { text: "{\"ok\":true}", status: "completed", incompleteReason: null },
);

assert.equal(
  extractResponsesOutputText({
    status: "incomplete",
    incomplete_details: { reason: "max_output_tokens" },
    output: [
      {
        type: "message",
        content: [{ type: "output_text", text: "{\"fullDraft\":\"partial\"}" }],
      },
    ],
  }).text,
  "{\"fullDraft\":\"partial\"}",
);

assert.deepEqual(parseModelJson("```json\n{\"a\":1}\n```"), { a: 1 });

assert.equal(
  nextOutreachAttempt({
    status: "incomplete",
    incompleteReason: "max_output_tokens",
    parsed: false,
    tokenBumped: false,
    maxOutputTokens: 4096,
    ceiling: 8192,
  }),
  "bump_tokens",
);

assert.equal(
  nextOutreachAttempt({
    status: "incomplete",
    incompleteReason: "content_filter",
    parsed: false,
    tokenBumped: false,
    maxOutputTokens: 4096,
    ceiling: 8192,
  }),
  "fail",
);

assert.equal(
  nextOutreachAttempt({
    status: "incomplete",
    incompleteReason: "max_output_tokens",
    parsed: true,
    tokenBumped: false,
    maxOutputTokens: 4096,
    ceiling: 8192,
  }),
  "accept",
);

assert.equal(
  nextOutreachAttempt({
    status: "failed",
    incompleteReason: null,
    parsed: true,
    tokenBumped: false,
    maxOutputTokens: 4096,
    ceiling: 8192,
  }),
  "fail",
);

assert.deepEqual(
  readResponseUsage({
    input_tokens: 1200,
    output_tokens: 400,
    total_tokens: 1600,
    input_tokens_details: { cached_tokens: 900 },
    output_tokens_details: { reasoning_tokens: 180 },
  }),
  {
    inputTokens: 1200,
    outputTokens: 400,
    reasoningTokens: 180,
    cachedInputTokens: 900,
    cacheWriteTokens: null,
    totalTokens: 1600,
  },
);

const outreachRoute = readFileSync(join(here, "../app/api/ai/outreach/route.ts"), "utf8");
const accountRoute = readFileSync(
  join(here, "../app/api/ai/account-outreach/route.ts"),
  "utf8",
);
const config = readFileSync(join(here, "./openai-config.ts"), "utf8");
const client = readFileSync(join(here, "../components/ai-outreach-assistant-section.tsx"), "utf8");

assert.match(config, /OPENAI_OUTREACH_MODEL/);
assert.match(config, /resolveOutreachModel/);
assert.match(config, /gpt-6\.1-sol/);
assert.doesNotMatch(config, /gpt-5\.6-terra/);
assert.doesNotMatch(
  readFileSync(join(here, "./openaiServer.ts"), "utf8"),
  /gpt-5\.6-terra/,
);
assert.doesNotMatch(outreachRoute, /generateJsonCompletion|chat\.completions|resend|temperature|top_p/);
assert.match(outreachRoute, /generateOutreachJson/);
assert.match(outreachRoute, /getOutreachModel/);
assert.doesNotMatch(accountRoute, /generateJsonCompletion|resend/);
assert.match(accountRoute, /generateOutreachJson/);
assert.match(client, /does not send email/i);
assert.doesNotMatch(client, /OPENAI_API_KEY|NEXT_PUBLIC_OPENAI/);

const sharedRoutes = [
  "../app/api/ai/account-summary/route.ts",
  "../app/api/ai/broker-assistant/route.ts",
  "../app/api/ai/broker-recommendations/route.ts",
  "../app/api/assistant/generate/route.ts",
  "./brokerReminderEmail.ts",
];

for (const relativePath of sharedRoutes) {
  const source = readFileSync(join(here, relativePath), "utf8");
  assert.match(source, /generateJsonCompletion/);
  assert.doesNotMatch(source, /generateOutreachJson|OPENAI_OUTREACH_MODEL|gpt-5\.6-terra|gpt-6\.1-sol/);
}

console.log("outreach model checks passed");
