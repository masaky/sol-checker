import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import path from "node:path";

const CLI = path.resolve("src/index.ts");

function run(...args: string[]): string;
function run(args: string[], env: Record<string, string | undefined>): string;
function run(...params: unknown[]): string {
    let args: string[];
    let envOverride: Record<string, string | undefined> | undefined;

    if (Array.isArray(params[0])) {
        args = params[0] as string[];
        envOverride = params[1] as Record<string, string | undefined>;
    } else {
        args = params as string[];
    }

    try {
        return execFileSync("npx", ["tsx", CLI, ...args], {
            encoding: "utf-8",
            cwd: path.resolve("."),
            env: envOverride ? { ...process.env, ...envOverride } : undefined,
        });
    } catch (e: unknown) {
        const err = e as { stdout?: string; stderr?: string; status?: number };
        // Return combined output for assertion even on non-zero exit
        return (err.stdout ?? "") + (err.stderr ?? "");
    }
}

describe("CLI", () => {
    it("should show help with --help", () => {
        const output = run("--help");
        expect(output).toContain("sol-checker");
        expect(output).toContain("scan");
        expect(output).toContain("init");
    });

    it("should show version with --version", () => {
        const output = run("--version");
        expect(output).toContain("0.1.0");
    });

    it("should reject non-.sol files", () => {
        const output = run("scan", "foo.txt");
        expect(output).toContain("must have a .sol extension");
    });

    it("should report missing file", () => {
        const output = run("scan", "nonexistent.sol");
        expect(output).toContain("File not found");
    });

    it("should show LLM error without API key", () => {
        const fs = require("node:fs");
        const tmpSol = path.resolve("test/fixtures/tmp-test.sol");
        fs.mkdirSync(path.dirname(tmpSol), { recursive: true });
        fs.writeFileSync(tmpSol, "// SPDX-License-Identifier: MIT\npragma solidity ^0.8.0;\n");

        try {
            const output = run(["scan", tmpSol], { ANTHROPIC_API_KEY: "" });
            expect(output).toContain("sol-checker");
            // Without API key, should show a helpful error
            expect(output).toContain("No API key configured");
        } finally {
            fs.unlinkSync(tmpSol);
        }
    });
});
