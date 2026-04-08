import type { Finding, VerifiedFinding } from "../providers/base.js";

// Declaration types that we can verify line numbers for
type DeclarationType = "contract" | "interface" | "library" | "abstract contract";

// Patterns that declare a named function in supported languages
const FUNC_DECL_PREFIXES = ["function ", "function\t", "def ", "def\t"] as const;

// ---------------------------------------------------------------------------
// Function name extraction
// ---------------------------------------------------------------------------

const SOLIDITY_KEYWORDS = new Set([
    "function", "contract", "modifier", "event", "mapping", "address",
    "uint256", "uint128", "uint64", "uint32", "uint8", "int256", "bytes32",
    "bytes", "string", "bool", "public", "private", "internal", "external",
    "view", "pure", "payable", "virtual", "override", "returns", "require",
    "emit", "import", "pragma", "solidity", "memory", "storage", "calldata",
    "struct", "enum", "interface", "library", "abstract", "constant",
    "immutable", "indexed", "anonymous", "unchecked", "assembly", "return",
    "delete", "new", "revert", "assert", "this", "super", "true", "false",
]);

// Words that commonly precede "contract" / "interface" / "library" in
// natural-language descriptions but are not Solidity declaration names.
const NATURAL_LANGUAGE_NOISE = new Set([
    "The", "This", "That", "These", "Those",
    "Each", "Every", "Any", "Some", "All", "No",
    "One", "Two", "Most", "Such", "Its",
    "A", "An",
]);

/**
 * Extract a Solidity function name from a finding title or description.
 * Looks for camelCase, snake_case, or digit-containing identifiers that
 * are not Solidity keywords.
 */
export function extractFunctionName(title: string, description?: string): string | null {
    for (const text of [title, description]) {
        if (!text) continue;
        const candidates = text.match(/\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g);
        if (!candidates) continue;
        for (const c of candidates) {
            if (SOLIDITY_KEYWORDS.has(c)) continue;
            if (c.length < 3) continue;
            // Must look like a function name:
            // - camelCase: starts lowercase, contains uppercase (setRecord)
            // - snake_case: contains underscore (set_owner)
            // - digit suffix: starts lowercase, contains digit (aggregate3Value)
            const startsLower = /^[a-z]/.test(c);
            if (startsLower && (/[A-Z]/.test(c) || /\d/.test(c) || c.includes("_"))) {
                // Reject standalone acronyms like "zkSNARK" — words that END
                // with 4+ consecutive uppercase letters are technical terms, not
                // function names. Words like "verifyECDSAProof" where lowercase
                // follows the acronym are legitimate function names and pass.
                if (/[A-Z]{4,}$/.test(c)) continue;
                return c;
            }
        }
    }
    return null;
}

// ---------------------------------------------------------------------------
// Declaration name extraction (contract / interface / library)
// ---------------------------------------------------------------------------

const DECLARATION_KEYWORDS: DeclarationType[] = [
    "abstract contract", "contract", "interface", "library",
];

/**
 * Extract a Solidity contract, interface, or library name from a finding
 * title or description. Used as a fallback when no function name is found.
 */
export function extractDeclarationName(
    title: string,
    description?: string,
): { type: DeclarationType; name: string } | null {
    // Search description first — it typically contains more specific references
    // (e.g. "The Permit2 contract") vs generic titles ("Empty Contract Implementation")
    for (const text of [description, title]) {
        if (!text) continue;
        for (const keyword of DECLARATION_KEYWORDS) {
            // Build a case-insensitive pattern for the keyword itself
            const kwPattern = keyword
                .split("")
                .map((ch) =>
                    /[a-zA-Z]/.test(ch)
                        ? `[${ch.toLowerCase()}${ch.toUpperCase()}]`
                        : ch === " " ? "\\s+" : ch,
                )
                .join("");

            // Pattern 1: "<keyword> <Name>" (Solidity declaration order)
            // Name must be PascalCase (uppercase first letter)
            const declRe = new RegExp(
                `\\b${kwPattern}\\s+([A-Z][a-zA-Z0-9_]*)\\b`,
            );
            const declMatch = text.match(declRe);
            if (declMatch) {
                return { type: keyword, name: declMatch[1] };
            }
            // Pattern 2: "<Name> <keyword>" (natural language order)
            const nlRe = new RegExp(
                `\\b([A-Z][a-zA-Z0-9_]*)\\s+${kwPattern}\\b`,
            );
            const nlMatch = text.match(nlRe);
            if (nlMatch && !NATURAL_LANGUAGE_NOISE.has(nlMatch[1])) {
                return { type: keyword, name: nlMatch[1] };
            }
        }
    }
    return null;
}

