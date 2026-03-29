import chalk from "chalk";
import type { ScanResult, Finding, Severity, VerifiedFinding } from "./providers/base.js";

// ---------------------------------------------------------------------------
// Severity helpers
// ---------------------------------------------------------------------------

const SEVERITY_ORDER: Severity[] = ["HIGH", "MEDIUM", "LOW", "INFO"];

const SEVERITY_COLOR: Record<Severity, (s: string) => string> = {
    HIGH: chalk.red,
    MEDIUM: chalk.yellow,
    LOW: chalk.blue,
    INFO: chalk.gray,
};

function sortFindings(findings: Finding[]): Finding[] {
    return [...findings].sort(
        (a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity)
    );
}

function countBySeverity(findings: Finding[]): Record<Severity, number> {
    const counts: Record<Severity, number> = { HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 };
    for (const f of findings) counts[f.severity]++;
    return counts;
}

function isVerifiedFinding(f: Finding): f is VerifiedFinding {
    return "verified" in f;
}

function countByVerification(findings: Finding[]): { verified: number; unverified: number } {
    let verified = 0;
    let unverified = 0;
    for (const f of findings) {
        if (isVerifiedFinding(f) && !f.verified) {
            unverified++;
        } else {
            verified++;
        }
    }
    return { verified, unverified };
}

function hasVerificationData(findings: Finding[]): boolean {
    return findings.some((f) => isVerifiedFinding(f));
}

// ---------------------------------------------------------------------------
// formatTerminal
// ---------------------------------------------------------------------------

export function formatTerminal(result: ScanResult, filePath: string): string {
    const lines: string[] = [];

    lines.push(chalk.bold("Sol-Checker Report"));
    lines.push(`File:     ${filePath}`);
    lines.push(`Provider: ${result.provider} (${result.model})`);
    lines.push("");

    if (result.findings.length === 0) {
        lines.push(chalk.green("✔ No vulnerabilities found."));
        return lines.join("\n");
    }

    // Summary
    const counts = countBySeverity(result.findings);
    lines.push(chalk.bold("Summary"));
    for (const sev of SEVERITY_ORDER) {
        if (counts[sev] > 0) {
            lines.push(`  ${SEVERITY_COLOR[sev](sev)}: ${counts[sev]}`);
        }
    }
    lines.push("");

    // Findings
    lines.push(chalk.bold("Findings"));
    lines.push("");

    for (const f of sortFindings(result.findings)) {
        const tag = SEVERITY_COLOR[f.severity](`[${f.severity}]`);
        lines.push(`${tag} ${f.title}`);

        if (isVerifiedFinding(f)) {
            const vf = f;
            if (vf.originalLine !== undefined) {
                lines.push(`  Line: ${vf.line} (corrected from ${vf.originalLine})`);
            } else if (vf.line !== null) {
                lines.push(`  Line: ${vf.line}`);
            }
            if (!vf.verified) {
                lines.push(chalk.yellow(`  ⚠ UNVERIFIED — ${vf.verifyNote ?? "Verification failed"}`));
                if (vf.originalSeverity) {
                    lines.push(chalk.yellow(`  ⚠ Original severity: ${vf.originalSeverity} → ${vf.severity}`));
                }
            }
        } else {
            if (f.line !== null) lines.push(`  Line: ${f.line}`);
        }

        lines.push(`  ${f.description}`);
        lines.push(`  Impact: ${f.impact}`);
        lines.push(`  Fix: ${f.fix}`);
        lines.push("");
    }

    return lines.join("\n");
}

// ---------------------------------------------------------------------------
// formatMarkdown
// ---------------------------------------------------------------------------

export function formatMarkdown(result: ScanResult, filePath: string): string {
    const lines: string[] = [];
    const date = new Date().toISOString().split("T")[0];

    lines.push("# Sol-Checker Report");
    lines.push(`**File:** ${filePath}`);
    lines.push(`**Date:** ${date}`);
    lines.push(`**Provider:** ${result.provider} (${result.model})`);
    lines.push("");

    if (result.findings.length === 0) {
        lines.push("No vulnerabilities found.");
        return lines.join("\n");
    }

    // Summary table
    const counts = countBySeverity(result.findings);
    const showVerification = hasVerificationData(result.findings);

    lines.push("## Summary");
    if (showVerification) {
        lines.push("| Severity | Count | Verified | Unverified |");
        lines.push("|----------|-------|----------|------------|");
        for (const sev of SEVERITY_ORDER) {
            if (counts[sev] > 0) {
                const sevFindings = result.findings.filter((f) => f.severity === sev);
                const vc = countByVerification(sevFindings);
                lines.push(`| ${sev} | ${counts[sev]} | ${vc.verified} | ${vc.unverified} |`);
            }
        }
    } else {
        lines.push("| Severity | Count |");
        lines.push("|----------|-------|");
        for (const sev of SEVERITY_ORDER) {
            if (counts[sev] > 0) {
                lines.push(`| ${sev} | ${counts[sev]} |`);
            }
        }
    }
    lines.push("");

    // Findings
    lines.push("## Findings");
    lines.push("");

    for (const f of sortFindings(result.findings)) {
        if (isVerifiedFinding(f) && !f.verified && f.originalSeverity) {
            lines.push(`### [${f.severity}] ~~[${f.originalSeverity}]~~ ${f.title}`);
        } else {
            lines.push(`### [${f.severity}] ${f.title}`);
        }

        if (isVerifiedFinding(f)) {
            const vf = f;
            if (vf.originalLine !== undefined) {
                lines.push(`**Line:** ${vf.line} *(corrected from ${vf.originalLine})*`);
            } else if (vf.line !== null) {
                lines.push(`**Line:** ${vf.line}`);
            }
            if (!vf.verified) {
                lines.push(`**⚠ UNVERIFIED:** ${vf.verifyNote ?? "Verification failed"}`);
            }
        } else {
            if (f.line !== null) lines.push(`**Line:** ${f.line}`);
        }

        lines.push(`**Description:** ${f.description}`);
        lines.push(`**Impact:** ${f.impact}`);
        lines.push(`**Fix:** ${f.fix}`);
        lines.push("");
    }

    return lines.join("\n");
}
