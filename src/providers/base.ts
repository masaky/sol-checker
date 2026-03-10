// ---------------------------------------------------------------------------
// Vulnerability finding — shared type used across all providers and the reporter
// ---------------------------------------------------------------------------

export type Severity = "HIGH" | "MEDIUM" | "LOW" | "INFO";

export interface Finding {
    severity: Severity;
    title: string;
    line: number | null;
    description: string;
    impact: string;
    fix: string;
}

// ---------------------------------------------------------------------------
// LLM Provider interface
// ---------------------------------------------------------------------------

export interface ScanResult {
    findings: Finding[];
    /** Raw text response from the LLM (useful for debugging) */
    rawResponse: string;
    /** Model used for this scan */
    model: string;
    /** Provider identifier */
    provider: string;
}

export interface LLMProvider {
    /** Human-readable provider name, e.g. "claude" */
    readonly name: string;
    /** The model identifier being used */
    readonly model: string;

    /**
     * Send the system + user prompt to the LLM and return structured findings.
     */
    scan(system: string, user: string): Promise<ScanResult>;
}

// ---------------------------------------------------------------------------
// Provider errors
// ---------------------------------------------------------------------------

export type ProviderErrorCode =
    | "AUTH_ERROR"       // Invalid or missing API key
    | "RATE_LIMIT"       // Rate limit hit
    | "TIMEOUT"          // Request timed out
    | "INVALID_RESPONSE" // LLM returned non-parseable JSON
    | "API_ERROR";       // Other API-level error

export class ProviderError extends Error {
    constructor(
        message: string,
        public readonly code: ProviderErrorCode,
        public readonly cause?: unknown
    ) {
        super(message);
        this.name = "ProviderError";
    }
}
