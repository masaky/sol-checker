import { describe, it, expect, vi, beforeEach } from "vitest";
import { validateFindings } from "../src/providers/validate.js";
import { ClaudeProvider, resolveApiKey } from "../src/providers/claude.js";
import { ProviderError } from "../src/providers/base.js";
import type { Finding, Severity, VerifiedFinding } from "../src/providers/base.js";

// ---------------------------------------------------------------------------
// VerifiedFinding
// ---------------------------------------------------------------------------

describe("VerifiedFinding", () => {
    it("extends Finding with verification fields", () => {
        const base: Finding = {
            severity: "HIGH",
            title: "Test",
            line: 10,
            description: "desc",
            impact: "impact",
            fix: "fix",
        };
        const verified: VerifiedFinding = {
            ...base,
            verified: true,
        };
        expect(verified.verified).toBe(true);
        expect(verified.verifyNote).toBeUndefined();
        expect(verified.originalLine).toBeUndefined();
        expect(verified.originalSeverity).toBeUndefined();
    });

    it("carries all optional verification metadata", () => {
        const verified: VerifiedFinding = {
            severity: "INFO",
            title: "Downgraded",
            line: 39,
            description: "desc",
            impact: "impact",
            fix: "fix",
            verified: false,
            verifyNote: "Line corrected: 100→39",
            originalLine: 100,
            originalSeverity: "HIGH",
        };
        expect(verified.verified).toBe(false);
        expect(verified.originalLine).toBe(100);
        expect(verified.originalSeverity).toBe("HIGH");
    });
});

// ---------------------------------------------------------------------------
// validateFindings
// ---------------------------------------------------------------------------

describe("validateFindings", () => {
    const validFinding = {
        severity: "HIGH",
        title: "Reentrancy",
        line: 15,
        description: "Funds can be drained via reentrancy.",
        impact: "Total loss of funds.",
        fix: "Use checks-effects-interactions pattern.",
    };

    it("parses a valid finding array", () => {
        const raw = JSON.stringify([validFinding]);
        const findings = validateFindings(raw);

        expect(findings).toHaveLength(1);
        expect(findings[0].severity).toBe("HIGH");
        expect(findings[0].title).toBe("Reentrancy");
        expect(findings[0].line).toBe(15);
    });

    it("parses an empty array", () => {
        const findings = validateFindings("[]");
        expect(findings).toHaveLength(0);
    });

    it("accepts null for line", () => {
        const raw = JSON.stringify([{ ...validFinding, line: null }]);
        const findings = validateFindings(raw);
        expect(findings[0].line).toBeNull();
    });

    it("strips markdown code fences", () => {
        const raw = "```json\n" + JSON.stringify([validFinding]) + "\n```";
        const findings = validateFindings(raw);
        expect(findings).toHaveLength(1);
    });

    it("strips plain code fences", () => {
        const raw = "```\n" + JSON.stringify([validFinding]) + "\n```";
        const findings = validateFindings(raw);
        expect(findings).toHaveLength(1);
    });

    it("throws INVALID_RESPONSE for invalid JSON", () => {
        expect(() => validateFindings("not json")).toThrow(ProviderError);
        try {
            validateFindings("not json");
        } catch (e) {
            expect((e as ProviderError).code).toBe("INVALID_RESPONSE");
        }
    });

    it("throws INVALID_RESPONSE when root is not an array", () => {
        expect(() => validateFindings(JSON.stringify({ findings: [] }))).toThrow(ProviderError);
        try {
            validateFindings(JSON.stringify({ findings: [] }));
        } catch (e) {
            expect((e as ProviderError).code).toBe("INVALID_RESPONSE");
        }
    });

    it("throws INVALID_RESPONSE for invalid severity", () => {
        const bad = JSON.stringify([{ ...validFinding, severity: "CRITICAL" }]);
        expect(() => validateFindings(bad)).toThrow(ProviderError);
    });

    it("throws INVALID_RESPONSE for missing title", () => {
        const bad = JSON.stringify([{ ...validFinding, title: "" }]);
        expect(() => validateFindings(bad)).toThrow(ProviderError);
    });

    it("throws INVALID_RESPONSE for non-null, non-number line", () => {
        const bad = JSON.stringify([{ ...validFinding, line: "fifteen" }]);
        expect(() => validateFindings(bad)).toThrow(ProviderError);
    });

    it("accepts all four severity levels", () => {
        for (const severity of ["HIGH", "MEDIUM", "LOW", "INFO"] as const) {
            const raw = JSON.stringify([{ ...validFinding, severity }]);
            const findings = validateFindings(raw);
            expect(findings[0].severity).toBe(severity);
        }
    });

    it("rounds fractional line numbers", () => {
        const raw = JSON.stringify([{ ...validFinding, line: 15.7 }]);
        const findings = validateFindings(raw);
        expect(findings[0].line).toBe(16);
    });
});

