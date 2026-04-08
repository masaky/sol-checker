import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import fs from "node:fs";
import { initConfig, loadConfig } from "./config.js";
import { readSolFile, ScannerError } from "./scanner.js";
import { buildPrompt } from "./prompt.js";
import { ClaudeProvider, resolveApiKey } from "./providers/claude.js";
import { ProviderError } from "./providers/base.js";
import type { VerifiedFinding } from "./providers/base.js";
import { formatTerminal, formatMarkdown } from "./reporter.js";
import { verify } from "./verifier.js";
import { loadScore, saveScore, calculateScore, totalScore, displayScore, getScorePath } from "./score.js";

// ---------------------------------------------------------------------------
// CLI Definition
// ---------------------------------------------------------------------------

const program = new Command();

program
    .name("sol-checker")
    .description("Solidity smart contract vulnerability checker powered by LLM")
    .version("0.1.0");

// ---------------------------------------------------------------------------
// scan command
// ---------------------------------------------------------------------------

program
    .command("scan")
    .description("Scan a Solidity file for vulnerabilities")
    .argument("<file>", "Path to .sol file")
    .option("-p, --provider <provider>", "LLM provider (claude, openai)", "claude")
    .option("-m, --model <model>", "LLM model name")
    .option("-o, --output <path>", "Output report file path")
    .option("--no-verify", "Skip finding verification")
    .option("--verify-model <model>", "Model to use for verification")
    .action(async (file: string, options: {
        provider: string;
        model?: string;
        output?: string;
        verify?: boolean;
        verifyModel?: string;
    }) => {
        let spinner: ReturnType<typeof ora> | undefined;
        try {
            // 1. Read file
            const target = readSolFile(file);

            // 2. Load config
            const config = loadConfig();
            const provider = options.provider ?? config.llm.provider;
            const model = options.model ?? config.llm.model;

            console.log(chalk.bold("🔍 sol-checker v0.1.0"));
            console.log();
            console.log(`  File:     ${chalk.cyan(file)}`);
            console.log(`  Provider: ${chalk.cyan(provider)}`);
            console.log(`  Model:    ${chalk.cyan(model)}`);
            console.log();

            // 3. Check API key before calling LLM
            const apiKey = resolveApiKey(config.llm.api_key);
            if (!apiKey) {
                console.error(chalk.red("Error: No API key configured."));
                console.error();
                console.error("  Set your Anthropic API key using one of:");
                console.error(chalk.gray("    1. export ANTHROPIC_API_KEY=\"sk-ant-...\""));
                console.error(chalk.gray("    2. sol-checker init  → edit ~/.sol-checker/config.toml"));
                console.error();
                console.error(chalk.gray("  Get your key at: https://console.anthropic.com/settings/keys"));
                process.exit(1);
            }

            // 4. Build prompt
            const prompt = buildPrompt(target);

            // 5. Call LLM with spinner
            spinner = ora("Scanning for vulnerabilities...").start();
            const llm = new ClaudeProvider(apiKey, model);
            const result = await llm.scan(prompt.system, prompt.user);

            // 5b. Verify findings
            const shouldVerify = options.verify !== false && config.verify.enabled;
            let verifiedFindings = result.findings;

            if (shouldVerify && result.findings.length > 0) {
                spinner.text = "Verifying findings...";
                const verifyModel = options.verifyModel ?? (config.verify.model || model);
                const verifyProvider = new ClaudeProvider(apiKey, verifyModel);

                const verified = await verify(result.findings, target.source, {
                    enabled: true,
                    llmProvider: verifyProvider,
                    skipInfo: config.verify.skip_info,
                    lineTolerance: config.verify.line_tolerance,
                });
                verifiedFindings = verified;
            }

            const verifiedResult = { ...result, findings: verifiedFindings };
            const unverifiedCount = verifiedFindings.filter(
                (f) => "verified" in f && !(f as VerifiedFinding).verified,
            ).length;

            if (unverifiedCount > 0) {
                spinner.succeed(
                    `Scan complete — ${result.findings.length} finding(s), ${unverifiedCount} unverified`,
                );
            } else {
                spinner.succeed(`Scan complete — ${result.findings.length} finding(s)`);
            }

            // 6. Terminal output
            console.log();
            console.log(formatTerminal(verifiedResult, file));

            // 7. File output (if --output)
            if (options.output) {
                fs.writeFileSync(options.output, formatMarkdown(verifiedResult, file), "utf-8");
                console.log(chalk.green(`✔ Report saved to ${options.output}`));
            }
        } catch (err) {
            if (err instanceof ScannerError) {
                console.error(chalk.red(`Error: ${err.message}`));
                process.exit(1);
            }
            if (err instanceof ProviderError) {
                spinner?.fail("Scan failed");
                console.error(chalk.red(`LLM Error [${err.code}]: ${err.message}`));
                process.exit(1);
            }
            spinner?.fail("Scan failed");
            const msg = err instanceof Error ? err.message : String(err);
            console.error(chalk.red(`Unexpected error: ${msg}`));
            process.exit(1);
        }
    });

// ---------------------------------------------------------------------------
// init command
// ---------------------------------------------------------------------------

program
    .command("init")
    .description("Create default config file at ~/.sol-checker/config.toml")
    .action(() => {
        const result = initConfig();

        if (result.created) {
            console.log(chalk.green(`✔ Config file created: ${result.path}`));
            console.log();
            console.log("  Edit this file to set your API key:");
            console.log(chalk.gray(`  ${result.path}`));
        } else {
            console.log(chalk.yellow(`⚠ Config file already exists: ${result.path}`));
            console.log(chalk.gray("  Skipped. Delete the file first if you want to re-initialize."));
        }
    });

// ---------------------------------------------------------------------------
// score command
// ---------------------------------------------------------------------------

const scoreCmd = program
    .command("score")
    .description("Show Production Readiness Score (PRS)")
    .action(() => {
        const data = loadScore();
        displayScore(data);
    });

scoreCmd
    .command("update")
    .description("Recalculate score from report files")
    .requiredOption("--reports <dir>", "Path to reports directory")
    .requiredOption("--contracts <dir>", "Path to contracts directory")
    .option("--note <text>", "Note for this score entry", "")
    .action((options: { reports: string; contracts: string; note: string }) => {
        const breakdown = calculateScore(options.reports, options.contracts);
        const score = totalScore(breakdown);
        const tier = Math.floor(score / 15) + 1;
        const date = new Date().toISOString().slice(0, 10);

        const data = loadScore();
        data.history.push({
            date,
            score,
            tier: Math.min(tier, 7),
            breakdown,
            note: options.note,
        });
        saveScore(data);

        console.log(chalk.green(`✔ Score updated: ${score}/100`));
        console.log(chalk.gray(`  Saved to ${getScorePath()}`));
        console.log();
        displayScore(data);
    });

// ---------------------------------------------------------------------------
// Parse & Run
// ---------------------------------------------------------------------------

program.parse();
