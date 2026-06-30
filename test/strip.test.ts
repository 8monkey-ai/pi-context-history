import assert from "node:assert/strict";
import { test } from "node:test";
import { findBoundary, stripBeforeBoundary, type Message } from "../src/strip.ts";

function user(): Message {
	return { role: "user", content: [{ type: "text" }] };
}

function assistantText(): Message {
	return { role: "assistant", content: [{ type: "text" }] };
}

function assistantToolCall(): Message {
	return { role: "assistant", content: [{ type: "toolCall" }] };
}

function assistantMixed(): Message {
	return { role: "assistant", content: [{ type: "text" }, { type: "toolCall" }] };
}

function toolResult(): Message {
	return { role: "toolResult", content: [{ type: "toolResult" }] };
}

test("findBoundary skips trailing toolResults and the preceding assistant+toolCall pair", () => {
	const messages = [user(), assistantToolCall(), toolResult(), toolResult()];
	assert.equal(findBoundary(messages), 1);
});

test("findBoundary returns length when the last message is not a tool exchange", () => {
	const messages = [user(), assistantText()];
	assert.equal(findBoundary(messages), 2);
});

test("findBoundary leaves boundary at trailing toolResults when no assistant toolCall precedes", () => {
	const messages = [user(), toolResult()];
	assert.equal(findBoundary(messages), 1);
});

test("toolResults before the boundary are removed", () => {
	const messages = [assistantMixed(), toolResult(), user()];
	const cleaned = stripBeforeBoundary(messages, 2);
	assert.deepEqual(
		cleaned.map((m) => m.role),
		["assistant", "user"],
	);
	assert.ok(!cleaned.some((m) => m.role === "toolResult"));
});

test("assistant messages with only toolCall blocks before the boundary are removed", () => {
	const messages = [assistantToolCall(), user()];
	const cleaned = stripBeforeBoundary(messages, 1);
	assert.deepEqual(
		cleaned.map((m) => m.role),
		["user"],
	);
});

test("assistant messages with mixed content keep their non-tool blocks", () => {
	const messages = [assistantMixed(), user()];
	const cleaned = stripBeforeBoundary(messages, 1);
	assert.equal(cleaned.length, 2);
	assert.deepEqual(cleaned[0]?.content, [{ type: "text" }]);
});

test("everything at or after the boundary is preserved verbatim", () => {
	const after = [assistantToolCall(), toolResult()];
	const messages = [user(), ...after];
	const cleaned = stripBeforeBoundary(messages, 1);
	assert.equal(cleaned[1], after[0]);
	assert.equal(cleaned[2], after[1]);
});

test("end to end: strips a prior tool turn, keeps the current one intact", () => {
	const messages = [
		user(),
		assistantMixed(),
		toolResult(),
		user(),
		assistantToolCall(),
		toolResult(),
	];
	const boundary = findBoundary(messages);
	const cleaned = stripBeforeBoundary(messages, boundary);
	assert.deepEqual(
		cleaned.map((m) => m.role),
		["user", "assistant", "user", "assistant", "toolResult"],
	);
	assert.deepEqual(cleaned[1]?.content, [{ type: "text" }]);
	assert.deepEqual(cleaned[3]?.content, [{ type: "toolCall" }]);
	assert.deepEqual(cleaned[4]?.content, [{ type: "toolResult" }]);
});
