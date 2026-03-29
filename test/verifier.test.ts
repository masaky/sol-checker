import { describe, it, expect, vi } from "vitest";
import { verify } from "../src/verifier.js";
import type { Finding, LLMProvider, ScanResult } from "../src/providers/base.js";

const SOURCE = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
contract Example {
    function setOwner(address _owner) public {
        // body
    }
}`;

const FINDINGS: Finding[] = [{
    severity: "HIGH",
    title: "Issue in setOwner",
    line: 4,
    description: "setOwner has no access control",
    impact: "Anyone can change owner",
    fix: "Add onlyOwner modifier",
}];

describe("verify", () => {
    it("runs Stage 1 only when LLM provider is not given", async () => {
        const result = await verify(FINDINGS, SOURCE, { skipLLM: true });
        expect(result).toHaveLength(1);
        expect(result[0].verified).toBe(true);
    });

    it("skips verification entirely when disabled", async () => {
        const result = await verify(FINDINGS, SOURCE, { enabled: false });
        expect(result).toHaveLength(1);
        expect(result[0].verified).toBe(true);
        expect(result[0].verifyNote).toBeUndefined();
    });

    it("flags out-of-range line in Stage 1", async () => {
        const badFindings: Finding[] = [{
            severity: "HIGH",
            title: "Issue in setOwner",
            line: 999,
            description: "desc",
            impact: "impact",
            fix: "fix",
        }];
        const result = await verify(badFindings, SOURCE, { skipLLM: true });
        expect(result[0].verified).toBe(false);
        expect(result[0].verifyNote).toContain("out of range");
    });
});
