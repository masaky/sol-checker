import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import path from "node:path";

const CLI = path.resolve("src/index.ts");

function run(...args: string[]): string {
    try {
        return execFileSync("npx", ["tsx", CLI, ...args], {
            encoding: "utf-8",
            cwd: path.resolve("."),
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
            const output = run("scan", tmpSol);
            expect(output).toContain("sol-checker");
            // Without API key, should show an auth error
            expect(output).toContain("Error");
        } finally {
            fs.unlinkSync(tmpSol);
        }
    });
});
