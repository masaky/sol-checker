import { Command } from "commander";
import chalk from "chalk";
import fs from "node:fs";
import { initConfig, loadConfig } from "./config.js";

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
    .action((file: string, options: { provider: string; model?: string; output?: string }) => {
        // Validate file extension
        if (!file.endsWith(".sol")) {
            console.error(chalk.red("Error: File must have a .sol extension"));
            process.exit(1);
        }

        // Check file existence
        if (!fs.existsSync(file)) {
            console.error(chalk.red(`Error: File not found: ${file}`));
            process.exit(1);
        }

        // Load config (CLI options override config values)
        const config = loadConfig();
        const provider = options.provider ?? config.llm.provider;
        const model = options.model ?? config.llm.model;

        console.log(chalk.bold("🔍 sol-checker v0.1.0"));
        console.log();
        console.log(`  File:     ${chalk.cyan(file)}`);
        console.log(`  Provider: ${chalk.cyan(provider)}`);
        console.log(`  Model:    ${chalk.cyan(model)}`);
        if (options.output) {
            console.log(`  Output:   ${chalk.cyan(options.output)}`);
        }
        console.log();
        console.log(chalk.yellow("⚠ Scan not yet implemented. Coming in Phase 3."));
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
// Parse & Run
// ---------------------------------------------------------------------------

program.parse();
