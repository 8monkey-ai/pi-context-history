// Minimal, self-contained shape of a Pi context message. We only touch `role`
// and the `type` of each content block, so we keep the typing to that surface
// and avoid a runtime dependency on the pi package.
export type Message = {
	role: string;
	content: { type: string }[];
};

// The boundary is the index of the first message belonging to the current agent
// turn. We start from the end and skip the trailing tool exchange — any tool
// results, plus the assistant message that issued the tool calls — so the
// current turn's tool interactions stay intact while earlier ones are eligible
// for stripping.
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

// Remove tool calls and results from every message before `boundaryIndex`,
// leaving messages at or after the boundary verbatim. Tool-result messages are
// dropped; assistant messages lose their toolCall blocks and are dropped
// entirely if nothing else remains.
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
