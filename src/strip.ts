// Minimal message shape, to avoid a runtime dependency on the pi package.
export type Message = {
	role: string;
	content: { type: string }[];
};

// Index of the first message in the current turn: scan from the end, skipping the
// trailing tool exchange (tool results + the assistant message that called them),
// so the current turn's tools survive while earlier ones can be stripped.
export function findBoundary(messages: Message[]) {
	let boundary = messages.length;
	while (boundary > 0 && messages[boundary - 1]?.role === "toolResult") {
		boundary--;
	}
	if (boundary > 0) {
		const prev = messages[boundary - 1];
		if (prev?.role === "assistant" && prev.content.some((b) => b.type === "toolCall")) {
			boundary--;
		}
	}
	return boundary;
}

export function stripBeforeBoundary(messages: Message[], boundaryIndex: number) {
	const cleaned: Message[] = [];
	for (let i = 0; i < messages.length; i++) {
		const msg = messages[i];
		if (!msg) continue;
		if (i >= boundaryIndex) {
			cleaned.push(msg);
			continue;
		}
		if (msg.role === "toolResult") continue;
		if (msg.role === "assistant") {
			const hasNonToolContent = msg.content.some((block) => block.type !== "toolCall");
			if (!hasNonToolContent) continue;
			const strippedContent = msg.content.filter((block) => block.type !== "toolCall");
			cleaned.push({ ...msg, content: strippedContent });
			continue;
		}
		cleaned.push(msg);
	}
	return cleaned;
}
