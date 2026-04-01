import type { Finding, VerifiedFinding } from "../providers/base.js";

// Declaration types that we can verify line numbers for
type DeclarationType = "contract" | "interface" | "library" | "abstract contract";

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
            if (nlMatch) {
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

    for (let i = start; i < end; i++) {
        const line = sourceLines[i];
        if (line.includes(`function ${funcName}`) || line.includes(`function\t${funcName}`)) {
            // Check this line and subsequent lines for multi-line signatures
            const signatureWindow = sourceLines
                .slice(i, Math.min(i + 5, sourceLines.length))
                .join(" ");
            const modRe = new RegExp("\\b" + modifierName + "\\b");
            if (modRe.test(signatureWindow)) {
                return true;
            }
        }
    }
    return false;
}

// ---------------------------------------------------------------------------
// Line search helpers
// ---------------------------------------------------------------------------

function findFunctionLine(sourceLines: string[], funcName: string): number | null {
    for (let i = 0; i < sourceLines.length; i++) {
        if (
            sourceLines[i].includes(`function ${funcName}`) ||
            sourceLines[i].includes(`function\t${funcName}`)
        ) {
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
                // Function name not found anywhere — check if it appears
                // as a reference (not a declaration) near the reported line
                if (!isFunctionNearLine(sourceLines, funcName, f.line, tolerance)) {
                    result.verified = false;
                    result.verifyNote =
                        `Function "${funcName}" not found near line ${f.line} or elsewhere in file`;
                    return result;
                }
            } else if (funcDeclLine !== f.line) {
                // Function exists but at a different line — correct it
                result.originalLine = f.line;
                result.line = funcDeclLine;
                result.verifyNote = `Line corrected: ${f.line}\u2192${funcDeclLine}`;
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
                    result.originalLine = f.line;
                    result.line = declLine;
                    result.verifyNote = `Line corrected: ${f.line}\u2192${declLine}`;
                }
            }
        }

        return result;
    });
}
