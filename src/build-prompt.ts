export function buildContextPrompt(basePrompt: string, summary: string | null, summaryDate: string) {
	if (!summary) return basePrompt;
	return `${basePrompt}\n<summary date="${summaryDate}">\n${summary}\n</summary>\n<additional_context>\nThe above is a summary of recent interactions with this contact. Use it to maintain continuity and provide contextual responses.\nContinue the conversation using the same language and tone and follow the language direction above.\n</additional_context>`;
}
