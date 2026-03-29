import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { LLMProvider, Severity, VerifiedFinding } from "../providers/base.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VerifyResult {
    finding_title: string;
    verdict: "confirmed" | "suspicious" | "rejected";
    reason: string;
    suggested_severity?: Severity;
}

const VALID_VERDICTS = new Set(["confirmed", "suspicious", "rejected"]);
const VALID_SEVERITIES = new Set(["HIGH", "MEDIUM", "LOW", "INFO"]);

// ---------------------------------------------------------------------------
// Response parsing
// ---------------------------------------------------------------------------

export function parseVerifyResponse(raw: string): VerifyResult[] {
    let cleaned = raw.trim();
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");

    let parsed: unknown;
    try {
        parsed = JSON.parse(cleaned);
    } catch {
        throw new Error(`Failed to parse verify response as JSON: ${cleaned.slice(0, 100)}`);
    }

    if (!Array.isArray(parsed)) {
        throw new Error("Verify response must be a JSON array");
    }

    return parsed.map((item: Record<string, unknown>, i: number) => {
        if (typeof item.finding_title !== "string" || !item.finding_title.trim()) {
            throw new Error(`Verify result [${i}]: missing or empty finding_title`);
        }
        if (!VALID_VERDICTS.has(item.verdict as string)) {
            throw new Error(`Verify result [${i}]: invalid verdict "${item.verdict}"`);
        }
        if (typeof item.reason !== "string" || !item.reason.trim()) {
            throw new Error(`Verify result [${i}]: missing or empty reason`);
        }
        if (item.suggested_severity !== undefined && !VALID_SEVERITIES.has(item.suggested_severity as string)) {
            throw new Error(`Verify result [${i}]: invalid suggested_severity "${item.suggested_severity}"`);
        }

        return {
            finding_title: item.finding_title as string,
            verdict: item.verdict as VerifyResult["verdict"],
            reason: item.reason as string,
            ...(item.suggested_severity ? { suggested_severity: item.suggested_severity as Severity } : {}),
        };
    });
}

// ---------------------------------------------------------------------------
// Apply verdict to finding
// ---------------------------------------------------------------------------

export function applyVerdict(finding: VerifiedFinding, verdict: VerifyResult): VerifiedFinding {
    const result = { ...finding };

    if (verdict.verdict === "confirmed") {
        return result;
    }

    result.verified = false;
    result.verifyNote = verdict.reason;

    if (verdict.verdict === "rejected") {
        result.originalSeverity = finding.severity;
        result.severity = "INFO";
    } else if (verdict.verdict === "suspicious" && verdict.suggested_severity) {
        result.originalSeverity = finding.severity;
        result.severity = verdict.suggested_severity;
    }

    return result;
}

// ---------------------------------------------------------------------------
// Load verifier prompt
// ---------------------------------------------------------------------------

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_PROMPTS_DIR = path.resolve(__dirname, "../../prompts");

export function loadVerifierPrompt(promptsDir: string = DEFAULT_PROMPTS_DIR): string {
    const promptPath = path.join(promptsDir, "verifier-system.md");
    return fs.readFileSync(promptPath, "utf-8");
}

// ---------------------------------------------------------------------------
// Build user prompt for verification
// ---------------------------------------------------------------------------

function buildVerifyUserPrompt(numberedSource: string, findings: VerifiedFinding[]): string {
    const findingsJson = JSON.stringify(
        findings.map((f) => ({
            severity: f.severity,
            title: f.title,
            line: f.line,
            description: f.description,
            impact: f.impact,
            fix: f.fix,
        })),
        null,
        2,
    );

    return `## Source Code

\`\`\`solidity
${numberedSource}
\`\`\`

## Findings to Verify

\`\`\`json
${findingsJson}
\`\`\`

Verify each finding. Respond with a JSON array only.`;
}

// ---------------------------------------------------------------------------
// Main LLM verifier
// ---------------------------------------------------------------------------

export async function verifyByLLM(
    findings: VerifiedFinding[],
    numberedSource: string,
    provider: LLMProvider,
    options: { skipInfo?: boolean; promptsDir?: string } = {},
): Promise<VerifiedFinding[]> {
    const skipInfo = options.skipInfo ?? true;

    // Separate findings to verify vs skip
    const toVerify: VerifiedFinding[] = [];
    const skipped: VerifiedFinding[] = [];

    for (const f of findings) {
        if (!f.verified) {
            // Already flagged by Stage 1 — skip
            skipped.push(f);
        } else if (skipInfo && f.severity === "INFO") {
            skipped.push(f);
        } else {
            toVerify.push(f);
        }
    }

    // Nothing to verify
    if (toVerify.length === 0) {
        return [...skipped, ...toVerify];
    }

    // Call LLM
    const systemPrompt = loadVerifierPrompt(options.promptsDir);
    const userPrompt = buildVerifyUserPrompt(numberedSource, toVerify);
    const rawResponse = await provider.rawCall(systemPrompt, userPrompt);

    // Parse and apply verdicts
    const verdicts = parseVerifyResponse(rawResponse);
    const verdictMap = new Map(verdicts.map((v) => [v.finding_title, v]));

    const verified = toVerify.map((f) => {
        const verdict = verdictMap.get(f.title);
        if (!verdict) return f; // No verdict — keep as-is
        return applyVerdict(f, verdict);
    });

    return [...skipped, ...verified];
}
