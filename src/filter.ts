export function filterByAge<T extends { timestamp: number }>(messages: T[], now: number, maxAgeMs: number) {
	return messages.filter((msg) => msg.timestamp >= now - maxAgeMs);
}