// ---------------------------------------------------------------------------
// resolveApiKey
// ---------------------------------------------------------------------------

describe("resolveApiKey", () => {
    beforeEach(() => {
        delete process.env["ANTHROPIC_API_KEY"];
    });

    it("returns config key when set", () => {
        expect(resolveApiKey("sk-from-config")).toBe("sk-from-config");
    });

    it("falls back to env var when config key is empty", () => {
        process.env["ANTHROPIC_API_KEY"] = "sk-from-env";
        expect(resolveApiKey("")).toBe("sk-from-env");
    });

    it("returns empty string when both are missing", () => {
        expect(resolveApiKey("")).toBe("");
    });

    it("trims whitespace from config key", () => {
        expect(resolveApiKey("  sk-trimmed  ")).toBe("sk-trimmed");
    });
});

// ---------------------------------------------------------------------------
// ClaudeProvider constructor
// ---------------------------------------------------------------------------

describe("ClaudeProvider constructor", () => {
    it("throws AUTH_ERROR when api key is empty", () => {
        expect(() => new ClaudeProvider("")).toThrow(ProviderError);
        try {
            new ClaudeProvider("");
        } catch (e) {
            expect((e as ProviderError).code).toBe("AUTH_ERROR");
        }
    });

    it("sets model to provided value", () => {
        const provider = new ClaudeProvider("sk-test", "claude-haiku-3-5-20241022");
        expect(provider.model).toBe("claude-haiku-3-5-20241022");
    });

    it("uses default model when not specified", () => {
        const provider = new ClaudeProvider("sk-test");
        expect(provider.model).toContain("claude");
    });

    it("name is 'claude'", () => {
        const provider = new ClaudeProvider("sk-test");
        expect(provider.name).toBe("claude");
    });
});

// ---------------------------------------------------------------------------
// ClaudeProvider.scan — mocked
// ---------------------------------------------------------------------------

