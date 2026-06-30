import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_SUMMARY_PROMPT } from "../src/default-prompt.ts";
import { buildTranscript, isStale, resolvePromptTemplate } from "../src/summary.ts";

const TS = "2026-06-18T09:30:45Z";

test("buildTranscript formats [ts] role: text", () => {
	const out = buildTranscript([
		{ type: "message", timestamp: TS, message: { role: "user", content: "hello" } },
	]);
	assert.equal(out, "[2026-06-18 09:30] user: hello");
});

test("buildTranscript joins multiple text blocks and includes both roles", () => {
	const out = buildTranscript([
		{ type: "message", timestamp: TS, message: { role: "user", content: "q" } },
		{
			type: "message",
			timestamp: TS,
			message: {
				role: "assistant",
				content: [
					{ type: "text", text: "line1" },
					{ type: "image" },
					{ type: "text", text: "line2" },
				],
			},
		},
	]);
	assert.equal(out, "[2026-06-18 09:30] user: q\n\n[2026-06-18 09:30] assistant: line1\nline2");
});

test("buildTranscript skips non user/assistant roles and empty text", () => {
	const out = buildTranscript([
		{ type: "message", timestamp: TS, message: { role: "system", content: "ignored" } },
		{ type: "tool_use", timestamp: TS },
		{ type: "message", timestamp: TS, message: { role: "user", content: "   " } },
		{ type: "message", timestamp: TS, message: { role: "assistant", content: [{ type: "text", text: "kept" }] } },
	]);
	assert.equal(out, "[2026-06-18 09:30] assistant: kept");
});

test("isStale: fresh summary -> not stale", () => {
	const now = Date.parse("2026-06-29T00:00:00Z");
	const fresh = new Date(now - 1 * 86_400_000);
	const oldUser = new Date(now - 30 * 86_400_000);
	assert.equal(isStale(fresh, oldUser, now, 3), false);
});

test("isStale: old summary with old first-user -> stale", () => {
	const now = Date.parse("2026-06-29T00:00:00Z");
	const oldSummary = new Date(now - 10 * 86_400_000);
	const oldUser = new Date(now - 30 * 86_400_000);
	assert.equal(isStale(oldSummary, oldUser, now, 3), true);
});

test("isStale: no summary but recent first-user -> not stale", () => {
	const now = Date.parse("2026-06-29T00:00:00Z");
	const recentUser = new Date(now - 1 * 86_400_000);
	assert.equal(isStale(null, recentUser, now, 3), false);
});

test("isStale: no summary and no first-user -> not stale", () => {
	const now = Date.parse("2026-06-29T00:00:00Z");
	assert.equal(isStale(null, null, now, 3), false);
});

test("resolvePromptTemplate falls back to default", () => {
	assert.equal(resolvePromptTemplate(null), DEFAULT_SUMMARY_PROMPT);
});

test("resolvePromptTemplate respects override", () => {
	const custom = "custom {conversation_history}";
	assert.equal(resolvePromptTemplate(custom), custom);
});