function findDeclarationLine(
    sourceLines: string[],
    name: string,
): number | null {
    const re = new RegExp(
        `\\b(?:abstract\\s+)?(?:contract|interface|library)\\s+${name}\\b`,
    );
    for (let i = 0; i < sourceLines.length; i++) {
        if (re.test(sourceLines[i])) {
            return i + 1; // 1-based
        }
    }
    return null;
}

function isDeclarationNearLine(
    sourceLines: string[],
    name: string,
    line: number,
    tolerance: number,
): boolean {
    const start = Math.max(0, line - 1 - tolerance);
    const end = Math.min(sourceLines.length, line - 1 + tolerance + 1);
    const re = new RegExp(`\\b${name}\\b`);
    for (let i = start; i < end; i++) {
        if (re.test(sourceLines[i])) {
            return true;
        }
    }
    return false;
}

// ---------------------------------------------------------------------------
// Missing modifier detection
// ---------------------------------------------------------------------------

const MISSING_MODIFIER_PATTERNS = [
    /lacks?\s+(?:the\s+)?(\w+)\s+modifier/i,
    /missing\s+(?:the\s+)?(\w+)\s+modifier/i,
    /without\s+(?:the\s+)?(\w+)\s+modifier/i,
    /no\s+(\w+)\s+modifier/i,
];

function extractClaimedMissingModifier(description: string): string | null {
    for (const pattern of MISSING_MODIFIER_PATTERNS) {
        const match = description.match(pattern);
        if (match) return match[1];
    }
    return null;
}

function hasModifierOnFunction(
    sourceLines: string[],
    funcName: string,
    modifierName: string,
    lineIndex: number,
    tolerance: number,
): boolean {
    const start = Math.max(0, lineIndex - tolerance);
    const end = Math.min(sourceLines.length, lineIndex + tolerance);
    const modRe = new RegExp("\\b" + modifierName + "\\b");

    for (let i = start; i < end; i++) {
        const line = sourceLines[i];
        const isFuncDecl = FUNC_DECL_PREFIXES.some((p) => line.includes(p + funcName));
        if (!isFuncDecl) continue;

        // Solidity: modifiers appear in the signature (same line or next few lines)
        const signatureWindow = sourceLines
            .slice(i, Math.min(i + 5, sourceLines.length))
            .join(" ");
        if (modRe.test(signatureWindow)) {
            return true;
        }

        // Vyper: decorators like @nonreentrant('lock') appear directly above def.
        // Walk upward and stop at the first non-decorator line.
        const decoratorRe = new RegExp("@" + modifierName + "\\b");
        for (let j = i - 1; j >= Math.max(0, i - 5); j--) {
            const prev = sourceLines[j].trimStart();
            if (!prev.startsWith("@")) break;
            if (decoratorRe.test(sourceLines[j])) {
                return true;
            }
        }
    }
    return false;
}

// ---------------------------------------------------------------------------
// NatSpec / doc-comment detection
// ---------------------------------------------------------------------------

