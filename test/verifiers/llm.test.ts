import { describe, it, expect, vi } from "vitest";
import { applyVerdict, parseVerifyResponse } from "../../src/verifiers/llm.js";
import type { VerifiedFinding } from "../../src/providers/base.js";

// ---------------------------------------------------------------------------
// parseVerifyResponse
// ---------------------------------------------------------------------------

describe("parseVerifyResponse", () => {
    it("parses valid verify results", () => {
        const raw = JSON.stringify([{
            finding_title: "Test",
            verdict: "confirmed",
            reason: "Vulnerability is real",
        }]);
        const results = parseVerifyResponse(raw);
        expect(results).toHaveLength(1);
        expect(results[0].verdict).toBe("confirmed");
    });

    it("strips markdown fences", () => {
        const raw = "```json\n" + JSON.stringify([{
            finding_title: "Test",
            verdict: "rejected",
            reason: "False positive",
        }]) + "\n```";
        const results = parseVerifyResponse(raw);
        expect(results[0].verdict).toBe("rejected");
    });

    it("throws on invalid JSON", () => {
        expect(() => parseVerifyResponse("not json")).toThrow();
    });

    it("throws on invalid verdict value", () => {
        const raw = JSON.stringify([{
            finding_title: "Test",
            verdict: "maybe",
            reason: "Unsure",
        }]);
        expect(() => parseVerifyResponse(raw)).toThrow();
    });
});

// ---------------------------------------------------------------------------
// applyVerdict
// ---------------------------------------------------------------------------

describe("applyVerdict", () => {
    const baseFinding: VerifiedFinding = {
        severity: "HIGH",
        title: "Test Finding",
        line: 10,
        description: "desc",
        impact: "impact",
        fix: "fix",
        verified: true,
    };

    it("keeps finding unchanged on confirmed", () => {
        const result = applyVerdict(baseFinding, {
            finding_title: "Test Finding",
            verdict: "confirmed",
            reason: "Looks correct",
        });
        expect(result.verified).toBe(true);
        expect(result.severity).toBe("HIGH");
        expect(result.verifyNote).toBeUndefined();
    });

    it("marks as unverified and downgrades on suspicious with suggested_severity", () => {
        const result = applyVerdict(baseFinding, {
            finding_title: "Test Finding",
            verdict: "suspicious",
            reason: "Attack scenario unlikely",
            suggested_severity: "LOW",
        });
        expect(result.verified).toBe(false);
        expect(result.severity).toBe("LOW");
        expect(result.originalSeverity).toBe("HIGH");
        expect(result.verifyNote).toContain("Attack scenario unlikely");
    });

    it("marks as unverified on suspicious without severity change", () => {
        const result = applyVerdict(baseFinding, {
            finding_title: "Test Finding",
            verdict: "suspicious",
            reason: "Needs manual review",
        });
        expect(result.verified).toBe(false);
        expect(result.severity).toBe("HIGH");
        expect(result.originalSeverity).toBeUndefined();
    });

    it("downgrades to INFO on rejected", () => {
        const result = applyVerdict(baseFinding, {
            finding_title: "Test Finding",
            verdict: "rejected",
            reason: "Contract is stateless",
        });
        expect(result.verified).toBe(false);
        expect(result.severity).toBe("INFO");
        expect(result.originalSeverity).toBe("HIGH");
        expect(result.verifyNote).toContain("Contract is stateless");
    });
});
