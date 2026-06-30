import assert from "node:assert/strict";
import { test } from "node:test";
import { buildContextPrompt } from "../src/build-prompt.ts";

const BASE = "You are a helpful assistant.";

test("leaves the base prompt unchanged when the summary is absent", () => {
	const result = buildContextPrompt(BASE, { summary: null, summaryDate: "unknown" });
	assert.equal(result, BASE);
});

test("appends the summary block with the date attribute", () => {
	const result = buildContextPrompt(BASE, { summary: "Spoke about pricing.", summaryDate: "2026-06-29" });
	assert.ok(result.startsWith(BASE));
	assert.ok(result.includes('<summary date="2026-06-29">\nSpoke about pricing.\n</summary>'));
	assert.ok(result.includes("<additional_context>"));
	assert.ok(result.includes("The above is a summary of recent interactions with this contact."));
});

test("never emits a user_data block", () => {
	const result = buildContextPrompt(BASE, { summary: "Recent chat.", summaryDate: "2026-01-01" });
	assert.ok(!result.includes("<user_data>"));
});

test("uses the exact tag wording", () => {
	const result = buildContextPrompt(BASE, { summary: "S", summaryDate: "2026-06-29" });
	assert.ok(
		result.includes(
			"Continue the conversation using the same language and tone and follow the language direction above.",
		),
	);
});
