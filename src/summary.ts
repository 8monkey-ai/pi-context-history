import { execFileSync } from "node:child_process";
import { DEFAULT_SUMMARY_PROMPT } from "./default-prompt.ts";

const DAY_MS = 86_400_000;

export type TranscriptEntry = {
	type: string;
	timestamp: string;
	message?: {
		role?: string;
		content?: string | { type: string; text?: string }[];
	};
};

export function buildTranscript(entries: TranscriptEntry[]) {
	return entries
		.filter((e) => e.type === "message")
		.map((e) => {
			const msg = e.message;
			if (msg?.role !== "user" && msg?.role !== "assistant") return null;
			const text = Array.isArray(msg.content)
				? msg.content
						.filter((b) => b.type === "text")
						.map((b) => b.text)
						.join("\n")
				: String(msg.content || "");
			if (!text.trim()) return null;
			const ts = new Date(e.timestamp).toISOString().slice(0, 16).replace("T", " ");
			return `[${ts}] ${msg.role}: ${text.trim()}`;
		})
		.filter(Boolean)
		.join("\n\n");
}

function daysSince(date: Date, now: number) {
	return (now - date.getTime()) / DAY_MS;
}

export function isStale(summaryMtime: Date | null, firstUserDate: Date | null, now: number, stalenessDays: number) {
	if (summaryMtime && daysSince(summaryMtime, now) < stalenessDays) return false;
	if (!firstUserDate || daysSince(firstUserDate, now) < stalenessDays) return false;
	return true;
}

export function resolvePromptTemplate(fileContents: string | null) {
	return fileContents ?? DEFAULT_SUMMARY_PROMPT;
}

export function runPiSummary(template: string, history: string) {
	return execFileSync(
		"pi",
		[
			"-p",
			"--no-session",
			"--no-extensions",
			"--no-context-files",
			"--no-skills",
			"--system-prompt",
			template.replace("{conversation_history}", history),
			"Generate a detailed summary of the conversation. Respond with the summary only. No comments or other text.",
		],
		{ encoding: "utf-8", timeout: 60_000 },
	).trim();
}
