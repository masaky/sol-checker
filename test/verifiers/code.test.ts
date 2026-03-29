import { describe, it, expect } from "vitest";
import { verifyByCode, extractFunctionName } from "../../src/verifiers/code.js";
import type { Finding } from "../../src/providers/base.js";

// ---------------------------------------------------------------------------
// extractFunctionName
// ---------------------------------------------------------------------------

describe("extractFunctionName", () => {
    it("extracts camelCase function name from title", () => {
        expect(extractFunctionName("Missing Access Control on setRecord")).toBe("setRecord");
    });

    it("extracts function name with numbers", () => {
        expect(extractFunctionName("msg.value validation in aggregate3Value")).toBe("aggregate3Value");
    });

    it("extracts from snake_case context", () => {
        expect(extractFunctionName("Issue in set_owner function")).toBe("set_owner");
    });

    it("returns null when no function name found", () => {
        expect(extractFunctionName("General reentrancy risk")).toBeNull();
    });

    it("extracts from description as fallback", () => {
        expect(extractFunctionName(
            "General issue",
            "The setResolver function emits an event"
        )).toBe("setResolver");
    });
});

// ---------------------------------------------------------------------------
// verifyByCode — line range check
// ---------------------------------------------------------------------------

const SOURCE_LINES = [
    "// SPDX-License-Identifier: MIT",            // 1
    "pragma solidity ^0.8.0;",                      // 2
    "",                                              // 3
    "contract Example {",                            // 4
    "    address public owner;",                     // 5
    "",                                              // 6
    "    modifier onlyOwner() {",                    // 7
    '        require(msg.sender == owner, "No");',   // 8
    "        _;",                                    // 9
    "    }",                                         // 10
    "",                                              // 11
    "    function setOwner(address _owner) public {", // 12
    "        owner = _owner;",                        // 13
    "    }",                                          // 14
    "",                                              // 15
    "    function getOwner() public view returns (address) {", // 16
    "        return owner;",                          // 17
    "    }",                                          // 18
    "}",                                              // 19
];

describe("verifyByCode", () => {
    it("marks finding as verified when line and function match", () => {
        const findings: Finding[] = [{
            severity: "HIGH",
            title: "Missing modifier on setOwner",
            line: 12,
            description: "setOwner lacks onlyOwner modifier",
            impact: "Anyone can change owner",
            fix: "Add onlyOwner",
        }];
        const result = verifyByCode(findings, SOURCE_LINES);
        expect(result[0].verified).toBe(true);
    });

    it("flags finding when line is out of range", () => {
        const findings: Finding[] = [{
            severity: "HIGH",
            title: "Issue in setOwner",
            line: 999,
            description: "desc",
            impact: "impact",
            fix: "fix",
        }];
        const result = verifyByCode(findings, SOURCE_LINES);
        expect(result[0].verified).toBe(false);
        expect(result[0].verifyNote).toContain("out of range");
    });

    it("corrects line number when function found elsewhere", () => {
        const findings: Finding[] = [{
            severity: "LOW",
            title: "Issue in getOwner",
            line: 5,
            description: "getOwner returns wrong value",
            impact: "impact",
            fix: "fix",
        }];
        const result = verifyByCode(findings, SOURCE_LINES);
        expect(result[0].verified).toBe(true);
        expect(result[0].line).toBe(16);
        expect(result[0].originalLine).toBe(5);
        expect(result[0].verifyNote).toContain("corrected");
    });

    it("passes through findings with null line", () => {
        const findings: Finding[] = [{
            severity: "INFO",
            title: "General observation",
            line: null,
            description: "desc",
            impact: "impact",
            fix: "fix",
        }];
        const result = verifyByCode(findings, SOURCE_LINES);
        expect(result[0].verified).toBe(true);
    });

    it("detects modifier that actually exists (false claim of missing)", () => {
        const sourceWithModifier = [
            "contract X {",                                            // 1
            "    modifier authorised(bytes32 node) { _; }",            // 2
            "",                                                         // 3
            "    function setRecord(bytes32 node) external authorised(node) {", // 4
            "        // body",                                          // 5
            "    }",                                                    // 6
            "}",                                                        // 7
        ];
        const findings: Finding[] = [{
            severity: "MEDIUM",
            title: "Missing Access Control on setRecord",
            line: 4,
            description: "The setRecord function lacks the authorised modifier",
            impact: "Unauthorized access",
            fix: "Add authorised modifier",
        }];
        const result = verifyByCode(findings, sourceWithModifier);
        expect(result[0].verified).toBe(false);
        expect(result[0].verifyNote).toContain("modifier");
    });

    it("uses default tolerance of 10 lines", () => {
        const findings: Finding[] = [{
            severity: "LOW",
            title: "Issue in setOwner",
            line: 3,
            description: "desc",
            impact: "impact",
            fix: "fix",
        }];
        const result = verifyByCode(findings, SOURCE_LINES);
        // setOwner is at line 12, tolerance=10, so line 3 is within range (|12-3|=9)
        expect(result[0].verified).toBe(true);
        expect(result[0].line).toBe(12);
        expect(result[0].originalLine).toBe(3);
    });
});
