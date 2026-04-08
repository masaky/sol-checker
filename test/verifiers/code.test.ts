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

describe("extractFunctionName — acronym handling", () => {
    it("rejects standalone acronyms ending with 4+ uppercase (zkSNARK)", () => {
        expect(extractFunctionName(
            "External verifier trust boundary risk",
            "The contract relies on an external verifier to validate zkSNARK proofs",
        )).toBeNull();
    });

    it("allows function names with short uppercase runs (tokenURI)", () => {
        expect(extractFunctionName("Issue in tokenURI")).toBe("tokenURI");
    });

    it("allows function names with mid-word acronyms (verifyECDSAProof)", () => {
        expect(extractFunctionName("Issue in verifyECDSAProof")).toBe("verifyECDSAProof");
    });

    it("allows function names with mid-word acronyms (setSNARKVerifier)", () => {
        expect(extractFunctionName("Issue in setSNARKVerifier")).toBe("setSNARKVerifier");
    });

    it("rejects terms ending in long acronym suffix (dBFTConsensus → wait, ends lowercase)", () => {
        // dBFTConsensus: has "BFTC" which is 4 consecutive uppercase but NOT at end → should pass
        // This is actually a legitimate-looking function name pattern
        expect(extractFunctionName("Issue in dBFTConsensus")).toBe("dBFTConsensus");
    });
});

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

    it("ignores natural language noise words before 'contract'", () => {
        // "The contract uses..." should NOT extract "The" as a contract name
        expect(extractDeclarationName(
            "Solidity version constraints",
            "The contract uses Solidity ^0.7.0 which lacks built-in overflow protection",
        )).toBeNull();
    });

    it("ignores 'This contract' as a declaration name", () => {
        expect(extractDeclarationName(
            "Missing validation",
            "This contract prevents reentrancy using a mutex lock",
        )).toBeNull();
    });

    it("still extracts real names after noise words", () => {
        // "The Tornado contract" → should extract "Tornado"
        const result = extractDeclarationName(
            "Issue found",
            "The Tornado contract has a vulnerability",
        );
        expect(result).toEqual({ type: "contract", name: "Tornado" });
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

// ---------------------------------------------------------------------------
// Regression: Tornado Cash finding text (real-world false extraction)
// ---------------------------------------------------------------------------

describe("verifyByCode — Tornado Cash regression", () => {
    const TORNADO_LINES = [
        "pragma solidity ^0.7.0;",                           // 1
        "interface IVerifier {",                              // 2
        "  function verifyProof(bytes memory, uint256[6] memory) external returns (bool);", // 3
        "}",                                                  // 4
        "abstract contract Tornado {",                        // 5
        "  IVerifier public immutable verifier;",             // 6
        "  function withdraw(",                               // 7
        "    bytes calldata _proof,",                          // 8
        "    bytes32 _root",                                   // 9
        "  ) external payable {",                              // 10
        '    require(_fee <= denomination, "Fee exceeds");',   // 11
        "    verifier.verifyProof(_proof, [uint256(_root)]);", // 12
        "  }",                                                 // 13
        "}",                                                   // 14
    ];

    it("does not extract 'zkSNARK' as function name from description", () => {
        const findings: Finding[] = [{
            severity: "MEDIUM",
            title: "External verifier trust boundary risk",
            line: 12,
            description: "The contract relies on an external verifier contract to validate zkSNARK proofs.",
            impact: "Compromised verifier could allow fake proofs",
            fix: "Implement additional verification layers",
        }];
        const result = verifyByCode(findings, TORNADO_LINES);
        // No function name extracted → finding stays verified with no error note
        expect(result[0].verified).toBe(true);
        expect(result[0].verifyNote).toBeUndefined();
    });

    it("does not extract 'The' as declaration name from description", () => {
        const findings: Finding[] = [{
            severity: "INFO",
            title: "Solidity version constraints for security",
            line: 1,
            description: "The contract uses Solidity ^0.7.0 which lacks built-in overflow protection.",
            impact: "Missing overflow protection",
            fix: "Upgrade to 0.8.x",
        }];
        const result = verifyByCode(findings, TORNADO_LINES);
        // "The" should not be extracted as a declaration name
        expect(result[0].verified).toBe(true);
        expect(result[0].verifyNote).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// NatSpec over-correction prevention
// ---------------------------------------------------------------------------

const NATSPEC_SOURCE = [
    "// SPDX-License-Identifier: MIT",                   // 1
    "pragma solidity ^0.8.0;",                            // 2
    "",                                                    // 3
    "contract Seaport {",                                  // 4
    "",                                                    // 5
    "    /**",                                             // 6
    "     * @notice Get status. Note that this function",  // 7
    "     *         is susceptible to view reentrancy.",   // 8
    "     * @param orderHash The hash.",                   // 9
    "     * @return isValidated Whether validated.",       // 10
    "     */",                                            // 11
    "    function getOrderStatus(",                       // 12
    "        bytes32 orderHash",                          // 13
    "    ) external view returns (bool isValidated) {",   // 14
    "        return _getOrderStatus(orderHash);",         // 15
    "    }",                                              // 16
    "",                                                    // 17
    "    /// @notice Get nonce. Susceptible to view reentrancy.", // 18
    "    function getContractOffererNonce(",               // 19
    "        address contractOfferer",                     // 20
    "    ) external view returns (uint256 nonce) {",      // 21
    "        nonce = _contractNonces[contractOfferer];",   // 22
    "    }",                                              // 23
    "",                                                    // 24
    "    function unrelatedFunction() public {",          // 25
    "        // no NatSpec above",                        // 26
    "    }",                                              // 27
    "",                                                    // 28
    "    /*",                                              // 29
    "     * This is a regular block comment,",             // 30
    "     * NOT NatSpec.",                                  // 31
    "     */",                                            // 32
    "    function regularComment() public {",             // 33
    "        // non-doc comment above",                   // 34
    "    }",                                              // 35
    "",                                                    // 36
    "    /**",                                             // 37
    "     * @notice Detached NatSpec.",                    // 38
    "     */",                                            // 39
    "",                                                    // 40  blank line gap
    "    function detachedDoc() public {",                // 41
    "        // blank line between NatSpec and function",  // 42
    "    }",                                              // 43
    "}",                                                   // 44
];

describe("NatSpec over-correction prevention", () => {
    it("skips correction when reported line is in NatSpec above function (block comment)", () => {
        const findings: Finding[] = [{
            severity: "INFO",
            title: "View reentrancy in getOrderStatus",
            line: 8, // NatSpec comment line
            description: "getOrderStatus is susceptible to view reentrancy",
            impact: "Stale data",
            fix: "No fix required",
        }];
        const result = verifyByCode(findings, NATSPEC_SOURCE);
        expect(result[0].verified).toBe(true);
        expect(result[0].line).toBe(8); // kept as-is, not corrected to 12
        expect(result[0].originalLine).toBeUndefined();
    });

    it("skips correction when reported line is in NatSpec above function (triple-slash)", () => {
        const findings: Finding[] = [{
            severity: "INFO",
            title: "View reentrancy in getContractOffererNonce",
            line: 18, // /// comment line
            description: "getContractOffererNonce is susceptible to view reentrancy",
            impact: "Stale data",
            fix: "No fix required",
        }];
        const result = verifyByCode(findings, NATSPEC_SOURCE);
        expect(result[0].verified).toBe(true);
        expect(result[0].line).toBe(18); // kept as-is, not corrected to 19
        expect(result[0].originalLine).toBeUndefined();
    });

    it("still corrects when reported line is NOT in NatSpec above function", () => {
        const findings: Finding[] = [{
            severity: "LOW",
            title: "Issue in unrelatedFunction",
            line: 5, // empty line, not NatSpec above line 25
            description: "unrelatedFunction has an issue",
            impact: "impact",
            fix: "fix",
        }];
        const result = verifyByCode(findings, NATSPEC_SOURCE);
        expect(result[0].verified).toBe(true);
        expect(result[0].line).toBe(25); // corrected
        expect(result[0].originalLine).toBe(5);
    });

    it("still corrects when reported line is in a regular /* */ block comment (not NatSpec)", () => {
        const findings: Finding[] = [{
            severity: "LOW",
            title: "Issue in regularComment",
            line: 30, // interior of regular /* */ comment
            description: "regularComment has an issue",
            impact: "impact",
            fix: "fix",
        }];
        const result = verifyByCode(findings, NATSPEC_SOURCE);
        expect(result[0].verified).toBe(true);
        expect(result[0].line).toBe(33); // corrected to function declaration
        expect(result[0].originalLine).toBe(30);
    });

    it("still corrects when blank line separates NatSpec from function declaration", () => {
        const findings: Finding[] = [{
            severity: "INFO",
            title: "Issue in detachedDoc",
            line: 38, // NatSpec content, but blank line at 40 before function at 41
            description: "detachedDoc has a detached doc comment",
            impact: "impact",
            fix: "fix",
        }];
        const result = verifyByCode(findings, NATSPEC_SOURCE);
        expect(result[0].verified).toBe(true);
        expect(result[0].line).toBe(41); // corrected — blank line breaks adjacency
        expect(result[0].originalLine).toBe(38);
    });

    it("preserves closing */ line when it is part of NatSpec directly above function", () => {
        const findings: Finding[] = [{
            severity: "INFO",
            title: "View reentrancy in getOrderStatus",
            line: 11, // closing */ line of NatSpec block
            description: "getOrderStatus is susceptible to view reentrancy",
            impact: "Stale data",
            fix: "No fix required",
        }];
        const result = verifyByCode(findings, NATSPEC_SOURCE);
        expect(result[0].verified).toBe(true);
        expect(result[0].line).toBe(11); // kept — closing line of NatSpec directly above
        expect(result[0].originalLine).toBeUndefined();
    });

    it("preserves NatSpec opener line (/**)", () => {
        const findings: Finding[] = [{
            severity: "INFO",
            title: "View reentrancy in getOrderStatus",
            line: 6, // /** opener line
            description: "getOrderStatus is susceptible to view reentrancy",
            impact: "Stale data",
            fix: "No fix required",
        }];
        const result = verifyByCode(findings, NATSPEC_SOURCE);
        expect(result[0].verified).toBe(true);
        expect(result[0].line).toBe(6); // kept — opener of NatSpec block
        expect(result[0].originalLine).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// Parent contract state variable (identifier usage fallback)
// ---------------------------------------------------------------------------

describe("verifyByCode — parent contract state variable", () => {
    // Simulates EigenLayer StrategyManager: specialAdmin is a state variable
    // used early in the file (L6) but the finding reports a line far away (L40).
    // No function declaration for "specialAdmin" exists, and it's too far from
    // L40 to be caught by isFunctionNearLine (tolerance=10).
    const PARENT_VAR_SOURCE: string[] = [];
    // Build a 50-line source where specialAdmin appears only at line 6
    for (let i = 0; i < 50; i++) PARENT_VAR_SOURCE.push("    // filler line");
    PARENT_VAR_SOURCE[0] = "// SPDX-License-Identifier: MIT";
    PARENT_VAR_SOURCE[1] = "pragma solidity ^0.8.0;";
    PARENT_VAR_SOURCE[3] = "contract Manager is ManagerStorage {";
    PARENT_VAR_SOURCE[4] = "    modifier onlySpecialAdmin() {";
    PARENT_VAR_SOURCE[5] = '        require(msg.sender == specialAdmin, "!");';
    PARENT_VAR_SOURCE[6] = "        _;";
    PARENT_VAR_SOURCE[7] = "    }";
    // Lines 30-40: a function far from the variable usage
    PARENT_VAR_SOURCE[38] = "    function doSomething() external {";
    PARENT_VAR_SOURCE[39] = "        // reported line 40 — nothing relevant here";
    PARENT_VAR_SOURCE[40] = "    }";

    it("marks verified when identifier is used in file but not declared (parent contract variable)", () => {
        const findings: Finding[] = [{
            severity: "MEDIUM",
            title: "Governance Centralization Risk - specialAdmin Role",
            line: 40,
            description: "The specialAdmin can instantly change settings",
            impact: "Compromised specialAdmin can manipulate options",
            fix: "Implement timelock",
        }];
        const result = verifyByCode(findings, PARENT_VAR_SOURCE);
        expect(result[0].verified).toBe(true);
        expect(result[0].verifyNote).toBeDefined();
        expect(result[0].verifyNote!).toContain("not declared in this file but referenced");
        expect(result[0].verifyNote!).toContain("parent contract");
    });

    it("still marks unverified when identifier is truly absent", () => {
        const findings: Finding[] = [{
            severity: "MEDIUM",
            title: "Issue with nonExistentVar",
            line: 40,
            description: "The nonExistentVar can be exploited",
            impact: "Loss of funds",
            fix: "Add validation",
        }];
        const result = verifyByCode(findings, PARENT_VAR_SOURCE);
        expect(result[0].verified).toBe(false);
        expect(result[0].verifyNote).toContain("not found near line");
    });
});
