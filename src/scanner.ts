import fs from "node:fs";
import path from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScanTarget {
    /** Absolute path to the .sol file */
    filePath: string;
    /** Raw Solidity source code */
    source: string;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class ScannerError extends Error {
    constructor(
        message: string,
        public readonly code: "NOT_FOUND" | "INVALID_EXTENSION" | "READ_ERROR"
    ) {
        super(message);
        this.name = "ScannerError";
    }
}

// ---------------------------------------------------------------------------
// readSolFile
// ---------------------------------------------------------------------------

/**
 * Reads a Solidity source file and returns a ScanTarget.
 *
 * @throws {ScannerError} if the file does not exist, is not a .sol file, or cannot be read.
 */
export function readSolFile(filePath: string): ScanTarget {
    const resolved = path.resolve(filePath);

    // 1. Extension check
    if (!resolved.endsWith(".sol")) {
        throw new ScannerError(
            `File must have a .sol extension: ${filePath}`,
            "INVALID_EXTENSION"
        );
    }

    // 2. Existence check
    if (!fs.existsSync(resolved)) {
        throw new ScannerError(`File not found: ${filePath}`, "NOT_FOUND");
    }

    // 3. Read
    let source: string;
    try {
        source = fs.readFileSync(resolved, "utf-8");
    } catch (err) {
        throw new ScannerError(
            `Failed to read file: ${filePath} — ${(err as Error).message}`,
            "READ_ERROR"
        );
    }

    return { filePath: resolved, source };
}
