import { writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, SessionManager } from "@earendil-works/pi-coding-agent";
import { buildContextPrompt } from "./build-prompt.ts";
import {
	buildTranscript,
	isStale,
	resolvePromptTemplate,
	runPiCompact,
	type TranscriptEntry,
} from "./compact.ts";
import { COMPACT_STALENESS_DAYS, featureEnabled, HISTORY_DAYS } from "./config.ts";
import { filterByAge } from "./filter.ts";
import { piFileMtime, readPiFile } from "./pi-file.ts";
import { findBoundary, stripBeforeBoundary, type Message } from "./strip.ts";

const HISTORY_MS = HISTORY_DAYS * 86_400_000;
const COMPACT_RELATIVE_PATH = "agent/compact.md";
const COMPACT_PATH = join(homedir(), ".pi", COMPACT_RELATIVE_PATH);
const ZERO_USAGE = {
	input: 0,
	output: 0,
	cacheRead: 0,
	cacheWrite: 0,
	totalTokens: 0,
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

function registerTrimHistory(pi: ExtensionAPI) {
	pi.on("context", (event) => {
		return { messages: filterByAge(event.messages, Date.now(), HISTORY_MS) };
	});
}

function registerStripToolHistory(pi: ExtensionAPI) {
	let boundaryIndex = 0;
	let newLoopStarted = true;

	pi.on("before_agent_start", () => {
		newLoopStarted = true;
	});

	pi.on("context", (event) => {
		const messages = event.messages as unknown as Message[];

		// Pin the boundary for the whole loop; recomputing per context call would
		// strip the running turn's own tool exchange mid-flight.
		if (newLoopStarted) {
			boundaryIndex = findBoundary(messages);
			newLoopStarted = false;
		}

		const cleaned = stripBeforeBoundary(messages, boundaryIndex);
		return { messages: cleaned as unknown as typeof event.messages };
	});
}

function firstUserDate(entries: TranscriptEntry[]) {
	const first = entries.find((e) => e.type === "message" && e.message?.role === "user");
	return first ? new Date(first.timestamp) : null;
}

function generate(entries: TranscriptEntry[]): string | "empty" {
	const history = buildTranscript(entries);
	if (!history) return "empty";
	const template = resolvePromptTemplate(readPiFile("prompts/compact.md"));
	const summary = runPiCompact(template, history);
	if (!summary) return "empty";
	writeFileSync(COMPACT_PATH, summary);
	return summary;
}

function registerGenerateCompact(pi: ExtensionAPI) {
	pi.on("session_start", (event, ctx) => {
		if (event.reason === "new") return;
		const entries = ctx.sessionManager.getEntries() as TranscriptEntry[];
		if (!isStale(piFileMtime(COMPACT_RELATIVE_PATH), firstUserDate(entries), Date.now(), COMPACT_STALENESS_DAYS)) {
			return;
		}
		try {
			generate(entries);
		} catch {}
	});

	pi.registerCommand("compact-session", {
		description: "Regenerate the session summary in ~/.pi/agent/compact.md now (ignores staleness)",
		handler: async (_args, ctx) => {
			const entries = ctx.sessionManager.getEntries() as TranscriptEntry[];
			let result: string | "empty";
			try {
				result = generate(entries);
			} catch (err) {
				if (ctx.hasUI) ctx.ui.notify(`Failed to generate summary: ${(err as Error).message}.`, "error");
				return;
			}
			if (!ctx.hasUI) return;
			if (result === "empty") {
				ctx.ui.notify("Nothing to summarize in this session.", "info");
			} else {
				ctx.ui.notify("Session summary written to ~/.pi/agent/compact.md.", "info");
			}
		},
	});
}

function registerInjectCompact(pi: ExtensionAPI) {
	pi.on("before_agent_start", (event) => {
		const summary = readPiFile(COMPACT_RELATIVE_PATH);
		const mtime = summary ? piFileMtime(COMPACT_RELATIVE_PATH) : null;
		const summaryDate = mtime ? (mtime.toISOString().split("T")[0] ?? "unknown") : "unknown";

		const systemPrompt = buildContextPrompt(event.systemPrompt, summary, summaryDate);
		return { systemPrompt };
	});
}

function registerAppendMessage(pi: ExtensionAPI) {
	pi.registerCommand("add-user-message", {
		description: "Append a user message to the end of the conversation history",
		handler: async (args, ctx) => {
			const text = args.trim();
			if (!text) {
				if (ctx.hasUI) ctx.ui.notify("Usage: /add-user-message <text>", "warning");
				return;
			}
			const session = ctx.sessionManager as SessionManager;
			session.appendMessage({ role: "user", content: [{ type: "text", text }], timestamp: Date.now() });
			if (ctx.hasUI) ctx.ui.notify("Appended a user message; it applies on the next session rebuild.", "info");
		},
	});

	pi.registerCommand("add-assistant-message", {
		description: "Append an assistant message to the end of the conversation history",
		handler: async (args, ctx) => {
			const text = args.trim();
			if (!text) {
				if (ctx.hasUI) ctx.ui.notify("Usage: /add-assistant-message <text>", "warning");
				return;
			}
			if (!ctx.model) {
				if (ctx.hasUI) ctx.ui.notify("Cannot append an assistant message: no model selected.", "error");
				return;
			}
			const { api, provider, id } = ctx.model;
			const session = ctx.sessionManager as SessionManager;
			session.appendMessage({
				role: "assistant",
				content: [{ type: "text", text }],
				api,
				provider,
				model: id,
				usage: ZERO_USAGE,
				stopReason: "stop",
				timestamp: Date.now(),
			});
			if (ctx.hasUI) {
				ctx.ui.notify("Appended an assistant message; it applies on the next session rebuild.", "info");
			}
		},
	});
}

export default function (pi: ExtensionAPI) {
	if (featureEnabled("PI_TRIM_HISTORY")) registerTrimHistory(pi);
	if (featureEnabled("PI_STRIP_TOOL_HISTORY")) registerStripToolHistory(pi);
	if (featureEnabled("PI_COMPACT")) {
		registerGenerateCompact(pi);
		registerInjectCompact(pi);
	}
	if (featureEnabled("PI_APPEND_MESSAGE")) registerAppendMessage(pi);
}
