import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readSolFile, ScannerError } from "../src/scanner.js";
import { buildPrompt, loadSystemPrompt } from "../src/prompt.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Creates a temporary directory and returns its path.
 * Also writes a minimal Solidity file for use in tests.
 */
function makeTmpDir(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), "sol-checker-test-"));
}

function writeSolFile(dir: string, name: string, content: string): string {
    const filePath = path.join(dir, name);
    fs.writeFileSync(filePath, content, "utf-8");
    return filePath;
}

const MINIMAL_SOL = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract Simple {
    uint256 public value;
}
`;

// ---------------------------------------------------------------------------
// readSolFile
// ---------------------------------------------------------------------------

describe("readSolFile", () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = makeTmpDir();
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it("returns ScanTarget for a valid .sol file", () => {
        const filePath = writeSolFile(tmpDir, "simple.sol", MINIMAL_SOL);
        const target = readSolFile(filePath);

        expect(target.filePath).toBe(path.resolve(filePath));
        expect(target.source).toBe(MINIMAL_SOL);
    });

    it("throws INVALID_EXTENSION for non-.sol file", () => {
        const filePath = path.join(tmpDir, "script.js");
        fs.writeFileSync(filePath, "// js file");

        expect(() => readSolFile(filePath)).toThrow(ScannerError);

        try {
            readSolFile(filePath);
        } catch (e) {
            expect((e as ScannerError).code).toBe("INVALID_EXTENSION");
        }
    });

    it("throws NOT_FOUND for a missing file", () => {
        const filePath = path.join(tmpDir, "missing.sol");

        expect(() => readSolFile(filePath)).toThrow(ScannerError);

        try {
            readSolFile(filePath);
        } catch (e) {
            expect((e as ScannerError).code).toBe("NOT_FOUND");
        }
    });

    it("resolves relative paths to absolute paths", () => {
        const filePath = writeSolFile(tmpDir, "relative.sol", MINIMAL_SOL);
        const relPath = path.relative(process.cwd(), filePath);
        const target = readSolFile(relPath);

        expect(path.isAbsolute(target.filePath)).toBe(true);
    });

    it("reads the vulnerable.sol fixture correctly", () => {
        const fixturePath = path.resolve("test/fixtures/vulnerable.sol");
        const target = readSolFile(fixturePath);

        expect(target.source).toContain("VulnerableBank");
        expect(target.source.length).toBeGreaterThan(100);
    });
});

// ---------------------------------------------------------------------------
// buildPrompt
// ---------------------------------------------------------------------------

describe("buildPrompt", () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = makeTmpDir();
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it("returns a BuiltPrompt with system and user fields", () => {
        // Use the real prompts directory
        const filePath = writeSolFile(tmpDir, "contract.sol", MINIMAL_SOL);
        const target = { filePath, source: MINIMAL_SOL };

        const prompt = buildPrompt(target);

        expect(prompt).toHaveProperty("system");
        expect(prompt).toHaveProperty("user");
        expect(typeof prompt.system).toBe("string");
        expect(typeof prompt.user).toBe("string");
    });

    it("includes the source code in the user message", () => {
        const filePath = writeSolFile(tmpDir, "contract.sol", MINIMAL_SOL);
        const target = { filePath, source: MINIMAL_SOL };

        const prompt = buildPrompt(target);

        expect(prompt.user).toContain("pragma solidity");
        expect(prompt.user).toContain("contract.sol");
    });

    it("includes the filename in the user message", () => {
        const filePath = writeSolFile(tmpDir, "my_token.sol", MINIMAL_SOL);
        const target = { filePath, source: MINIMAL_SOL };

        const prompt = buildPrompt(target);

        expect(prompt.user).toContain("my_token.sol");
    });

    it("system prompt instructs to return JSON array", () => {
        const prompt = buildPrompt({ filePath: "x.sol", source: MINIMAL_SOL });

        expect(prompt.system).toContain("JSON");
        expect(prompt.system.toLowerCase()).toContain("severity");
    });

    it("throws when prompts directory does not exist", () => {
        const target = { filePath: "x.sol", source: MINIMAL_SOL };

        expect(() =>
            buildPrompt(target, path.join(tmpDir, "nonexistent"))
        ).toThrow();
    });
});

// ---------------------------------------------------------------------------
// loadSystemPrompt
// ---------------------------------------------------------------------------

describe("loadSystemPrompt", () => {
    it("loads the real checker-system.md", () => {
        const system = loadSystemPrompt();

        expect(system.length).toBeGreaterThan(50);
        expect(system).toContain("severity");
    });

    it("throws when the prompt file is missing", () => {
        expect(() => loadSystemPrompt("/nonexistent/dir")).toThrow();
    });
});
