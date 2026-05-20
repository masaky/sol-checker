import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { LLMProvider, ScanResult } from "./base.js";
import { ProviderError } from "./base.js";
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
        model = "claude-sonnet-4-20250514",
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
            const prompt =
                `Read ${sysFile} for your system rules, ` +
                `then read ${taskFile} for the task and complete it exactly as specified.`;

            const result = spawnSync(
                "claude",
                [
                    "-p", prompt,
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
        const rawResponse = this.call(system, user);
        const findings = validateFindings(rawResponse);
        return { findings, rawResponse, model: this.model, provider: this.name };
    }

    async rawCall(system: string, user: string): Promise<string> {
        return this.call(system, user);
    }
}
