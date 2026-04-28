import { spawnSync } from "node:child_process";
import type { LLMProvider, ScanResult } from "./base.js";
import { ProviderError } from "./base.js";
import { validateFindings } from "./validate.js";

// ---------------------------------------------------------------------------
// ClaudeCliProvider — calls `claude -p` (Claude Code CLI) instead of the SDK.
// Uses CLAUDE_CONFIG_DIR for OAuth auth, so no ANTHROPIC_API_KEY is needed.
// ---------------------------------------------------------------------------

export class ClaudeCliProvider implements LLMProvider {
    readonly name = "claude-cli";
    readonly model: string;

    private readonly claudeConfigDir: string;
    private readonly maxBudgetUsd: number;

    constructor(
        claudeConfigDir: string,
        model = "claude-sonnet-4-20250514",
        maxBudgetUsd = 2.0
    ) {
        this.claudeConfigDir = claudeConfigDir;
        this.model = model;
        this.maxBudgetUsd = maxBudgetUsd;
    }

    private call(system: string, user: string): string {
        const prompt = `${system}\n\n${user}`;

        const result = spawnSync(
            "claude",
            [
                "-p", prompt,
                "--permission-mode", "bypassPermissions",
                "--max-budget-usd", String(this.maxBudgetUsd),
            ],
            {
                env: { ...process.env, CLAUDE_CONFIG_DIR: this.claudeConfigDir },
                maxBuffer: 10 * 1024 * 1024,
                timeout: 180_000,
                encoding: "utf-8",
            }
        );

        if (result.error) {
            throw new ProviderError(
                `claude CLI spawn error: ${result.error.message}`,
                "API_ERROR",
                result.error
            );
        }

        if (result.status !== 0) {
            const stderr = (result.stderr as string | null) ?? "";
            throw new ProviderError(
                `claude CLI exited with status ${result.status}: ${stderr.slice(0, 300)}`,
                "API_ERROR"
            );
        }

        return (result.stdout as string).trim();
    }

    async scan(system: string, user: string): Promise<ScanResult> {
        const rawResponse = this.call(system, user);
        const findings = validateFindings(rawResponse);
        return { findings, rawResponse, model: this.model, provider: this.name };
    }

    async rawCall(system: string, user: string): Promise<string> {
        return this.call(system, user);
    }
}