describe("ClaudeProvider.scan (mocked)", () => {
    const validFinding = {
        severity: "HIGH",
        title: "Reentrancy",
        line: 15,
        description: "Reentrancy vulnerability.",
        impact: "Loss of funds.",
        fix: "Use CEI pattern.",
    };

    it("returns parsed findings on success", async () => {
        const provider = new ClaudeProvider("sk-test");

        // Mock the internal Anthropic client
        vi.spyOn(provider["client"].messages, "create").mockResolvedValue({
            content: [{ type: "text", text: JSON.stringify([validFinding]) }],
            id: "msg_test",
            model: "claude-sonnet-4-20250514",
            role: "assistant",
            stop_reason: "end_turn",
            stop_sequence: null,
            type: "message",
            usage: { input_tokens: 100, output_tokens: 50 },
        } as never);

        const result = await provider.scan("system prompt", "user prompt");

        expect(result.findings).toHaveLength(1);
        expect(result.findings[0].severity).toBe("HIGH");
        expect(result.provider).toBe("claude");
        expect(result.model).toContain("claude");
    });

    it("throws RATE_LIMIT on HTTP 429", async () => {
        const provider = new ClaudeProvider("sk-test");
        vi.spyOn(provider["client"].messages, "create").mockRejectedValue({
            status: 429,
            message: "Too Many Requests",
        });

        await expect(provider.scan("sys", "usr")).rejects.toThrow(ProviderError);
        try {
            await provider.scan("sys", "usr");
        } catch (e) {
            expect((e as ProviderError).code).toBe("RATE_LIMIT");
        }
    });

    it("throws AUTH_ERROR on HTTP 401", async () => {
        const provider = new ClaudeProvider("sk-test");
        vi.spyOn(provider["client"].messages, "create").mockRejectedValue({
            status: 401,
            message: "Unauthorized",
        });

        await expect(provider.scan("sys", "usr")).rejects.toThrow(ProviderError);
        try {
            await provider.scan("sys", "usr");
        } catch (e) {
            expect((e as ProviderError).code).toBe("AUTH_ERROR");
        }
    });

    it("throws INVALID_RESPONSE when LLM returns no text content", async () => {
        const provider = new ClaudeProvider("sk-test");
        vi.spyOn(provider["client"].messages, "create").mockResolvedValue({
            content: [],
            id: "msg_test",
            model: "claude-sonnet-4-20250514",
            role: "assistant",
            stop_reason: "end_turn",
            stop_sequence: null,
            type: "message",
            usage: { input_tokens: 10, output_tokens: 0 },
        } as never);

        await expect(provider.scan("sys", "usr")).rejects.toThrow(ProviderError);
    });

    it("throws INVALID_RESPONSE when LLM returns bad JSON", async () => {
        const provider = new ClaudeProvider("sk-test");
        vi.spyOn(provider["client"].messages, "create").mockResolvedValue({
            content: [{ type: "text", text: "I cannot analyze this." }],
            id: "msg_test",
            model: "claude-sonnet-4-20250514",
            role: "assistant",
            stop_reason: "end_turn",
            stop_sequence: null,
            type: "message",
            usage: { input_tokens: 10, output_tokens: 5 },
        } as never);

        await expect(provider.scan("sys", "usr")).rejects.toThrow(ProviderError);
    });
});

// ---------------------------------------------------------------------------
// ClaudeProvider.rawCall — mocked
// ---------------------------------------------------------------------------

describe("ClaudeProvider.rawCall (mocked)", () => {
    it("returns raw text without validation", async () => {
        const provider = new ClaudeProvider("sk-test");
        vi.spyOn(provider["client"].messages, "create").mockResolvedValue({
            content: [{ type: "text", text: "raw response text" }],
            id: "msg_test",
            model: "claude-sonnet-4-20250514",
            role: "assistant",
            stop_reason: "end_turn",
            stop_sequence: null,
            type: "message",
            usage: { input_tokens: 100, output_tokens: 50 },
        } as never);

        const result = await provider.rawCall("system", "user");
        expect(result).toBe("raw response text");
    });

    it("does not throw on non-JSON response", async () => {
        const provider = new ClaudeProvider("sk-test");
        vi.spyOn(provider["client"].messages, "create").mockResolvedValue({
            content: [{ type: "text", text: "This is not JSON at all." }],
            id: "msg_test",
            model: "claude-sonnet-4-20250514",
            role: "assistant",
            stop_reason: "end_turn",
            stop_sequence: null,
            type: "message",
            usage: { input_tokens: 10, output_tokens: 5 },
        } as never);

        // rawCall should NOT validate — just return raw text
        const result = await provider.rawCall("sys", "usr");
        expect(result).toBe("This is not JSON at all.");
    });

    it("throws ProviderError on API failure", async () => {
        const provider = new ClaudeProvider("sk-test");
        vi.spyOn(provider["client"].messages, "create").mockRejectedValue({
            status: 429,
            message: "Too Many Requests",
        });

        await expect(provider.rawCall("sys", "usr")).rejects.toThrow(ProviderError);
    });
});
