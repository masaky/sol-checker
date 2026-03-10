import type { Finding, Severity } from "./base.js";
import { ProviderError } from "./base.js";

// ---------------------------------------------------------------------------
// validateFindings
// ---------------------------------------------------------------------------

const VALID_SEVERITIES = new Set<Severity>(["HIGH", "MEDIUM", "LOW", "INFO"]);

/**
 * Parses and validates the raw LLM text response into a Finding array.
 * Throws ProviderError with code INVALID_RESPONSE if the JSON is malformed
 * or the structure is unexpected.
 */
export function validateFindings(raw: string): Finding[] {
    // 1. Parse JSON
    let parsed: unknown;
    try {
        // Strip markdown code fences if the model wrapped the output
        const cleaned = raw
            .replace(/^```(?:json)?\s*/m, "")
            .replace(/```\s*$/m, "")
            .trim();
        parsed = JSON.parse(cleaned);
    } catch (err) {
        throw new ProviderError(
            `LLM response is not valid JSON: ${(err as Error).message}`,
            "INVALID_RESPONSE",
            err
        );
    }

    // 2. Must be an array
    if (!Array.isArray(parsed)) {
        throw new ProviderError(
            "LLM response must be a JSON array",
            "INVALID_RESPONSE"
        );
    }

    // 3. Validate each element
    const findings: Finding[] = [];

    for (let i = 0; i < parsed.length; i++) {
        const item = parsed[i] as Record<string, unknown>;

        if (typeof item !== "object" || item === null) {
            throw new ProviderError(
                `Finding at index ${i} is not an object`,
                "INVALID_RESPONSE"
            );
        }

        // severity
        if (!VALID_SEVERITIES.has(item.severity as Severity)) {
            throw new ProviderError(
                `Finding[${i}].severity must be HIGH|MEDIUM|LOW|INFO, got: ${item.severity}`,
                "INVALID_RESPONSE"
            );
        }

        // required string fields
        for (const field of ["title", "description", "impact", "fix"] as const) {
            if (typeof item[field] !== "string" || (item[field] as string).trim() === "") {
                throw new ProviderError(
                    `Finding[${i}].${field} must be a non-empty string`,
                    "INVALID_RESPONSE"
                );
            }
        }

        // line — number or null
        if (item.line !== null && typeof item.line !== "number") {
            throw new ProviderError(
                `Finding[${i}].line must be a number or null`,
                "INVALID_RESPONSE"
            );
        }

        findings.push({
            severity: item.severity as Severity,
            title: (item.title as string).trim(),
            line: typeof item.line === "number" ? Math.round(item.line) : null,
            description: (item.description as string).trim(),
            impact: (item.impact as string).trim(),
            fix: (item.fix as string).trim(),
        });
    }

    return findings;
}
