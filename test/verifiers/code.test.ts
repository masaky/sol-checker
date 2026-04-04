import { describe, it, expect } from "vitest";
import { verifyByCode, extractFunctionName, extractDeclarationName } from "../../src/verifiers/code.js";
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

    it("returns verified true when no function name can be extracted from title", () => {
        const findings: Finding[] = [{
            severity: "HIGH",
            title: "General reentrancy risk",
            line: 5,
            description: "desc",
            impact: "impact",
            fix: "fix",
        }];
        const result = verifyByCode(findings, SOURCE_LINES);
        expect(result[0].verified).toBe(true);
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

// ---------------------------------------------------------------------------
// extractDeclarationName
// ---------------------------------------------------------------------------

describe("extractDeclarationName", () => {
    it("extracts contract name from description (Solidity order)", () => {
        const result = extractDeclarationName(
            "Empty Implementation",
            "The Permit2 contract is empty",
        );
        expect(result).toEqual({ type: "contract", name: "Permit2" });
    });

    it("extracts contract name from title (natural language order)", () => {
        const result = extractDeclarationName("Permit2 contract is empty");
        expect(result).toEqual({ type: "contract", name: "Permit2" });
    });

    it("extracts interface name", () => {
        const result = extractDeclarationName(
            "Missing methods",
            "interface IERC20 does not implement all methods",
        );
        expect(result).toEqual({ type: "interface", name: "IERC20" });
    });

    it("extracts library name", () => {
        const result = extractDeclarationName(
            "SafeMath library overflow",
        );
        expect(result).toEqual({ type: "library", name: "SafeMath" });
    });

    it("extracts abstract contract name", () => {
        const result = extractDeclarationName(
            "Issue found",
            "abstract contract Ownable has no constructor",
        );
        expect(result).toEqual({ type: "abstract contract", name: "Ownable" });
    });

    it("returns null when no declaration found", () => {
        expect(extractDeclarationName("General reentrancy risk")).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// verifyByCode — contract declaration line correction
// ---------------------------------------------------------------------------

describe("verifyByCode — declaration line correction", () => {
    const PERMIT2_LINES = [
        "// SPDX-License-Identifier: MIT",                                  // 1
        "pragma solidity 0.8.17;",                                           // 2
        "",                                                                   // 3
        'import {SignatureTransfer} from "./SignatureTransfer.sol";',        // 4
        'import {AllowanceTransfer} from "./AllowanceTransfer.sol";',        // 5
        "",                                                                   // 6
        "/// @notice Permit2 handles signature-based transfers.",            // 7
        "/// @dev Users must approve Permit2 before calling.",               // 8
        "contract Permit2 is SignatureTransfer, AllowanceTransfer {",        // 9
        "// Permit2 unifies the two contracts.",                             // 10
        "}",                                                                  // 11
        "",                                                                   // 12
    ];

    it("corrects line number for contract declaration", () => {
        const findings: Finding[] = [{
            severity: "INFO",
            title: "Empty Contract Implementation",
            line: 11,
            description: "The Permit2 contract is empty and only serves as a unification layer.",
            impact: "No direct security impact",
            fix: "Intentional design",
        }];
        const result = verifyByCode(findings, PERMIT2_LINES);
        expect(result[0].verified).toBe(true);
        expect(result[0].line).toBe(9);
        expect(result[0].originalLine).toBe(11);
        expect(result[0].verifyNote).toContain("corrected");
    });

    it("keeps correct line number unchanged for contract declaration", () => {
        const findings: Finding[] = [{
            severity: "INFO",
            title: "Empty Contract Implementation",
            line: 9,
            description: "The Permit2 contract is empty.",
            impact: "No impact",
            fix: "Intentional",
        }];
        const result = verifyByCode(findings, PERMIT2_LINES);
        expect(result[0].verified).toBe(true);
        expect(result[0].line).toBe(9);
        expect(result[0].originalLine).toBeUndefined();
    });

    it("flags finding when contract name not found in source", () => {
        const findings: Finding[] = [{
            severity: "INFO",
            title: "Empty Contract Implementation",
            line: 5,
            description: "The NonExistent contract is empty.",
            impact: "No impact",
            fix: "fix",
        }];
        const result = verifyByCode(findings, PERMIT2_LINES);
        expect(result[0].verified).toBe(false);
        expect(result[0].verifyNote).toContain("NonExistent");
    });
});

// ---------------------------------------------------------------------------
// verifyByCode — Vyper support
// ---------------------------------------------------------------------------

const VYPER_SOURCE_LINES = [
    "# @version 0.2.4",                                    // 1
    "",                                                      // 2
    "@view",                                                 // 3
    "@internal",                                             // 4
    "def get_D(xp: uint256[3], amp: uint256) -> uint256:",  // 5
    "    S: uint256 = 0",                                    // 6
    "    return S",                                           // 7
    "",                                                      // 8
    "@external",                                             // 9
    "@nonreentrant('lock')",                                 // 10
    "def add_liquidity(amounts: uint256[3], min_mint: uint256):", // 11
    "    pass",                                              // 12
    "",                                                      // 13
    "@external",                                             // 14
    "def kill_me():",                                        // 15
    "    assert msg.sender == self.owner",                   // 16
    "",                                                      // 17
];

describe("verifyByCode — Vyper function detection", () => {
    it("finds Vyper function at correct line", () => {
        const findings: Finding[] = [{
            severity: "MEDIUM",
            title: "Division by Zero in get_D",
            line: 5,
            description: "get_D divides by zero when balance is zero",
            impact: "DoS",
            fix: "Add zero check",
        }];
        const result = verifyByCode(findings, VYPER_SOURCE_LINES);
        expect(result[0].verified).toBe(true);
        expect(result[0].line).toBe(5);
    });

    it("corrects line when Vyper function is at a different location", () => {
        const findings: Finding[] = [{
            severity: "MEDIUM",
            title: "Issue in add_liquidity",
            line: 1,
            description: "add_liquidity has a bug",
            impact: "impact",
            fix: "fix",
        }];
        const result = verifyByCode(findings, VYPER_SOURCE_LINES);
        expect(result[0].verified).toBe(true);
        expect(result[0].line).toBe(11);
        expect(result[0].originalLine).toBe(1);
    });

    it("flags finding when Vyper function not found in source", () => {
        const findings: Finding[] = [{
            severity: "HIGH",
            title: "Bug in nonExistentFunc",
            line: 5,
            description: "nonExistentFunc is broken",
            impact: "impact",
            fix: "fix",
        }];
        const result = verifyByCode(findings, VYPER_SOURCE_LINES);
        expect(result[0].verified).toBe(false);
        expect(result[0].verifyNote).toContain("nonExistentFunc");
    });

    it("detects Vyper decorator as modifier (nonreentrant on add_liquidity)", () => {
        const findings: Finding[] = [{
            severity: "HIGH",
            title: "Reentrancy in add_liquidity",
            line: 11,
            description: "add_liquidity lacks the nonreentrant modifier",
            impact: "Reentrancy attack",
            fix: "Add nonreentrant",
        }];
        const result = verifyByCode(findings, VYPER_SOURCE_LINES);
        expect(result[0].verified).toBe(false);
        expect(result[0].verifyNote).toContain("nonreentrant");
    });

    it("confirms missing modifier when Vyper function has no decorator", () => {
        const findings: Finding[] = [{
            severity: "MEDIUM",
            title: "Missing guard on kill_me",
            line: 15,
            description: "kill_me lacks the nonreentrant modifier",
            impact: "Unprotected",
            fix: "Add nonreentrant",
        }];
        const result = verifyByCode(findings, VYPER_SOURCE_LINES);
        // kill_me has no @nonreentrant, so this finding should stay verified
        expect(result[0].verified).toBe(true);
    });
});
