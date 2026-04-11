import { describe, it, expect } from "vitest";
import { formatJson } from "../src/reporter.js";
import type { ScanResult } from "../src/providers/base.js";

describe("formatJson", () => {
  it("returns valid JSON with correct structure", () => {
    const result: ScanResult = {
      findings: [
        {
          severity: "MEDIUM",
          title: "Missing zero-address check",
          line: 98,
          description: "No zero-address validation in constructor",
          impact: "Contract could be bricked",
          fix: "Add require(address(provider) != address(0))",
        },
      ],
      rawResponse: "...",
      model: "claude-sonnet-4-20250514",
      provider: "claude",
    };

    const json = formatJson(result, "contracts/test.sol");
    const parsed = JSON.parse(json);

    expect(parsed.file).toBe("contracts/test.sol");
    expect(parsed.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(parsed.provider).toBe("claude");
    expect(parsed.model).toBe("claude-sonnet-4-20250514");
    expect(parsed.summary).toEqual({ HIGH: 0, MEDIUM: 1, LOW: 0, INFO: 0 });
    expect(parsed.findings).toHaveLength(1);
    expect(parsed.findings[0].severity).toBe("MEDIUM");
    expect(parsed.findings[0].title).toBe("Missing zero-address check");
    expect(parsed.findings[0].line).toBe(98);
    expect(parsed.findings[0].verified).toBeUndefined();
  });

  it("includes verification data when present", () => {
    const result: ScanResult = {
      findings: [
        {
          severity: "LOW",
          title: "Test finding",
          line: 10,
          description: "desc",
          impact: "impact",
          fix: "fix",
          verified: true,
          verifyNote: "confirmed",
          originalLine: 12,
        } as any,
      ],
      rawResponse: "...",
      model: "claude-sonnet-4-20250514",
      provider: "claude",
    };

    const parsed = JSON.parse(formatJson(result, "test.sol"));
    expect(parsed.findings[0].verified).toBe(true);
    expect(parsed.findings[0].verifyNote).toBe("confirmed");
    expect(parsed.findings[0].originalLine).toBe(12);
  });

  it("returns empty findings array when no vulnerabilities", () => {
    const result: ScanResult = {
      findings: [],
      rawResponse: "...",
      model: "claude-sonnet-4-20250514",
      provider: "claude",
    };

    const parsed = JSON.parse(formatJson(result, "clean.sol"));
    expect(parsed.findings).toEqual([]);
    expect(parsed.summary).toEqual({ HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 });
  });
});
