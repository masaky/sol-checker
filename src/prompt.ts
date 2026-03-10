import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ScanTarget } from "./scanner.js";

// ---------------------------------------------------------------------------
// Resolve prompts directory relative to this module
// ---------------------------------------------------------------------------

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROMPTS_DIR = path.resolve(__dirname, "../prompts");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BuiltPrompt {
    /** The system prompt (role + output format instructions) */
    system: string;
    /** The user message containing the source code to audit */
    user: string;
}

// ---------------------------------------------------------------------------
// loadSystemPrompt
// ---------------------------------------------------------------------------

/**
 * Reads the system prompt from prompts/checker-system.md.
 * Exported for testing.
 */
export function loadSystemPrompt(promptsDir: string = PROMPTS_DIR): string {
    const promptPath = path.join(promptsDir, "checker-system.md");

    if (!fs.existsSync(promptPath)) {
        throw new Error(
            `System prompt not found: ${promptPath}. Run the project from the repository root.`
        );
    }

    return fs.readFileSync(promptPath, "utf-8").trim();
}

// ---------------------------------------------------------------------------
// buildPrompt
// ---------------------------------------------------------------------------

/**
 * Combines the system prompt with the Solidity source code to produce the
 * final prompt object ready to send to an LLM provider.
 *
 * @param target - The scan target returned by readSolFile()
 * @param promptsDir - Override for the prompts directory (used in tests)
 */
export function buildPrompt(
    target: ScanTarget,
    promptsDir: string = PROMPTS_DIR
): BuiltPrompt {
    const system = loadSystemPrompt(promptsDir);

    const user = [
        `Analyze the following Solidity smart contract for security vulnerabilities.`,
        ``,
        `File: ${path.basename(target.filePath)}`,
        ``,
        "```solidity",
        target.source,
        "```",
    ].join("\n");

    return { system, user };
}
