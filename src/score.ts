import fs from "node:fs";
import path from "node:path";
import chalk from "chalk";
import { getConfigDir } from "./config.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScoreEntry {
    date: string;
    score: number;
    tier: number;
    breakdown: ScoreBreakdown;
    note: string;
}

export interface ScoreBreakdown {
    fpRate: number;        // /20 - False positive rate
    fnRate: number;        // /20 - False negative rate
    unverifiedRate: number; // /10 - UNVERIFIED rate
    multiFile: number;     // /15 - Multi-file support
    reproducibility: number; // /10 - Scan reproducibility
    benchmark: number;     // /10 - SWC coverage
    ciIntegration: number; // /10 - CI/DX
    dogfooding: number;    // /5  - Cumulative dogfooding
}

export interface ScoreData {
    history: ScoreEntry[];
}

// ---------------------------------------------------------------------------
// Tier definitions
// ---------------------------------------------------------------------------

interface TierDef {
    tier: number;
    min: number;
    max: number;
    label: string;
    personas: {
        expert: string;
        indie: string;
        enterprise: string;
        hackathon: string;
    };
}

const TIERS: TierDef[] = [
    {
        tier: 1, min: 0, max: 15,
        label: "grepにカラー付けたレベル",
        personas: {
            expert: "...これはgrepにカラー付けただけでは？",
            indie: "npm install したけどエラーで動かない。星1",
            enterprise: "社内Slackで共有する価値はないかな",
            hackathon: "手動で読んだ方が早い",
        },
    },
    {
        tier: 2, min: 16, max: 30,
        label: "おみくじ。たまに当たる",
        personas: {
            expert: "アイデアは理解できる。でも僕のインターンの方が精度高い",
            indie: "たまに当たる。おみくじ感覚で使ってる",
            enterprise: "面白いけど、これに予算は付かない",
            hackathon: "README見た。で、Slitherとの違いは？",
        },
    },
    {
        tier: 3, min: 31, max: 45,
        label: "CIに入れてみる人が出る",
        personas: {
            expert: "悪くない。ただ、これをプロダクションで使う勇気はない",
            indie: "CI に入れてみた。ノイズ多いけどたまに助かる",
            enterprise: "監査前のチェックリスト代わりにはなるかも",
            hackathon: "優勝チームが使ってたらしい",
        },
    },
    {
        tier: 4, min: 46, max: 60,
        label: "有料でもいい層が現れる",
        personas: {
            expert: "部分的には我々の一次スクリーニングと同等だ",
            indie: "有料でもいい。月$20なら払う",
            enterprise: "監査コスト2割削れた。レポートにも引用した",
            hackathon: "スポンサー賞取れた。これなしでは無理だった",
        },
    },
    {
        tier: 5, min: 61, max: 75,
        label: "監査会社が教育用に採用",
        personas: {
            expert: "うちのジュニアに使わせてる。教育にも良い",
            indie: "Slitherと併用してる。こっちの方がコンテキスト理解してる",
            enterprise: "CTOが全プロジェクトに導入決めた",
            hackathon: "もうこれ前提でコード書いてる",
        },
    },
    {
        tier: 6, min: 76, max: 90,
        label: "監査前の必須ステップ",
        personas: {
            expert: "正直、驚いた。この検出は人間でも見逃す",
            indie: "これなしでデプロイする気にならない",
            enterprise: "監査会社に『これ通してから持ってきて』と言われた",
            hackathon: "審査員が『どうやって見つけた？』と聞いてきた",
        },
    },
    {
        tier: 7, min: 91, max: 100,
        label: "伝説",
        personas: {
            expert: "我々のチームに来ないか？",
            indie: "伝説",
            enterprise: "監査レポートに『sol-checker verified』ロゴが欲しい",
            hackathon: "これ自体がハッカソンの課題になってる",
        },
    },
];

function getTier(score: number): TierDef {
    for (const t of TIERS) {
        if (score >= t.min && score <= t.max) return t;
    }
    return TIERS[TIERS.length - 1];
}

// ---------------------------------------------------------------------------
// Score file I/O
// ---------------------------------------------------------------------------

export function getScorePath(): string {
    return path.join(getConfigDir(), "score.json");
}

export function loadScore(): ScoreData {
    const p = getScorePath();
    if (!fs.existsSync(p)) {
        return { history: [] };
    }
    return JSON.parse(fs.readFileSync(p, "utf-8"));
}

