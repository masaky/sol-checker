import { describe, it, expect } from "vitest";
import { formatTerminal, formatMarkdown } from "../src/reporter.js";
import type { ScanResult, VerifiedFinding } from "../src/providers/base.js";

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
        // RESULT_WITH_FINDINGS includes a LOW finding with line: null
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

// ---------------------------------------------------------------------------
// formatMarkdown
// ---------------------------------------------------------------------------

describe("formatMarkdown", () => {
    it("includes markdown header with file and provider", () => {
        const output = formatMarkdown(RESULT_WITH_FINDINGS, FILE_PATH);
        expect(output).toContain("# Sol-Checker Report");
        expect(output).toContain("src/MyToken.sol");
        expect(output).toContain("claude");
    });

    it("includes summary table", () => {
        const output = formatMarkdown(RESULT_WITH_FINDINGS, FILE_PATH);
        expect(output).toContain("| Severity | Count |");
        expect(output).toContain("| HIGH");
    });

    it("includes finding sections with severity in heading", () => {
        const output = formatMarkdown(RESULT_WITH_FINDINGS, FILE_PATH);
        expect(output).toContain("### [HIGH] Reentrancy in withdraw()");
        expect(output).toContain("### [MEDIUM] tx.origin usage");
    });

    it("includes line number in finding", () => {
        const output = formatMarkdown(RESULT_WITH_FINDINGS, FILE_PATH);
        expect(output).toContain("**Line:** 42");
    });

    it("omits line field when null", () => {
        const output = formatMarkdown(RESULT_WITH_FINDINGS, FILE_PATH);
        expect(output).not.toContain("**Line:** null");
    });

    it("shows no-vulnerabilities message when findings is empty", () => {
        const output = formatMarkdown(RESULT_NO_FINDINGS, FILE_PATH);
        expect(output).toContain("No vulnerabilities found");
    });

    it("includes date", () => {
        const output = formatMarkdown(RESULT_WITH_FINDINGS, FILE_PATH);
        expect(output).toMatch(/\d{4}-\d{2}-\d{2}/);
    });
});

// ---------------------------------------------------------------------------
// VerifiedFinding support
// ---------------------------------------------------------------------------

describe("formatTerminal with VerifiedFinding", () => {
    it("shows UNVERIFIED label for unverified findings", () => {
        const result = {
            findings: [{
                severity: "INFO" as const,
                title: "Fake vulnerability",
                line: 10,
                description: "desc",
                impact: "impact",
                fix: "fix",
                verified: false,
                verifyNote: "Attack scenario not feasible",
                originalSeverity: "HIGH",
            }] satisfies VerifiedFinding[],
            rawResponse: "",
            model: "test",
            provider: "test",
        };
        const output = formatTerminal(result, "test.sol");
        expect(output).toContain("UNVERIFIED");
        expect(output).toContain("Attack scenario not feasible");
        expect(output).toContain("HIGH");
    });

    it("shows corrected line number", () => {
        const result = {
            findings: [{
                severity: "LOW" as const,
                title: "Some issue",
                line: 39,
                description: "desc",
                impact: "impact",
                fix: "fix",
                verified: true,
                verifyNote: "Line corrected: 100→39",
                originalLine: 100,
            }] satisfies VerifiedFinding[],
            rawResponse: "",
            model: "test",
            provider: "test",
        };
        const output = formatTerminal(result, "test.sol");
        expect(output).toContain("39");
        expect(output).toContain("corrected from 100");
    });
});

describe("formatMarkdown with VerifiedFinding", () => {
    it("shows verification columns in summary table", () => {
        const result = {
            findings: [
                {
                    severity: "LOW" as const,
                    title: "Real issue",
                    line: 10,
                    description: "desc",
                    impact: "impact",
                    fix: "fix",
                    verified: true,
                },
                {
                    severity: "INFO" as const,
                    title: "Fake issue",
                    line: 20,
                    description: "desc",
                    impact: "impact",
                    fix: "fix",
                    verified: false,
                    originalSeverity: "HIGH",
                    verifyNote: "Not feasible",
                },
            ] satisfies VerifiedFinding[],
            rawResponse: "",
            model: "test",
            provider: "test",
        };
        const output = formatMarkdown(result, "test.sol");
        expect(output).toContain("Verified");
        expect(output).toContain("Unverified");
    });

    it("shows strikethrough original severity on rejected finding", () => {
        const result = {
            findings: [{
                severity: "INFO" as const,
                title: "Rejected finding",
                line: 10,
                description: "desc",
                impact: "impact",
                fix: "fix",
                verified: false,
                originalSeverity: "HIGH",
                verifyNote: "Impossible attack",
            }] satisfies VerifiedFinding[],
            rawResponse: "",
            model: "test",
            provider: "test",
        };
        const output = formatMarkdown(result, "test.sol");
        expect(output).toContain("~~[HIGH]~~");
        expect(output).toContain("UNVERIFIED");
    });
});
