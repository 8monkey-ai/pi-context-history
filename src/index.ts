import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
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
import { readPiFile } from "./pi-file.ts";
import { findBoundary, stripBeforeBoundary, type Message } from "./strip.ts";

const HISTORY_MS = HISTORY_DAYS * 86_400_000;
const COMPACT_DIR = join(homedir(), ".pi", "agent", "compact");
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

// One summary file per session id, so sessions never see (or block) each
// other's summaries. Session ids are stable across resume; forks get new ids
// and start without a summary.
function compactPath(sessionId: string) {
	return join(COMPACT_DIR, `${sessionId}.md`);
}

function compactMtime(sessionId: string) {
	try {
		return statSync(compactPath(sessionId)).mtime;
	} catch {
		return null;
	}
}

function readCompact(sessionId: string) {
	try {
		return readFileSync(compactPath(sessionId), "utf-8").trim() || null;
	} catch {
		return null;
	}
}

function generate(sessionId: string, entries: TranscriptEntry[]): string | "empty" {
	const history = buildTranscript(entries);
	if (!history) return "empty";
	const template = resolvePromptTemplate(readPiFile("prompts/compact.md"));
	const summary = runPiCompact(template, history);
	if (!summary) return "empty";
	mkdirSync(COMPACT_DIR, { recursive: true });
	writeFileSync(compactPath(sessionId), summary);
	return summary;
}

function registerCompact(pi: ExtensionAPI) {
	pi.on("session_start", (event, ctx) => {
		if (event.reason === "new") return;
		const sessionId = ctx.sessionManager.getSessionId();
		const entries = ctx.sessionManager.getEntries() as TranscriptEntry[];
		if (!isStale(compactMtime(sessionId), firstUserDate(entries), Date.now(), COMPACT_STALENESS_DAYS)) {
			return;
		}
		try {
			generate(sessionId, entries);
		} catch {}
	});

	pi.registerCommand("compact-session", {
		description: "Regenerate this session's summary in ~/.pi/agent/compact/ now (ignores staleness)",
		handler: async (_args, ctx) => {
			const sessionId = ctx.sessionManager.getSessionId();
			const entries = ctx.sessionManager.getEntries() as TranscriptEntry[];
			let result: string | "empty";
			try {
				result = generate(sessionId, entries);
			} catch (err) {
				if (ctx.hasUI) ctx.ui.notify(`Failed to generate summary: ${(err as Error).message}.`, "error");
				return;
			}
			if (!ctx.hasUI) return;
			if (result === "empty") {
				ctx.ui.notify("Nothing to summarize in this session.", "info");
			} else {
				ctx.ui.notify(`Session summary written to ~/.pi/agent/compact/${sessionId}.md.`, "info");
			}
		},
	});

	pi.on("before_agent_start", (event, ctx) => {
		const sessionId = ctx.sessionManager.getSessionId();
		const summary = readCompact(sessionId);
		const mtime = summary ? compactMtime(sessionId) : null;
		const summaryDate = mtime ? (mtime.toISOString().split("T")[0] ?? "unknown") : "unknown";

		const systemPrompt = buildContextPrompt(event.systemPrompt, summary, summaryDate);
		return { systemPrompt };
	});
}

// Pi defers writing a new session file until the first assistant message, so
// appending to a fresh session (e.g. `pi --session-id x -p "/add-user-message ..."`)
// would exit without persisting anything. Force the write via private internals.
// Remove once https://github.com/earendil-works/pi/issues/6453 ships a public flush().
function flushSession(session: SessionManager) {
	const internals = session as unknown as { flushed: boolean; _rewriteFile(): void };
	if (!internals.flushed) {
		internals._rewriteFile();
		internals.flushed = true;
	}
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
			flushSession(session);
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
			flushSession(session);
			if (ctx.hasUI) {
				ctx.ui.notify("Appended an assistant message; it applies on the next session rebuild.", "info");
			}
		},
	});
}

export default function (pi: ExtensionAPI) {
	if (featureEnabled("PI_TRIM_HISTORY")) registerTrimHistory(pi);
	if (featureEnabled("PI_STRIP_TOOL_HISTORY")) registerStripToolHistory(pi);
	if (featureEnabled("PI_COMPACT")) registerCompact(pi);
	if (featureEnabled("PI_APPEND_MESSAGE")) registerAppendMessage(pi);
}
