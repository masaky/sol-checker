import type { Finding, VerifiedFinding, LLMProvider } from "./providers/base.js";
import { verifyByCode } from "./verifiers/code.js";
import { verifyByLLM } from "./verifiers/llm.js";

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface VerifyOptions {
    enabled?: boolean;
    skipLLM?: boolean;
    llmProvider?: LLMProvider;
    skipInfo?: boolean;
    lineTolerance?: number;
    promptsDir?: string;
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export async function verify(
    findings: Finding[],
    source: string,
    options: VerifyOptions = {},
): Promise<VerifiedFinding[]> {
    const { enabled = true, skipLLM = false } = options;

    // Pass through when disabled
    if (!enabled) {
        return findings.map((f) => ({ ...f, verified: true }));
    }

    const sourceLines = source.split("\n");

    // Stage 1: Programmatic verification
    let verified = verifyByCode(findings, sourceLines, options.lineTolerance);

    // Stage 2: LLM verification (if provider given and not skipped)
    if (!skipLLM && options.llmProvider) {
        const numberedSource = sourceLines
            .map((line, i) => `${i + 1}: ${line}`)
            .join("\n");

        try {
            verified = await verifyByLLM(verified, numberedSource, options.llmProvider, {
                skipInfo: options.skipInfo,
                promptsDir: options.promptsDir,
            });
        } catch {
            // Stage 2 failed — return Stage 1 results only
        }
    }

    return verified;
}