// Matches NatSpec / doc-comment interior and boundary lines
const NATSPEC_INTERIOR_RE = /^\s*(\/{3}|\/\*\*|\*[\s/]|\*$)/;
// Matches the opening line of a NatSpec block comment
const NATSPEC_BLOCK_OPEN_RE = /^\s*\/\*\*/;
// Matches a triple-slash NatSpec line
const NATSPEC_TRIPLE_SLASH_RE = /^\s*\/{3}/;

/**
 * Return true when the 1-based `line` sits inside a NatSpec / doc-comment
 * block that directly precedes `funcDeclLine` (also 1-based).
 *
 * "Directly precedes" means no blank lines between the comment end and the
 * function declaration. The comment block must be a genuine NatSpec block
 * (opened with slash-star-star or using triple-slash), not a regular block comment.
 */
function isNatSpecAboveFunction(
    sourceLines: string[],
    line: number,
    funcDeclLine: number,
): boolean {
    if (line >= funcDeclLine) return false;

    // Step 1: The line immediately above the declaration must be a comment
    // line (no blank lines allowed between comment and declaration).
    const lineAboveDecl = sourceLines[funcDeclLine - 2]; // 0-based
    if (!lineAboveDecl || !NATSPEC_INTERIOR_RE.test(lineAboveDecl.trim())) {
        return false;
    }

    // Step 2: Walk backwards from the declaration to the reported line,
    // verifying every line is a comment interior line (no blank lines).
    for (let i = funcDeclLine - 2; i >= line - 1; i--) {
        const trimmed = sourceLines[i].trim();
        if (NATSPEC_INTERIOR_RE.test(trimmed)) continue;
        return false; // blank line or non-comment breaks the chain
    }

    // Step 3: Verify the block is genuine NatSpec by finding its opener.
    // Continue walking upward from the reported line to find the start of
    // the comment block, then check it opens with `/**` or `///`.
    let openerIdx = line - 1; // 0-based index of reported line
    for (let i = openerIdx - 1; i >= 0; i--) {
        const trimmed = sourceLines[i].trim();
        if (NATSPEC_INTERIOR_RE.test(trimmed)) {
            openerIdx = i;
            continue;
        }
        break; // non-comment line — opener is at openerIdx
    }

    const openerLine = sourceLines[openerIdx].trim();
    return NATSPEC_BLOCK_OPEN_RE.test(openerLine) || NATSPEC_TRIPLE_SLASH_RE.test(openerLine);
}

// ---------------------------------------------------------------------------
// Line search helpers
// ---------------------------------------------------------------------------

function findFunctionLine(sourceLines: string[], funcName: string): number | null {
    for (let i = 0; i < sourceLines.length; i++) {
        if (FUNC_DECL_PREFIXES.some((p) => sourceLines[i].includes(p + funcName))) {
            return i + 1; // 1-based
        }
    }
    return null;
}

function isFunctionNearLine(
    sourceLines: string[],
    funcName: string,
    line: number,
    tolerance: number,
): boolean {
    const start = Math.max(0, line - 1 - tolerance);
    const end = Math.min(sourceLines.length, line - 1 + tolerance + 1);

    const funcRe = new RegExp("\\b" + funcName + "\\b");
    for (let i = start; i < end; i++) {
        if (funcRe.test(sourceLines[i])) {
            return true;
        }
    }
    return false;
}

/**
 * Search the entire file for any usage of an identifier (not just declarations).
 * Returns the first 1-based line number where the identifier appears, or null.
 * Used as a last-resort fallback when the identifier is a state variable
 * declared in a parent contract but referenced in this file.
 */
function findIdentifierUsage(sourceLines: string[], name: string): number | null {
    const re = new RegExp("\\b" + name + "\\b");
    for (let i = 0; i < sourceLines.length; i++) {
        if (re.test(sourceLines[i])) {
            return i + 1; // 1-based
        }
    }
    return null;
}

// ---------------------------------------------------------------------------
// Main verifier
// ---------------------------------------------------------------------------

const DEFAULT_TOLERANCE = 10;

