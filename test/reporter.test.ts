import { describe, it, expect } from "vitest";
import { formatTerminal } from "../src/reporter.js";
import type { ScanResult } from "../src/providers/base.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const RESULT_WITH_FINDINGS: ScanResult = {
    findings: [
        {
            severity: "HIGH",
            title: "Reentrancy in withdraw()",
            line: 42,
            description: "External call before state update",
            impact: "Attacker can drain contract funds",
            fix: "Move state update before external call",
        },
        {
            severity: "MEDIUM",
            title: "tx.origin usage",
            line: 55,
            description: "tx.origin used for auth",
            impact: "Phishing attack possible",
            fix: "Use msg.sender instead",
        },
        {
            severity: "LOW",
            title: "Missing event emission",
            line: null,
            description: "State changes without events",
            impact: "Harder to track off-chain",
            fix: "Emit events after state changes",
        },
        {
            severity: "INFO",
            title: "Floating pragma",
            line: 2,
            description: "Pragma not locked",
            impact: "May compile with unintended version",
            fix: "Lock pragma to specific version",
        },
    ],
    rawResponse: "[]",
    model: "claude-sonnet-4-20250514",
    provider: "claude",
};

const RESULT_NO_FINDINGS: ScanResult = {
    findings: [],
    rawResponse: "[]",
    model: "claude-sonnet-4-20250514",
    provider: "claude",
};

const FILE_PATH = "src/MyToken.sol";

// ---------------------------------------------------------------------------
// formatTerminal
// ---------------------------------------------------------------------------

describe("formatTerminal", () => {
    it("includes summary counts by severity", () => {
        const output = formatTerminal(RESULT_WITH_FINDINGS, FILE_PATH);
        expect(output).toContain("HIGH");
        expect(output).toContain("MEDIUM");
        expect(output).toContain("LOW");
        expect(output).toContain("INFO");
    });

    it("includes finding titles", () => {
        const output = formatTerminal(RESULT_WITH_FINDINGS, FILE_PATH);
        expect(output).toContain("Reentrancy in withdraw()");
        expect(output).toContain("tx.origin usage");
    });

    it("includes file path", () => {
        const output = formatTerminal(RESULT_WITH_FINDINGS, FILE_PATH);
        expect(output).toContain("src/MyToken.sol");
    });

    it("shows line numbers when present", () => {
        const output = formatTerminal(RESULT_WITH_FINDINGS, FILE_PATH);
        expect(output).toContain("Line: 42");
    });

    it("omits line when null", () => {
        const output = formatTerminal(RESULT_WITH_FINDINGS, FILE_PATH);
        expect(output).not.toContain("Line: null");
    });

    it("shows no-vulnerabilities message when findings is empty", () => {
        const output = formatTerminal(RESULT_NO_FINDINGS, FILE_PATH);
        expect(output).toContain("No vulnerabilities found");
    });

    it("sorts findings by severity (HIGH first)", () => {
        const output = formatTerminal(RESULT_WITH_FINDINGS, FILE_PATH);
        const highIdx = output.indexOf("Reentrancy");
        const infoIdx = output.indexOf("Floating pragma");
        expect(highIdx).toBeLessThan(infoIdx);
    });
});
