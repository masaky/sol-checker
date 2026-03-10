import Anthropic from "@anthropic-ai/sdk";
import type { LLMProvider, ScanResult } from "./base.js";
import { ProviderError } from "./base.js";
import { validateFindings } from "./validate.js";

// ---------------------------------------------------------------------------
// Default model
// ---------------------------------------------------------------------------

export const CLAUDE_DEFAULT_MODEL = "claude-sonnet-4-20250514";

// ---------------------------------------------------------------------------
// ClaudeProvider
// ---------------------------------------------------------------------------

export class ClaudeProvider implements LLMProvider {
    readonly name = "claude";
    readonly model: string;

    private readonly client: Anthropic;

    constructor(apiKey: string, model: string = CLAUDE_DEFAULT_MODEL) {
        if (!apiKey || apiKey.trim() === "") {
            throw new ProviderError(
                "Anthropic API key is required. Set llm.api_key in ~/.sol-checker/config.toml or export ANTHROPIC_API_KEY.",
                "AUTH_ERROR"
            );
        }

        this.model = model;
        this.client = new Anthropic({ apiKey });
    }

    async scan(system: string, user: string): Promise<ScanResult> {
        let rawResponse: string;

        try {
            const message = await this.client.messages.create({
                model: this.model,
                max_tokens: 4096,
                system,
                messages: [{ role: "user", content: user }],
            });

            // Extract text content
            const textBlock = message.content.find((b) => b.type === "text");
            if (!textBlock || textBlock.type !== "text") {
                throw new ProviderError(
                    "Claude returned no text content in response",
                    "INVALID_RESPONSE"
                );
            }
            rawResponse = textBlock.text;
        } catch (err) {
            // Re-throw ProviderErrors as-is
            if (err instanceof ProviderError) throw err;

            // Map Anthropic SDK errors to ProviderError
            const e = err as { status?: number; message?: string };

            if (e.status === 401) {
                throw new ProviderError(
                    "Invalid Anthropic API key (HTTP 401). Check your config or ANTHROPIC_API_KEY env var.",
                    "AUTH_ERROR",
                    err
                );
            }
            if (e.status === 429) {
                throw new ProviderError(
                    "Anthropic rate limit exceeded (HTTP 429). Wait and retry.",
                    "RATE_LIMIT",
                    err
                );
            }
            if (
                e.message?.includes("timeout") ||
                e.message?.includes("ETIMEDOUT") ||
                e.message?.includes("ECONNRESET")
            ) {
                throw new ProviderError(
                    "Request to Anthropic API timed out.",
                    "TIMEOUT",
                    err
                );
            }

            throw new ProviderError(
                `Anthropic API error: ${e.message ?? "unknown error"}`,
                "API_ERROR",
                err
            );
        }

        // Validate and parse the JSON response
        const findings = validateFindings(rawResponse);

        return {
            findings,
            rawResponse,
            model: this.model,
            provider: this.name,
        };
    }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Resolves the API key from:
 *  1. config.toml (llm.api_key)
 *  2. ANTHROPIC_API_KEY environment variable
 */
export function resolveApiKey(configApiKey: string): string {
    if (configApiKey && configApiKey.trim() !== "") {
        return configApiKey.trim();
    }
    const envKey = process.env["ANTHROPIC_API_KEY"];
    if (envKey && envKey.trim() !== "") {
        return envKey.trim();
    }
    return "";
}
