interface TimestampedMessage {
	timestamp: number;
}

export function filterByAge<T extends TimestampedMessage>(
	messages: T[],
	now: number,
	maxAgeMs: number,
): T[] {
	return messages.filter((msg) => msg.timestamp >= now - maxAgeMs);
}
