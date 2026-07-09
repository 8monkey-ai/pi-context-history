import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const PI_DIR = join(homedir(), ".pi");
const PROJECT_PI_DIR = join(process.cwd(), ".pi");

// Project `.pi/` wins over `~/.pi/` when both define the same file.
export function readPiFile(relative: string): string | null {
	let content: string | null = null;
	try {
		content = readFileSync(join(PI_DIR, relative), "utf-8").trim() || null;
	} catch {}
	try {
		content = readFileSync(join(PROJECT_PI_DIR, relative), "utf-8").trim() || null;
	} catch {}
	return content;
}
