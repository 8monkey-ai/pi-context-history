// Each feature is enabled unless its flag is explicitly set to a falsy value.
// This keeps the bundle behaving like all four original extensions installed
// together, while letting users opt out of any single one.
export function featureEnabled(flag: string) {
	const value = process.env[flag];
	return value !== "false" && value !== "0";
}

export const HISTORY_DAYS = Number(process.env["PI_HISTORY_DAYS"]) || 60;
export const SUMMARY_STALENESS_DAYS = Number(process.env["PI_SUMMARY_STALENESS_DAYS"]) || 3;