export function saveScore(data: ScoreData): void {
    const dir = getConfigDir();
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(getScorePath(), JSON.stringify(data, null, 2), "utf-8");
}

// ---------------------------------------------------------------------------
// Score calculation from report directory
// ---------------------------------------------------------------------------

interface ReportStats {
    totalFindings: number;
    unverifiedFindings: number;
    reports: number;
}

function parseReportDir(reportDir: string): ReportStats {
    if (!fs.existsSync(reportDir)) {
        return { totalFindings: 0, unverifiedFindings: 0, reports: 0 };
    }

    const files = fs.readdirSync(reportDir)
        .filter(f => f.endsWith(".md"))
        .filter(f => !f.includes("rev-") && !f.includes("review-prompt") && !f.includes("counterpoint") && !f.includes("gemini"))
        .sort()
        .slice(-5); // last 5 reports

    let totalFindings = 0;
    let unverifiedFindings = 0;

    for (const file of files) {
        const content = fs.readFileSync(path.join(reportDir, file), "utf-8");
        const findings = (content.match(/###\s*\[/g) || []).length;
        const unverified = (content.match(/UNVERIFIED/g) || []).length;
        totalFindings += findings;
        unverifiedFindings += Math.min(unverified, findings);
    }

    return { totalFindings, unverifiedFindings, reports: files.length };
}

function countContracts(contractDir: string): number {
    if (!fs.existsSync(contractDir)) return 0;
    return fs.readdirSync(contractDir).filter(f => f.endsWith(".sol")).length;
}

export interface ManualCounts {
    fp?: number;      // false positive count from Codex review
    fn?: number;      // false negative (missed) count from Codex review
    total?: number;   // total findings across reviewed reports
}

export function calculateScore(reportDir: string, contractDir: string, manual?: ManualCounts): ScoreBreakdown {
    const stats = parseReportDir(reportDir);
    const contractCount = countContracts(contractDir);

    const unverifiedPct = stats.totalFindings > 0
        ? stats.unverifiedFindings / stats.totalFindings : 0;

    let fpRate: number;
    let fnRate: number;

    if (manual?.fp !== undefined && manual?.total !== undefined && manual.total > 0) {
        // Use actual FP count from manual Codex review analysis
        const fpPct = manual.fp / manual.total;
        fpRate = Math.round(20 * Math.max(0, 1 - fpPct));
    } else {
        // Fallback: estimate from UNVERIFIED rate (less accurate)
        const baseFpRate = 0.25 + (unverifiedPct * 0.15);
        fpRate = Math.round(20 * Math.max(0, 1 - baseFpRate));
    }

    if (manual?.fn !== undefined && manual?.total !== undefined && manual.total > 0) {
        // Use actual FN count: fn missed out of (total + fn) real findings
        const realTotal = manual.total + manual.fn;
        const fnPct = manual.fn / realTotal;
        fnRate = Math.round(20 * Math.max(0, 1 - fnPct));
    } else {
        const baseFnRate = 0.30;
        fnRate = Math.round(20 * (1 - baseFnRate));
    }

    // UNVERIFIED rate score
    const unverifiedScore = Math.round(10 * (1 - unverifiedPct));

    // Multi-file: 0 (not implemented)
    const multiFile = 0;

    // Reproducibility: estimate 30% (not measured)
    const reproducibility = 3;

    // Benchmark: 0 (no SWC test suite)
    const benchmark = 0;

    // CI: 1 (CLI only, npm published)
    const ciIntegration = 1;

    // Dogfooding: contractCount / 30 * 5, capped at 5
    const dogfooding = Math.min(5, Math.round(contractCount / 30 * 5));

    return {
        fpRate,
        fnRate,
        unverifiedRate: unverifiedScore,
        multiFile,
        reproducibility,
        benchmark,
        ciIntegration,
        dogfooding,
    };
}

export function totalScore(b: ScoreBreakdown): number {
    return b.fpRate + b.fnRate + b.unverifiedRate + b.multiFile
        + b.reproducibility + b.benchmark + b.ciIntegration + b.dogfooding;
}

// ---------------------------------------------------------------------------
// Display
// ---------------------------------------------------------------------------

function scoreBar(score: number, max: number = 100): string {
    const width = 30;
    const filled = Math.round((score / max) * width);
    const empty = width - filled;
    const pct = Math.round((score / max) * 100);

    let color = chalk.red;
    if (pct >= 60) color = chalk.green;
    else if (pct >= 30) color = chalk.yellow;

    return color("█".repeat(filled)) + chalk.gray("░".repeat(empty)) + ` ${score}/${max}`;
}

function miniBar(score: number, max: number): string {
    const width = 10;
    const filled = Math.round((score / max) * width);
    const empty = width - filled;
    return chalk.cyan("█".repeat(filled)) + chalk.gray("░".repeat(empty));
}

export function displayScore(data: ScoreData): void {
    if (data.history.length === 0) {
        console.log(chalk.yellow("No score data yet. Run: sol-checker score update --reports <dir> --contracts <dir>"));
        return;
    }

    const latest = data.history[data.history.length - 1];
    const tier = getTier(latest.score);
    const b = latest.breakdown;

    // Header
    console.log();
    console.log(chalk.bold("  Sol-Checker Production Readiness Score (PRS)"));
    console.log(chalk.gray(`  Last updated: ${latest.date}`));
    console.log();

    // Big score
    console.log(`  ${scoreBar(latest.score)}`);
    console.log();
    console.log(chalk.bold(`  Tier ${tier.tier}: ${tier.label}`));
    console.log();

    // Breakdown
    console.log(chalk.bold("  Breakdown"));
    console.log(chalk.gray("  ─────────────────────────────────────────"));
    console.log(`  FP rate (false positives)    ${miniBar(b.fpRate, 20)}  ${b.fpRate}/20`);
    console.log(`  FN rate (missed findings)    ${miniBar(b.fnRate, 20)}  ${b.fnRate}/20`);
    console.log(`  UNVERIFIED rate              ${miniBar(b.unverifiedRate, 10)}  ${b.unverifiedRate}/10`);
    console.log(`  Multi-file support           ${miniBar(b.multiFile, 15)}  ${b.multiFile}/15`);
    console.log(`  Reproducibility              ${miniBar(b.reproducibility, 10)}  ${b.reproducibility}/10`);
    console.log(`  SWC benchmark                ${miniBar(b.benchmark, 10)}  ${b.benchmark}/10`);
    console.log(`  CI integration               ${miniBar(b.ciIntegration, 10)}  ${b.ciIntegration}/10`);
    console.log(`  Dogfooding progress          ${miniBar(b.dogfooding, 5)}  ${b.dogfooding}/5`);
    console.log();

    // Persona reactions
    console.log(chalk.bold("  What they're saying"));
    console.log(chalk.gray("  ─────────────────────────────────────────"));
    console.log(`  ${chalk.red("🎓")} Expert:     ${chalk.italic(`"${tier.personas.expert}"`)}`);
    console.log(`  ${chalk.blue("👨‍💻")} Indie dev:  ${chalk.italic(`"${tier.personas.indie}"`)}`);
    console.log(`  ${chalk.yellow("🏢")} Enterprise: ${chalk.italic(`"${tier.personas.enterprise}"`)}`);
    console.log(`  ${chalk.green("🏃")} Hackathon:  ${chalk.italic(`"${tier.personas.hackathon}"`)}`);
    console.log();

    // History (last 5)
    if (data.history.length > 1) {
        console.log(chalk.bold("  History"));
        console.log(chalk.gray("  ─────────────────────────────────────────"));
        const recent = data.history.slice(-5);
        for (const entry of recent) {
            const t = getTier(entry.score);
            const delta = data.history.indexOf(entry) > 0
                ? entry.score - data.history[data.history.indexOf(entry) - 1].score
                : 0;
            const deltaStr = delta > 0 ? chalk.green(` +${delta}`) : delta < 0 ? chalk.red(` ${delta}`) : "";
            console.log(`  ${entry.date}  ${chalk.bold(String(entry.score).padStart(3))}${deltaStr}  Tier ${t.tier}  ${entry.note}`);
        }
        console.log();
    }

    // Next tier hint
    const nextTier = TIERS.find(t => t.tier === tier.tier + 1);
    if (nextTier) {
        const gap = nextTier.min - latest.score;
        console.log(chalk.gray(`  Next tier (${nextTier.tier}: ${nextTier.label}) in ${gap} points`));
        console.log();
    }
}