/**
 * Verify findings against source code without LLM calls.
 *
 * Checks performed:
 * 1. Line number within file range
 * 2. Referenced function exists near the reported line
 * 3. Line correction when function is found at a different location
 * 4. False-positive detection for "missing modifier" claims
 */
export function verifyByCode(
    findings: Finding[],
    sourceLines: string[],
    tolerance: number = DEFAULT_TOLERANCE,
): VerifiedFinding[] {
    return findings.map((f) => {
        const result: VerifiedFinding = { ...f, verified: true };

        // No line-based checks when line is null
        if (f.line === null) {
            return result;
        }

        // Check 1: line in range
        if (f.line < 1 || f.line > sourceLines.length) {
            result.verified = false;
            result.verifyNote = `Line ${f.line} is out of range (file has ${sourceLines.length} lines)`;
            return result;
        }

        // Extract function name for deeper checks
        const funcName = extractFunctionName(f.title, f.description);

        if (funcName) {
            // Check 2: find function declaration and validate reported line
            const funcDeclLine = findFunctionLine(sourceLines, funcName);
            if (funcDeclLine === null) {
                // Function name not found as declaration — check if it appears
                // as a reference (not a declaration) near the reported line
                if (!isFunctionNearLine(sourceLines, funcName, f.line, tolerance)) {
                    // Last resort: search the entire file for any usage.
                    // The identifier may be a state variable declared in a
                    // parent contract but referenced in this file.
                    const usageLine = findIdentifierUsage(sourceLines, funcName);
                    if (usageLine !== null) {
                        result.verifyNote =
                            `"${funcName}" not declared in this file but referenced at line ${usageLine} (likely declared in parent contract)`;
                    } else {
                        result.verified = false;
                        result.verifyNote =
                            `Function "${funcName}" not found near line ${f.line} or elsewhere in file`;
                    }
                    return result;
                }
            } else if (funcDeclLine !== f.line) {
                // If the reported line is inside the NatSpec block directly
                // above the function declaration, the checker pointed at the
                // doc-comment — which is contextually correct. Skip correction.
                if (isNatSpecAboveFunction(sourceLines, f.line, funcDeclLine)) {
                    // keep f.line as-is — no correction needed
                } else {
                    result.originalLine = f.line;
                    result.line = funcDeclLine;
                    result.verifyNote = `Line corrected: ${f.line}\u2192${funcDeclLine}`;
                }
            }

            // Check 3: false-positive modifier claims
            const claimedMissing = extractClaimedMissingModifier(f.description);
            if (claimedMissing) {
                const actualLine = result.originalLine ? result.line : f.line;
                if (
                    hasModifierOnFunction(
                        sourceLines,
                        funcName,
                        claimedMissing,
                        (actualLine ?? 1) - 1,
                        tolerance,
                    )
                ) {
                    result.verified = false;
                    result.verifyNote =
                        `Claimed missing modifier "${claimedMissing}" actually exists on ${funcName}`;
                    return result;
                }
            }
        } else {
            // Fallback: check for contract/interface/library declarations
            const decl = extractDeclarationName(f.title, f.description);
            if (decl) {
                const declLine = findDeclarationLine(sourceLines, decl.name);
                if (declLine === null) {
                    if (!isDeclarationNearLine(sourceLines, decl.name, f.line, tolerance)) {
                        result.verified = false;
                        result.verifyNote =
                            `Declaration "${decl.name}" not found near line ${f.line} or elsewhere in file`;
                        return result;
                    }
                } else if (declLine !== f.line) {
                    if (isNatSpecAboveFunction(sourceLines, f.line, declLine)) {
                        // Reported line is in NatSpec above declaration — keep it
                    } else {
                        result.originalLine = f.line;
                        result.line = declLine;
                        result.verifyNote = `Line corrected: ${f.line}\u2192${declLine}`;
                    }
                }
            }
        }

        return result;
    });
}
