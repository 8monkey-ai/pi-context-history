import assert from "node:assert/strict";
import { test } from "node:test";
import { filterByAge } from "../src/filter.ts";

const DAY = 86_400_000;
const now = 1_700_000_000_000;
const maxAge = 60 * DAY;

test("keeps recent messages", () => {
	const messages = [{ timestamp: now }, { timestamp: now - DAY }, { timestamp: now - 59 * DAY }];
	assert.deepEqual(filterByAge(messages, now, maxAge), messages);
});

test("drops messages older than the cutoff", () => {
	const recent = { timestamp: now - DAY };
	const old = { timestamp: now - 61 * DAY };
	assert.deepEqual(filterByAge([recent, old], now, maxAge), [recent]);
});

test("keeps a message exactly at the cutoff boundary", () => {
	const boundary = { timestamp: now - maxAge };
	assert.deepEqual(filterByAge([boundary], now, maxAge), [boundary]);
});

test("returns an empty array when all messages are too old", () => {
	const messages = [{ timestamp: now - 61 * DAY }, { timestamp: now - 100 * DAY }];
	assert.deepEqual(filterByAge(messages, now, maxAge), []);
});
