// On by default, so the bundle behaves like all four extensions installed; opt out per flag.
export function featureEnabled(flag: string) {
	const value = process.env[flag];
	return value !== "false" && value !== "0";
}

export const HISTORY_DAYS = Number(process.env["PI_HISTORY_DAYS"]) || 60;
export const COMPACT_STALENESS_DAYS = Number(process.env["PI_COMPACT_STALENESS_DAYS"]) || 3;
