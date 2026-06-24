import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { LLMProvider, ScanResult } from "./base.js";
import { ProviderError } from "./base.js";
import { CLAUDE_DEFAULT_MODEL } from "./claude.js";
import { validateFindings } from "./validate.js";

// ---------------------------------------------------------------------------
// ClaudeCliProvider — calls `claude -p` (Claude Code CLI) instead of the SDK.
// Uses CLAUDE_CONFIG_DIR for OAuth auth, so no ANTHROPIC_API_KEY is needed.
//
// Large prompts are written to temp files and passed via --add-dir to avoid
// spawnSync argument-size / CLI initialization timeouts.
// ---------------------------------------------------------------------------

export class ClaudeCliProvider implements LLMProvider {
    readonly name = "claude-cli";
    readonly model: string;

    private readonly claudeConfigDir: string;
    private readonly maxBudgetUsd: number;

    constructor(
        claudeConfigDir: string,
        model = CLAUDE_DEFAULT_MODEL,
        maxBudgetUsd = 2.0
    ) {
        this.claudeConfigDir = claudeConfigDir;
        this.model = model;
        this.maxBudgetUsd = maxBudgetUsd;
    }

    private call(system: string, user: string): string {
        const uid = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
        const tmpDir = os.tmpdir();
        const sysFile  = path.join(tmpDir, `sc-sys-${uid}.md`);
        const taskFile = path.join(tmpDir, `sc-task-${uid}.md`);

        try {
            fs.writeFileSync(sysFile,  system, "utf-8");
            fs.writeFileSync(taskFile, user,   "utf-8");

            // -p is a tiny instruction; actual content is read from temp files
            // via --add-dir so the CLI argument stays small.
            // "SUBAGENT:" prefix triggers the using-superpowers SUBAGENT-STOP guard,
            // preventing skill-loading preamble from polluting the JSON output.
            const prompt =
                `SUBAGENT: You are an automated subagent on an isolated scan task. ` +
                `Per using-superpowers SUBAGENT-STOP: skip all skill loading. ` +
                `Read ${sysFile} for your role and output format, ` +
                `then read ${taskFile} for the Solidity source to analyze. ` +
                `Output ONLY what the rules in ${sysFile} require — no other text.`;

            const result = spawnSync(
                "claude",
                [
                    "-p", prompt,
                    "--model", this.model,
                    "--add-dir", tmpDir,
                    "--permission-mode", "default",
                    "--output-format", "text",
                ],
                {
                    env: { ...process.env, CLAUDE_CONFIG_DIR: this.claudeConfigDir, ANTHROPIC_API_KEY: undefined },
                    maxBuffer: 10 * 1024 * 1024,
                    timeout: 300_000,
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
                    `claude CLI exited with status ${result.status}: ${stderr.slice(0, 500)}`,
                    "API_ERROR"
                );
            }

            return (result.stdout as string).trim();
        } finally {
            try { fs.unlinkSync(sysFile);  } catch { /* ignore */ }
            try { fs.unlinkSync(taskFile); } catch { /* ignore */ }
        }
    }

    async scan(system: string, user: string): Promise<ScanResult> {
        const MAX_ATTEMPTS = 2;
        let lastErr: ProviderError | undefined;
        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            try {
                const rawResponse = this.call(system, user);
                const findings = validateFindings(rawResponse);
                return { findings, rawResponse, model: this.model, provider: this.name };
            } catch (err) {
                if (err instanceof ProviderError && err.code === "INVALID_RESPONSE") {
                    lastErr = err;
                    process.stderr.write(`[claude-cli] attempt ${attempt} got non-JSON response, retrying...\n`);
                } else {
                    throw err;
                }
            }
        }
        throw lastErr!;
    }

    async rawCall(system: string, user: string): Promise<string> {
        return this.call(system, user);
    }
}
